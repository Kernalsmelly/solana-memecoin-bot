import dotenv from 'dotenv';
dotenv.config();

export const SOL_MINT = 'So11111111111111111111111111111111111111112';
export const USDC_MINT = process.env.USDC_MINT || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

export function getBaseCurrency(): 'SOL' | 'USDC' {
  return (process.env.BASE_CURRENCY || 'SOL').toUpperCase() === 'USDC' ? 'USDC' : 'SOL';
}

export function getInputMint(): string {
  return getBaseCurrency() === 'USDC' ? USDC_MINT : SOL_MINT;
}
