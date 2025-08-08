import { vi } from 'vitest';
vi.mock('../../src/utils/logger.js', () => import('../mocks/mockLogger'));
import { TokenDiscovery } from '../discovery/tokenDiscovery';
describe('TokenDiscovery', () => {
    it('respects MIN_LIQUIDITY_USD env var', async () => {
        process.env.MIN_LIQUIDITY_USD = '12345';
        const discovery = new TokenDiscovery();
        // @ts-ignore
        expect(discovery.MIN_LIQUIDITY).toBe(12345);
        delete process.env.MIN_LIQUIDITY_USD;
    });
    it.skip('emits TEST_TARGET_TOKEN after fallback delay if no real tokens (timer-based, skip in CI)', () => {
        // Timer-based test is skipped for CI compatibility.
    });
});
//# sourceMappingURL=tokenDiscovery.test.js.map