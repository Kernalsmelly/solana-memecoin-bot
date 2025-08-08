import { vi, describe, test, expect } from 'vitest';
vi.mock('../utils/logger', () => import('../mocks/mockLogger'));
import { ContractValidator } from '../utils/contractValidator';
describe('ContractValidator', () => {
    const dummyConnection = {};
    test('returns a result object for a known token', async () => {
        const validator = new ContractValidator(dummyConnection);
        const result = await validator.validateContract('So11111111111111111111111111111111111111112');
        expect(result).toHaveProperty('isValid');
        expect(result).toHaveProperty('risks');
    });
    test('handles obviously invalid token gracefully', async () => {
        const validator = new ContractValidator(dummyConnection);
        const result = await validator.validateContract('Scam111111111111111111111111111111111111111');
        expect(result).toHaveProperty('isValid');
        expect(result).toHaveProperty('risks');
    });
});
//# sourceMappingURL=contractValidator.test.js.map