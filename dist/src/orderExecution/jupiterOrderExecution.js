"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JupiterOrderExecution = void 0;
const events_1 = require("events");
const web3_js_1 = require("@solana/web3.js");
const axios_1 = __importDefault(require("axios"));
const logger_1 = __importDefault(require("../utils/logger"));
class JupiterOrderExecution extends events_1.EventEmitter {
    connection;
    signer;
    jupiterApi;
    constructor(connection, signer, jupiterApi = 'https://quote-api.jup.ag/v6') {
        super();
        this.connection = connection;
        this.signer = signer;
        this.jupiterApi = jupiterApi;
    }
    async executeSwap(params) {
        try {
            logger_1.default.info('[JupiterOrderExecution] Fetching quote', params);
            const quoteRes = await axios_1.default.get(`${this.jupiterApi}/quote`, {
                params: {
                    inputMint: params.inputMint,
                    outputMint: params.outputMint,
                    amount: params.amountIn,
                    slippageBps: params.slippageBps || 50,
                    onlyDirectRoutes: false,
                    userPublicKey: params.userPublicKey,
                }
            });
            const route = quoteRes.data.routes?.[0];
            if (!route)
                throw new Error('No route found');
            logger_1.default.info('[JupiterOrderExecution] Requesting swap transaction');
            const swapRes = await axios_1.default.post(`${this.jupiterApi}/swap`, {
                route,
                userPublicKey: params.userPublicKey,
                wrapAndUnwrapSol: true
            });
            const { swapTransaction } = swapRes.data;
            if (!swapTransaction)
                throw new Error('No swap transaction received');
            // Deserialize transaction
            const txBuf = Buffer.from(swapTransaction, 'base64');
            let tx = web3_js_1.Transaction.from(txBuf);
            tx = await this.signer.signTransaction(tx);
            logger_1.default.info('[OrderSubmitted] Signature (pending):', tx.signature?.toString('base58'));
            this.emit('orderSubmitted', { tx });
            const sig = await this.connection.sendRawTransaction(tx.serialize());
            logger_1.default.info('[OrderSubmitted] Signature:', sig);
            this.emit('orderSubmitted', { signature: sig });
            const confirmation = await this.connection.confirmTransaction(sig, 'confirmed');
            logger_1.default.info('[OrderConfirmed] Signature:', sig, confirmation);
            this.emit('orderConfirmed', { signature: sig, confirmation });
            return { success: true, txSignature: sig };
        }
        catch (e) {
            logger_1.default.error('[JupiterOrderExecution] Swap failed', e);
            return { success: false, reason: e.message || e.toString() };
        }
    }
}
exports.JupiterOrderExecution = JupiterOrderExecution;
exports.default = JupiterOrderExecution;
//# sourceMappingURL=jupiterOrderExecution.js.map