import bs58 from "bs58";
import { Keypair } from "@solana/web3.js";
import dotenv from "dotenv";
dotenv.config();

const base58Key = process.env.WALLET_SECRET_BASE58;
if (!base58Key) throw new Error("WALLET_SECRET_BASE58 not set");

let secretKey: Uint8Array;
try {
  secretKey = bs58.decode(base58Key);
} catch {
  throw new Error("Invalid Base58 private key");
}

export const walletKeypair = Keypair.fromSecretKey(secretKey);
