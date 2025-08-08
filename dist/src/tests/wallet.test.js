import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
describe('walletKeypair loader', () => {
    it('loads wallet from Base58 env', () => {
        const knownBase58 = '5k2xBy1mhutVHAoZtgKQkEVTfF9AZNgg7rimL7SoCQNJ5XScCnxLSkCV3948qUXmW1gKuWR284JddkvJ9m6n2s9D';
        const expectedPubkey = '41aYTQ6jFk9nnhXza5Xyf9wveBj4XexhXFmtZTczCBNj';
        process.env.WALLET_SECRET_BASE58 = knownBase58;
        const keypair = Keypair.fromSecretKey(bs58.decode(process.env.WALLET_SECRET_BASE58));
        expect(keypair.publicKey.toBase58()).toBe(expectedPubkey);
    });
});
//# sourceMappingURL=wallet.test.js.map