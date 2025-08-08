import { PublicKey } from '@solana/web3.js';
import { EventEmitter } from 'events';
import logger from '../utils/logger.js';
export class WhaleSignalDetector extends EventEmitter {
    connection;
    options;
    recentSignals = new Map(); // tokenMint -> signal timestamp
    subscriptionId = null;
    constructor(connection, options) {
        super();
        this.connection = connection;
        this.options = options;
    }
    async start() {
        try {
            // Subscribe to SPL Token program events
            this.subscriptionId = await this.connection.onProgramAccountChange(new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'), (accountInfo, context) => {
                this.processAccountChange(accountInfo, context);
            }, 'confirmed');
            logger.info('[WhaleSignalDetector] Started monitoring SPL token transfers');
        }
        catch (error) {
            logger.error('[WhaleSignalDetector] Failed to start:', error);
            throw error;
        }
    }
    async stop() {
        if (this.subscriptionId !== null) {
            await this.connection.removeProgramAccountChangeListener(this.subscriptionId);
            this.subscriptionId = null;
            logger.info('[WhaleSignalDetector] Stopped monitoring SPL token transfers');
        }
    }
    processAccountChange(accountInfo, context) {
        // Check if this is a USDC transfer
        if (accountInfo.account.data.toString() !== this.options.usdcMint) {
            return;
        }
        // Parse the transfer amount from the account data
        const transferAmount = this.parseTransferAmount(accountInfo.account.data);
        if (!transferAmount) {
            return;
        }
        // Check if this is a whale transfer
        if (transferAmount >= this.options.whaleThresholdUsdc) {
            const tokenMint = this.extractTokenMint(accountInfo.account.data);
            if (tokenMint) {
                this.handleWhaleSignal(tokenMint, transferAmount);
            }
        }
    }
    parseTransferAmount(data) {
        try {
            // Parse the transfer amount from the SPL Token program data
            // This is a simplified version - in production you'd use the actual SPL Token program parser
            const amount = Number(data.readBigInt64LE(0)) / 1e6; // Convert to USDC
            return Number(amount);
        }
        catch (error) {
            logger.warn('[WhaleSignalDetector] Failed to parse transfer amount:', error);
            return null;
        }
    }
    extractTokenMint(data) {
        try {
            // Parse the token mint from the SPL Token program data
            // This is a simplified version - in production you'd use the actual SPL Token program parser
            const tokenMint = data.toString('hex', 32, 64);
            return tokenMint;
        }
        catch (error) {
            logger.warn('[WhaleSignalDetector] Failed to extract token mint:', error);
            return null;
        }
    }
    handleWhaleSignal(tokenMint, amount) {
        // Record the signal
        this.recentSignals.set(tokenMint, Date.now());
        // Emit the whale signal event
        this.emit('whaleSignal', {
            tokenMint,
            amount,
            timestamp: Date.now(),
            windowEnd: Date.now() + this.options.whaleWindowSec * 1000,
        });
        // Log the event
        logger.info(`[WhaleSignalDetector] Whale signal detected: ${tokenMint} received ${amount} USDC`);
    }
    hasRecentSignal(tokenMint) {
        const lastSignal = this.recentSignals.get(tokenMint);
        if (!lastSignal)
            return false;
        const windowEnd = lastSignal + this.options.whaleWindowSec * 1000;
        return Date.now() < windowEnd;
    }
}
//# sourceMappingURL=whaleDetector.js.map