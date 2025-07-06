"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletKeypair = void 0;
const bs58_1 = __importDefault(require("bs58"));
const web3_js_1 = require("@solana/web3.js");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const base58Key = process.env.WALLET_SECRET_BASE58;
if (!base58Key)
    throw new Error("WALLET_SECRET_BASE58 not set");
let secretKey;
try {
    secretKey = bs58_1.default.decode(base58Key);
}
catch {
    throw new Error("Invalid Base58 private key");
}
exports.walletKeypair = web3_js_1.Keypair.fromSecretKey(secretKey);
//# sourceMappingURL=wallet.js.map