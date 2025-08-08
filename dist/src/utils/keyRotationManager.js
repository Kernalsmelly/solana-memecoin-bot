export class KeyRotationManager {
    keypairs;
    tradesPerKey;
    currentIndex = 0;
    tradeCount = 0;
    constructor(keypairs, tradesPerKey) {
        this.keypairs = keypairs;
        this.tradesPerKey = tradesPerKey;
    }
    nextKeypair() {
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
    reset() {
        this.currentIndex = 0;
        this.tradeCount = 0;
    }
}
//# sourceMappingURL=keyRotationManager.js.map