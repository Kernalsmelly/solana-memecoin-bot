import { getBaseCurrency, getInputMint, SOL_MINT, USDC_MINT } from '../src/utils/baseCurrency';

describe('Base Currency Utility', () => {
  beforeEach(() => {
    process.env.BASE_CURRENCY = '';
    process.env.USDC_MINT = USDC_MINT;
  });

  it('defaults to SOL', () => {
    process.env.BASE_CURRENCY = '';
    expect(getBaseCurrency()).toBe('SOL');
    expect(getInputMint()).toBe(SOL_MINT);
  });

  it('returns USDC when set', () => {
    process.env.BASE_CURRENCY = 'USDC';
    expect(getBaseCurrency()).toBe('USDC');
    expect(getInputMint()).toBe(USDC_MINT);
  });

  it('is case-insensitive', () => {
    process.env.BASE_CURRENCY = 'usdc';
    expect(getBaseCurrency()).toBe('USDC');
    expect(getInputMint()).toBe(USDC_MINT);
  });
});
