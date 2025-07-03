"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnvVarSigner = exports.MockSigner = void 0;
const web3_js_1 = require("@solana/web3.js");
// Mock signer for dry-run mode
class MockSigner {
    publicKey;
    constructor(pubkey) {
        this.publicKey = new web3_js_1.PublicKey(pubkey || 'So11111111111111111111111111111111111111112');
    }
    async signAndSendTransaction(tx, connection) {
        // Simulate sending, return fake signature
        return 'mock_signature_' + Math.random().toString(36).slice(2);
    }
}
exports.MockSigner = MockSigner;
// EnvVar-based signer for live mode (uses private key from env)
class EnvVarSigner {
    publicKey;
    keypair;
    constructor() {
        const secret = process.env.SOLANA_PRIVATE_KEY;
        if (!secret)
            throw new Error('Missing SOLANA_PRIVATE_KEY');
        const arr = secret.split(',').map(Number);
        // @ts-ignore
        this.keypair = web3_js_1.Signer.fromSecretKey(new Uint8Array(arr));
        this.publicKey = this.keypair.publicKey;
    }
    async signAndSendTransaction(tx, connection) {
        tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        tx.feePayer = this.publicKey;
        tx.sign(this.keypair);
        const raw = tx.serialize();
        return await connection.sendRawTransaction(raw, { skipPreflight: false });
    }
}
exports.EnvVarSigner = EnvVarSigner;
// (Optional) LedgerSigner for hardware wallet support can be added here
//# sourceMappingURL=signer.js.map