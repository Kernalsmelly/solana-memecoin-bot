// Centralized test helpers and mocks for solana-memecoin-bot tests
import { vi } from 'vitest';

export const dummyValidAddress = '11111111111111111111111111111111';

export const mockedAxios = {
  get: vi.fn(),
  post: vi.fn(),
  // Add more as needed
};

export function createMockConnection(accountInfo: any = {}) {
  return {
    getAccountInfo: vi.fn().mockResolvedValue(accountInfo),
    // Add other Connection methods as needed
  };
}
