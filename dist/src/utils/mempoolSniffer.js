import { PublicKey, } from '@solana/web3.js';
import EventEmitter from 'events';
// Raydium, Orca, SPL Token program IDs (fill out as needed)
const SPL_TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const RAYDIUM_LP_PROGRAM_ID = new PublicKey('RVKd61ztZW9GdKzHjYxwQGd2bLkGJbXzjJz5kL6hE4z'); // Example
function hasAccounts(ix) {
    return Array.isArray(ix.accounts);
}
export class MempoolSniffer extends EventEmitter {
    connection;
    running = false;
    constructor(connection) {
        super();
        this.connection = connection;
    }
    async start() {
        this.running = true;
        // Subscribe to confirmed transactions
        this.connection.onLogs('all', async (logs, ctx) => {
            if (!this.running)
                return;
            // Parse logs for initializeMint and LP add instructions
            try {
                const tx = await this.connection.getParsedTransaction(logs.signature, {
                    commitment: 'confirmed',
                });
                if (!tx)
                    return;
                for (const ix of tx.transaction.message.instructions) {
                    // SPL Token: initializeMint
                    if (ix.programId.equals(SPL_TOKEN_PROGRAM_ID) &&
                        ix.parsed?.type === 'initializeMint' &&
                        hasAccounts(ix)) {
                        const mintAddress = ix.accounts[0] || '';
                        this.emit('mintDetected', mintAddress, tx);
                    }
                    // Raydium/Orca: LP add (pseudo)
                    if (ix.programId.equals(RAYDIUM_LP_PROGRAM_ID) &&
                        ix.parsed?.type === 'addLiquidity' &&
                        hasAccounts(ix)) {
                        // Find mint address from accounts (pseudo, real parsing may differ)
                        const mintAddress = ix.accounts[1] || '';
                        this.emit('lpAddDetected', ix.accounts[0] || '', mintAddress, tx);
                    }
                }
            }
            catch (e) {
                // Ignore parse errors
            }
        }, 'confirmed');
    }
    stop() {
        this.running = false;
    }
}
//# sourceMappingURL=mempoolSniffer.js.map