import fs from 'fs';
import path from 'path';
import * as treasury from '../treasury';
import { USDC_MINT } from '../utils/baseCurrency';
import { vi } from 'vitest';
import { fetchJupiterQuote } from './jupiterQuote';
import JupiterOrderExecution from './jupiterOrderExecution';
vi.mock('./jupiterQuote.ts', () => ({
    fetchJupiterQuote: vi.fn().mockResolvedValue({
        inAmount: 1e9, // 1 SOL
        outAmount: 1000000, // 1 USDC (6 decimals)
        price: 1,
        route: { dummy: true },
        tx: {},
    }),
}));
vi.mock('./jupiterOrderExecution.ts', () => ({
    __esModule: true,
    default: vi.fn().mockImplementation(() => ({
        executeSwap: vi.fn().mockResolvedValue({ success: true }),
    })),
}));
describe('Treasury Profit Auto-Swap Integration', () => {
    const treasuryPath = path.join(__dirname, '../../data/treasury.json');
    beforeEach(() => {
        if (fs.existsSync(treasuryPath))
            fs.unlinkSync(treasuryPath);
        process.env.BASE_CURRENCY = 'USDC';
    });
    it('records profit after simulated swap', async () => {
        const netPnL = 1; // 1 SOL
        const solProceeds = netPnL;
        const quote = await fetchJupiterQuote({
            inputMint: 'So11111111111111111111111111111111111111112',
            outputMint: USDC_MINT,
            amount: Math.floor(solProceeds * 1e9),
            slippageBps: 50,
        });
        expect(quote).toBeTruthy();
        const orderExec = new JupiterOrderExecution({}, {});
        const swapResult = await orderExec.executeSwap({
            inputMint: 'So11111111111111111111111111111111111111112',
            outputMint: USDC_MINT,
            amountIn: Math.floor(solProceeds * 1e9),
            slippageBps: 50,
            userPublicKey: 'dummy',
            meta: { autoTreasury: true },
        });
        expect(swapResult.success).toBe(true);
        treasury.recordProfit(quote.outAmount / 1e6);
        const treasuryObj = JSON.parse(fs.readFileSync(treasuryPath, 'utf8'));
        expect(treasuryObj.balance).toBeCloseTo(1, 5);
    });
});
//# sourceMappingURL=treasurySwap.integration.test.js.map