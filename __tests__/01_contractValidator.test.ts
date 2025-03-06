// __tests__/contractValidator.test.ts

import ContractValidator, { RiskLevel, RugAnalysis } from '../src/contractValidator';
import axios from 'axios';

// Mock axios to control API responses for testing.
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ContractValidator Module', () => {
  let validator: ContractValidator;
  const testAddress = 'TestTokenAddress';

  beforeEach(() => {
    validator = new ContractValidator();
  });

  afterEach(() => {
    // Clean up resources.
    validator.shutdown();
    jest.clearAllMocks();
  });

  test('validateContract returns LOW risk when inputs are benign', async () => {
    // Provide valid contract code.
    mockedAxios.get.mockImplementationOnce(() =>
      Promise.resolve({ data: { program: 'Valid contract code' } })
    );
    // Provide a low holder percentage.
    mockedAxios.get.mockImplementationOnce(() =>
      Promise.resolve({ data: { data: [{ percent: '10' }] } })
    );
    // For liquidity, override to simulate locked liquidity.
    (validator as any).getLiquidityMetrics = jest.fn(() => Promise.resolve({ locked: true, totalLiquidity: 100000 }));

    const result: RugAnalysis = await validator.validateContract(testAddress);
    
    // With benign inputs, expect a low risk.
    expect(result.risk).toBe(RiskLevel.LOW);
    expect(result.score).toBeLessThan(30);
  });

  test('validateContract returns CRITICAL risk when contract code is empty', async () => {
    // Simulate empty contract code.
    mockedAxios.get.mockImplementationOnce(() =>
      Promise.resolve({ data: { program: '' } })
    );
    // Provide a benign holder distribution.
    mockedAxios.get.mockImplementationOnce(() =>
      Promise.resolve({ data: { data: [{ percent: '10' }] } })
    );
    // Override liquidity metrics.
    (validator as any).getLiquidityMetrics = jest.fn(() => Promise.resolve({ locked: true, totalLiquidity: 100000 }));

    const result: RugAnalysis = await validator.validateContract(testAddress);
    
    // Expect a CRITICAL risk immediately if contract code is empty.
    expect(result.risk).toBe(RiskLevel.CRITICAL);
    expect(result.score).toBe(100);
    expect(result.warnings).toMatch(/Contract code is empty/);
  });

  test('getHolderDistribution returns correct percentage', async () => {
    // Simulate a holder distribution response.
    const holderResponse = { data: { data: [{ percent: '45' }] } };
    mockedAxios.get.mockImplementationOnce(() => Promise.resolve(holderResponse));
    
    const holderPercent = await (validator as any).getHolderDistribution(testAddress);
    expect(holderPercent).toBe(45);
  });
});
