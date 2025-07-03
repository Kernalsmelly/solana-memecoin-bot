"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchHeliusTokenMetadata = fetchHeliusTokenMetadata;
const axios_1 = __importDefault(require("axios"));
async function fetchHeliusTokenMetadata(address, heliusApiKey) {
    try {
        const url = `https://api.helius.xyz/v0/token-metadata?api-key=${heliusApiKey}`;
        const res = await axios_1.default.post(url, {
            mintAccounts: [address],
        });
        if (res.data && Array.isArray(res.data) && res.data.length > 0) {
            return {
                address,
                ...res.data[0],
            };
        }
        return null;
    }
    catch (err) {
        // Log as debug, not error (to avoid log spam)
        if (process.env.NODE_ENV !== 'production') {
            console.debug('[HeliusAPI] Metadata fetch failed', err);
        }
        return null;
    }
}
//# sourceMappingURL=heliusAPI.js.map