import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { JupiterDex } from '../dex/jupiterDex';
import { LiveOrderExecution } from '../orderExecution';

// Test tokens (mainnet)
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const BONK_MINT = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
const SOL_MINT = 'So11111111111111111111111111111111111111112';

describe('Jupiter DEX Integration Tests', () => {
    let connection: Connection;
    let wallet: Keypair;
    let jupiterDex: JupiterDex;
    let orderExecution: LiveOrderExecution;

    beforeAll(async () => {
        // Initialize connection and wallet
        connection = new Connection('https://api.mainnet-beta.solana.com');
        wallet = Keypair.generate(); // For testing only
        jupiterDex = new JupiterDex(connection, wallet);
        orderExecution = new LiveOrderExecution(connection, wallet);

        await jupiterDex.initialize();
    });

    describe('Quote Tests', () => {
        it('should get valid quote for USDC -> BONK', async () => {
            const quote = await jupiterDex.getQuote(
                USDC_MINT,
                BONK_MINT,
                100, // 100 USDC
                100 // 1% slippage
            );

            expect(quote).not.toBeNull();
            if (quote) {
                expect(quote.outAmount).toBeGreaterThan(0);
                expect(quote.price).toBeGreaterThan(0);
                expect(quote.priceImpactPct).toBeLessThan(5);
            }
        });

        it('should handle invalid token addresses', async () => {
            const quote = await jupiterDex.getQuote(
                'invalid_mint',
                BONK_MINT,
                100,
                100
            );

            expect(quote).toBeNull();
        });

        it('should respect slippage limits', async () => {
            const quote = await jupiterDex.getQuote(
                USDC_MINT,
                SOL_MINT,
                10000, // Large amount to test slippage
                50 // 0.5% slippage
            );

            expect(quote).not.toBeNull();
            if (quote) {
                expect(quote.priceImpactPct).toBeLessThan(5);
            }
        });
    });

    describe('Swap Tests', () => {
        it('should handle insufficient balance', async () => {
            const result = await jupiterDex.executeSwap(
                USDC_MINT,
                BONK_MINT,
                1000000, // Very large amount
                100
            );

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });

        it('should handle high price impact', async () => {
            const result = await jupiterDex.executeSwap(
                USDC_MINT,
                BONK_MINT,
                100000, // Large amount to trigger price impact
                100
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('Price impact too high');
        });
    });

    describe('Balance Tests', () => {
        it('should return 0 for non-existent token accounts', async () => {
            const balance = await jupiterDex.getTokenBalance(BONK_MINT);
            expect(balance).toBe(0);
        });

        it('should handle invalid token addresses', async () => {
            const balance = await jupiterDex.getTokenBalance('invalid_mint');
            expect(balance).toBe(0);
        });
    });
});
