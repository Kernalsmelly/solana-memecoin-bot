import { describe, it, expect, vi } from 'vitest';
vi.mock('../../../src/utils/logger', () => import('../mocks/mockLogger'));
import { EventEmitter } from 'events';
import { PatternDetector } from '../../../src/strategy/patternDetector';
import DryRunOrderExecution from '../../../src/orderExecution/index';
// Mock TokenDiscovery as an EventEmitter
class MockTokenDiscovery extends EventEmitter {
    emitToken(token) {
        this.emit('newToken', token);
    }
}
describe('E2E: discover → pattern → execute loop', () => {
    it('detects pattern, simulates swap, and records trade in risk manager', async () => {
        // Step 1: Set up mocks and pipeline
        const mockRiskManager = {
            recordTrade: vi.fn(),
            getAccountBalance: () => ({ availableCash: 1000, allocatedCash: 0, totalValue: 1000 }),
            config: {
                maxPositionValueUsd: 100,
                minPositionValueUsd: 10,
                maxLiquidityPercent: 0.05,
            },
            canOpenPosition: () => true,
        };
        const tokenDiscovery = new MockTokenDiscovery();
        const detector = new PatternDetector({
            tokenDiscovery,
            riskManager: mockRiskManager,
            maxTokenAge: 48,
            minLiquidity: 1000,
            maxPositionValue: 100,
        });
        const dryRunExec = new DryRunOrderExecution(mockRiskManager);
        // Step 2: Wire up event chain
        let patternSignal = null;
        detector.on('patternDetected', (signal) => {
            patternSignal = signal;
            // Simulate passing signal to order execution
            dryRunExec.executeSwap({
                inputMint: 'So11111111111111111111111111111111111111112',
                outputMint: 'USDC111111111111111111111111111111111111111',
                amountIn: 1000,
                userPublicKey: 'user111',
                meta: { signal },
            });
        });
        // Step 3: Emit a token that will trigger a volatility squeeze
        const prices = Array(19).fill(100).concat([106]);
        const token = {
            symbol: 'SQUEEZED',
            address: 'token1',
            age: 5,
            liquidity: 100000,
            price: 105,
            priceChange24h: 100,
            volumeChange24h: 100,
            buyRatio: 10,
            priceHistory: prices,
        };
        tokenDiscovery.emitToken(token);
        // Step 4: Wait for async chain
        await new Promise((res) => setTimeout(res, 50));
        // Step 5: Assertions
        expect(patternSignal).toBeTruthy();
        expect(patternSignal.pattern).toBe('Volatility Squeeze');
        expect(mockRiskManager.recordTrade).toHaveBeenCalled();
        const metaArg = mockRiskManager.recordTrade.mock.calls[0][1];
        expect(metaArg).toMatchObject({ action: 'dryRunSwap', user: 'user111' });
    });
});
//# sourceMappingURL=discover-pattern-execute.test.js.map