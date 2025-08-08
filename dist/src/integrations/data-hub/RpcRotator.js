import { Connection } from '@solana/web3.js';
const DEFAULT_URLS = [
    'https://rpc.helio.sh/dev/',
    'https://api.mainnet-beta.solana.com',
    'https://solana-api.projectserum.com',
];
const COOLDOWN = 60 * 1000;
export class RpcRotator {
    endpoints;
    i;
    constructor(urls) {
        const useUrls = urls || process.env.RPC_URLS?.split(',') || DEFAULT_URLS;
        this.endpoints = useUrls.map((url) => ({ url: url.trim(), fails: 0, cooldownUntil: 0 }));
        this.i = 0;
    }
    getConnection() {
        const now = Date.now();
        for (let tries = 0; tries < this.endpoints.length; tries++) {
            const idx = (this.i + tries) % this.endpoints.length;
            const ep = this.endpoints[idx];
            if (ep && ep.cooldownUntil < now) {
                this.i = (idx + 1) % this.endpoints.length;
                return new Connection(ep.url);
            }
        }
        throw new Error('No healthy Solana RPC endpoints available');
    }
    reportTimeout(url) {
        const ep = this.endpoints.find((e) => e.url === url);
        if (ep) {
            ep.fails += 1;
            if (ep.fails >= 3) {
                ep.cooldownUntil = Date.now() + COOLDOWN;
                ep.fails = 0;
            }
        }
    }
    reportSuccess(url) {
        const ep = this.endpoints.find((e) => e.url === url);
        if (ep)
            ep.fails = 0;
    }
}
//# sourceMappingURL=RpcRotator.js.map