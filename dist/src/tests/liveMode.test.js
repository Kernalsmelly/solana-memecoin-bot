import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isLiveMode, __resetLiveModeCache } from '../utils/liveMode';
import { MockSigner, EnvVarSigner } from '../orderExecution/signer';
vi.mock('dotenv', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        default: { config: vi.fn() },
        config: vi.fn(),
    };
});
describe('Live Mode Toggle', () => {
    beforeEach(() => {
        // Reset the cached _liveMode value in isLiveMode module
        __resetLiveModeCache();
    });
    it('returns false when LIVE_MODE is not set or false', () => {
        process.env.LIVE_MODE = 'false';
        expect(isLiveMode()).toBe(false);
        process.env.LIVE_MODE = undefined;
        expect(isLiveMode()).toBe(false);
    });
    it('returns true when LIVE_MODE is true or 1', () => {
        process.env.LIVE_MODE = 'true';
        expect(isLiveMode()).toBe(true);
        process.env.LIVE_MODE = '1';
        expect(isLiveMode()).toBe(true);
    });
});
describe('Signer abstraction', () => {
    it('MockSigner returns fake signature', async () => {
        const signer = new MockSigner();
        const sig = await signer.signAndSendTransaction({}, {});
        expect(sig.startsWith('mock_signature_')).toBe(true);
    });
    it('EnvVarSigner throws if no key', () => {
        process.env.SOLANA_PRIVATE_KEY = '';
        expect(() => new EnvVarSigner()).toThrow();
    });
});
//# sourceMappingURL=liveMode.test.js.map