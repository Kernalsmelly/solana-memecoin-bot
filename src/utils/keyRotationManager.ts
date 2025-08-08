import { Keypair } from '@solana/web3.js';

export class KeyRotationManager {
  private keypairs: Keypair[];
  private tradesPerKey: number;
  private currentIndex: number = 0;
  private tradeCount: number = 0;

  constructor(keypairs: Keypair[], tradesPerKey: number) {
    this.keypairs = keypairs;
    this.tradesPerKey = tradesPerKey;
  }

  public nextKeypair(): Keypair {
    if (this.keypairs.length === 0) {
      throw new Error('No keypairs available in KeyRotationManager');
    }
    if (this.tradeCount > 0 && this.tradeCount % this.tradesPerKey === 0) {
      this.currentIndex = (this.currentIndex + 1) % this.keypairs.length;
    }
    this.tradeCount++;
    const kp = this.keypairs[this.currentIndex];
    if (!kp) {
      throw new Error('Keypair index out of bounds');
    }
    return kp;
  }

  public reset() {
    this.currentIndex = 0;
    this.tradeCount = 0;
  }
}
