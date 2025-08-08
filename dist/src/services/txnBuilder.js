import { Transaction, ComputeBudgetProgram, } from '@solana/web3.js';
import logger from '../utils/logger.js';
// Stub Prometheus metrics for compatibility
const Prometheus = {
    registerCounter: (..._args) => ({ inc: (..._a) => { } }),
    registerHistogram: (..._args) => ({ observe: (..._a) => { } }),
};
// Prometheus metrics for transaction performance
const priorityFeeSaves = Prometheus.registerCounter('priority_fee_saves_total', 'Number of priority fee saves');
const txSendLatency = Prometheus.registerHistogram('tx_send_latency_ms', 'Transaction send latency in milliseconds');
export class TxnBuilder {
    constructor(connection, options = {}) {
        this.connection = connection;
        // Priority fee: options > env > default
        let envFee = Number(process.env.FEE_PRIORITY);
        if (isNaN(envFee))
            envFee = 0.0002;
        this.options = {
            priorityFee: typeof options.priorityFee === 'number' && !isNaN(options.priorityFee)
                ? options.priorityFee
                : typeof envFee === 'number' && envFee > 0
                    ? envFee
                    : 0.0002,
            maxRetries: options.maxRetries ?? 3,
            retryDelayMs: options.retryDelayMs ?? 500,
        };
    }
    connection;
    options;
    lastPriorityFee = 0;
    // In-memory template store: { [poolKey]: { buy: Transaction, sell: Transaction } }
    txTemplates = {};
    get priorityFee() {
        return this.options.priorityFee;
    }
    /**
     * Build and sign a transaction template for a pool and type ('buy' or 'sell').
     * Placeholders: amount/price/fee are set as dummy values, to be replaced at send time.
     * Stores the template in memory for later fast execution.
     */
    async buildTemplateTx(poolInfo, type, signers) {
        // poolInfo should have required fields: poolKey, inputMint, outputMint, etc.
        const { poolKey, inputMint, outputMint } = poolInfo;
        // Dummy placeholder values
        const placeholderAmount = 1;
        const placeholderFee = this.options.priorityFee;
        // Build instructions (user should adapt to actual DEX)
        const instructions = [
        // Example: ComputeBudgetProgram.setComputeUnitPrice({ microLamports: Math.floor(placeholderFee * 1e9) }),
        // ... add DEX-specific swap instructions here, using placeholderAmount ...
        ];
        const { blockhash } = await this.connection.getLatestBlockhash();
        const tx = new Transaction({
            feePayer: signers[0]?.publicKey,
            recentBlockhash: blockhash,
        });
        tx.add(...instructions);
        tx.sign(...signers);
        // Store template
        if (!this.txTemplates[poolKey])
            this.txTemplates[poolKey] = {};
        this.txTemplates[poolKey][type] = tx;
        logger.info(`[TxnBuilder] Built ${type} template for pool ${poolKey}`);
    }
    /**
     * Fill and send a pre-built transaction template for a pool and type.
     * Replaces placeholders with actual amount/fee, signs if needed, and broadcasts.
     */
    async fillAndSendTemplateTx(poolKey, type, amount, fee, signers) {
        const template = this.txTemplates[poolKey]?.[type];
        if (!template)
            throw new Error(`No ${type} template found for pool ${poolKey}`);
        // Clone and patch the template (deep copy recommended)
        const tx = Transaction.from(template.serialize({ requireAllSignatures: false }));
        // TODO: Replace dummy instruction data with real amount/fee (depends on DEX instruction layout)
        // For now, just update compute unit price if present
        for (let i = 0; i < tx.instructions.length; i++) {
            const ix = tx.instructions[i];
            if (ix.programId.equals(ComputeBudgetProgram.programId)) {
                // Patch compute unit price
                ix.data = ComputeBudgetProgram.setComputeUnitPrice({
                    microLamports: Math.floor(fee * 1e9),
                }).data;
            }
            // Patch DEX swap instruction for amount here if needed...
        }
        tx.sign(...signers);
        const signature = await this.connection.sendTransaction(tx, signers);
        logger.info(`[TxnBuilder] Sent filled ${type} template for pool ${poolKey}, sig: ${signature}`);
        return signature;
    }
    async buildAndSend(instructions, signers, blockhash) {
        try {
            // Get latest blockhash if not provided
            const { blockhash: latestBlockhash } = blockhash
                ? { blockhash }
                : await this.connection.getLatestBlockhash();
            // Create transaction
            const tx = new Transaction({
                feePayer: signers[0]?.publicKey ?? undefined,
                recentBlockhash: latestBlockhash,
            });
            // Add compute budget instruction with priority fee
            tx.add(ComputeBudgetProgram.setComputeUnitPrice({
                microLamports: Math.floor(this.options.priorityFee * 1e9),
            }));
            // Add main instructions
            tx.add(...instructions);
            // Sign transaction
            tx.sign(...signers);
            // Send transaction with priority
            const startTime = Date.now();
            const signature = await this.connection.sendTransaction(tx, signers);
            const endTime = Date.now();
            const latencyMs = endTime - startTime;
            txSendLatency.observe(latencyMs);
            await this.adjustPriorityFee(latencyMs);
            Prometheus.registerCounter('priority_fee_adjustments_total', 'Number of priority fee adjustments').inc();
            logger.info(`[TxnBuilder] Called adjustPriorityFee with latency ${latencyMs}ms after send/confirm.`);
            if (latencyMs > 2000) {
                Prometheus.registerCounter('congestion_events_total', 'Number of congestion events detected').inc();
                logger.warn(`[TxnBuilder] Congestion event detected (latency ${latencyMs}ms)`);
            }
            // Confirm transaction with retries
            let confirmed = false;
            let retries = 0;
            while (!confirmed && retries < this.options.maxRetries) {
                try {
                    const confirmation = await this.connection.confirmTransaction(signature);
                    // Type guard for confirmation result
                    confirmed = Boolean(confirmation && confirmation.value && confirmation.value.err === null);
                }
                catch (error) {
                    retries++;
                    await new Promise((resolve) => setTimeout(resolve, this.options.retryDelayMs));
                }
            }
            if (!confirmed) {
                throw new Error('Transaction failed to confirm after retries');
            }
            // Track priority fee usage
            if (this.lastPriorityFee < this.options.priorityFee) {
                priorityFeeSaves.inc();
                this.lastPriorityFee = this.options.priorityFee;
            }
            return signature;
        }
        catch (error) {
            logger.error('[TxnBuilder] Transaction failed:', error);
            throw error;
        }
    }
    async adjustPriorityFee(currentLatency) {
        // Adjust priority fee based on current network latency
        const baseFee = Number(process.env.FEE_PRIORITY) || 0.0002;
        const minFee = baseFee * 0.5;
        const maxFee = baseFee * 2;
        // Simple latency-based adjustment
        const targetLatency = 20; // Target 20ms latency
        const adjustment = Math.min(1, Math.max(0, (currentLatency - targetLatency) / 100));
        const newFee = baseFee * (1 + adjustment);
        // Clamp between min and max
        const adjustedFee = Math.max(minFee, Math.min(maxFee, newFee));
        // Only update if significant change
        if (Math.abs(adjustedFee - this.options.priorityFee) > 0.00001) {
            logger.info(`[TxnBuilder] Adjusting priority fee: ${this.options.priorityFee} → ${adjustedFee}`);
            this.options.priorityFee = adjustedFee;
        }
    }
}
//# sourceMappingURL=txnBuilder.js.map