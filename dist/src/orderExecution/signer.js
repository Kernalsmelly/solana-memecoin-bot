"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.LedgerSigner = exports.EnvVarSigner = exports.MockSigner = void 0;
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
        this.keypair = web3_js_1.Keypair.fromSecretKey(new Uint8Array(arr));
        this.publicKey = this.keypair.publicKey;
    }
    async signAndSendTransaction(tx, connection) {
        if (tx instanceof web3_js_1.Transaction) {
            tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
            tx.feePayer = this.publicKey;
            tx.sign(this.keypair);
            const raw = tx.serialize();
            return await connection.sendRawTransaction(raw, { skipPreflight: false });
        }
        else if (tx instanceof (await Promise.resolve().then(() => __importStar(require('@solana/web3.js')))).VersionedTransaction) {
            // Assume already signed by Jupiter, just send
            const raw = tx.serialize();
            return await connection.sendRawTransaction(raw, { skipPreflight: false });
        }
        else {
            throw new Error('Unknown transaction type');
        }
    }
}
exports.EnvVarSigner = EnvVarSigner;
// LedgerSigner for hardware wallet support (stub)
class LedgerSigner {
    publicKey;
    constructor() {
        // TODO: Implement Ledger hardware wallet integration
        // Use solana-ledger-wallet or similar library for production
        throw new Error('LedgerSigner not implemented yet');
    }
    async signAndSendTransaction(tx, connection) {
        throw new Error('LedgerSigner not implemented yet');
    }
}
exports.LedgerSigner = LedgerSigner;
//# sourceMappingURL=signer.js.map