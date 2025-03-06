"use strict";
// __tests__/contractValidator.test.ts
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const contractValidator_1 = __importStar(require("../src/contractValidator"));
const axios_1 = __importDefault(require("axios"));
// Mock axios to control API responses for testing.
jest.mock('axios');
const mockedAxios = axios_1.default;
describe('ContractValidator Module', () => {
    let validator;
    const testAddress = 'TestTokenAddress';
    beforeEach(() => {
        validator = new contractValidator_1.default();
    });
    afterEach(() => {
        // Clean up resources.
        validator.shutdown();
        jest.clearAllMocks();
    });
    test('validateContract returns LOW risk when inputs are benign', async () => {
        // Provide valid contract code.
        mockedAxios.get.mockImplementationOnce(() => Promise.resolve({ data: { program: 'Valid contract code' } }));
        // Provide a low holder percentage.
        mockedAxios.get.mockImplementationOnce(() => Promise.resolve({ data: { data: [{ percent: '10' }] } }));
        // For liquidity, override to simulate locked liquidity.
        validator.getLiquidityMetrics = jest.fn(() => Promise.resolve({ locked: true, totalLiquidity: 100000 }));
        const result = await validator.validateContract(testAddress);
        // With benign inputs, expect a low risk.
        expect(result.risk).toBe(contractValidator_1.RiskLevel.LOW);
        expect(result.score).toBeLessThan(30);
    });
    test('validateContract returns CRITICAL risk when contract code is empty', async () => {
        // Simulate empty contract code.
        mockedAxios.get.mockImplementationOnce(() => Promise.resolve({ data: { program: '' } }));
        // Provide a benign holder distribution.
        mockedAxios.get.mockImplementationOnce(() => Promise.resolve({ data: { data: [{ percent: '10' }] } }));
        // Override liquidity metrics.
        validator.getLiquidityMetrics = jest.fn(() => Promise.resolve({ locked: true, totalLiquidity: 100000 }));
        const result = await validator.validateContract(testAddress);
        // Expect a CRITICAL risk immediately if contract code is empty.
        expect(result.risk).toBe(contractValidator_1.RiskLevel.CRITICAL);
        expect(result.score).toBe(100);
        expect(result.warnings).toMatch(/Contract code is empty/);
    });
    test('getHolderDistribution returns correct percentage', async () => {
        // Simulate a holder distribution response.
        const holderResponse = { data: { data: [{ percent: '45' }] } };
        mockedAxios.get.mockImplementationOnce(() => Promise.resolve(holderResponse));
        const holderPercent = await validator.getHolderDistribution(testAddress);
        expect(holderPercent).toBe(45);
    });
});
