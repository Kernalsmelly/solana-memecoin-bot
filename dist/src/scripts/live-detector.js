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
const web3_js_1 = require("@solana/web3.js");
const newCoinDetector_1 = require("../services/newCoinDetector");
const config_1 = require("../utils/config");
const dotenv = __importStar(require("dotenv"));
dotenv.config();
async function main() {
    // Use the imported config directly
    const config = config_1.config;
    // Determine RPC endpoint to use (Prioritize QuickNode if available)
    const rpcUrlToUse = config.apis?.quicknodeRpcUrl || config.solana.rpcEndpoint;
    console.log(`Using Solana RPC Endpoint: ${rpcUrlToUse}`);
    // Establish Solana connection
    const connection = new web3_js_1.Connection(rpcUrlToUse, 'confirmed');
    console.log(`Established Solana connection to ${config.solana.cluster} cluster.`);
    // Initialize detector with live monitoring
    const detector = new newCoinDetector_1.NewCoinDetector(connection, config);
    // Subscribe to events
    detector.on('newToken', (token) => {
        console.log('\n🚀 New Token Detected:');
        console.log(JSON.stringify(token, null, 2));
    });
    detector.on('error', (error) => {
        console.error('\n❌ Error:', error);
    });
    // Start the detector
    detector.start();
    // Keep the process running
    process.on('SIGINT', () => {
        console.log('\nShutting down detector...');
        detector.stop();
        process.exit();
    });
    console.log('\n🔍 Starting live token detection...');
    console.log('Press Ctrl+C to stop\n');
}
main().catch(console.error);
//# sourceMappingURL=live-detector.js.map