"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchJupiterQuote = fetchJupiterQuote;
const axios_1 = __importDefault(require("axios"));
async function fetchJupiterQuote({ inputMint, outputMint, amount, slippageBps }) {
    try {
        const url = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}`;
        const res = await axios_1.default.get(url);
        if (!res.data || !res.data.data || !res.data.data[0])
            return null;
        const q = res.data.data[0];
        return {
            inAmount: q.inAmount,
            outAmount: q.outAmount,
            price: q.price,
            route: q.route,
            tx: q.tx
        };
    }
    catch (e) {
        console.debug('[JupiterQuote] REST error', e);
        return null;
    }
}
//# sourceMappingURL=jupiterQuote.js.map