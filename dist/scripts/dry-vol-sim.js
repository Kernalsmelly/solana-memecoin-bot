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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const tokenDiscovery_1 = require("../src/discovery/tokenDiscovery");
const volatilitySqueeze_1 = require("../src/strategies/volatilitySqueeze");
const logger_1 = __importDefault(require("../src/utils/logger"));
async function main() {
    try {
        // Initialize components with dry-run settings
        const discovery = new tokenDiscovery_1.TokenDiscovery({
            minLiquidity: 50000, // $50k minimum
            maxTokenAge: 24 * 60 * 60 * 1000, // 24 hours
            cleanupIntervalMs: 5 * 60 * 1000 // 5 minutes
        });
        const volatilitySqueeze = new volatilitySqueeze_1.VolatilitySqueeze({
            priceChangeThreshold: 20, // 20% price change
            volumeMultiplier: 2, // 2x 1h volume
            lookbackPeriodMs: 30 * 60 * 1000, // 30 minutes
            checkIntervalMs: 60 * 1000 // 1 minute
        });
        // Set up event listeners
        discovery.on('tokenDiscovered', async (token) => {
            logger_1.default.info(`New token discovered: ${token.address}`);
        });
        const { fetchJupiterQuote } = await Promise.resolve().then(() => __importStar(require('../src/orderExecution/jupiterQuote')));
        const { handleDryRunFill } = await Promise.resolve().then(() => __importStar(require('../src/orderExecution/dryRunFill')));
        const fills = [];
        volatilitySqueeze.on('patternMatch', async (match) => {
            logger_1.default.info(`Volatility Squeeze detected for ${match.token.address}`);
            logger_1.default.info(`Suggested position size: ${match.suggestedPosition} SOL`);
            try {
                // Fetch Jupiter quote for token/SOL
                const inputMint = process.env.SIM_INPUT_MINT || 'So11111111111111111111111111111111111111112'; // SOL as default input
                const outputMint = match.token.address;
                const amount = Number(process.env.SIM_AMOUNT) || 1000000; // 0.001 SOL default (in lamports)
                const slippageBps = Number(process.env.SLIPPAGE_BPS) || 50;
                const quote = await fetchJupiterQuote({ inputMint, outputMint, amount, slippageBps });
                if (quote) {
                    logger_1.default.info('[JupiterQuote] Quote:', quote);
                    logger_1.default.info('[JupiterQuote] Unsigned Tx:', quote.tx);
                }
                else {
                    logger_1.default.warn('[JupiterQuote] No quote available');
                }
                // Simulate fill
                const fill = {
                    action: 'buy',
                    tokenAddress: outputMint,
                    tokenSymbol: match.token.symbol,
                    quantity: amount / 1e9, // assuming 9 decimals for SOL
                    price: quote?.price || 0,
                    meta: { patternMatch: match, quote }
                };
                await handleDryRunFill(fill);
                fills.push(fill);
            }
            catch (e) {
                logger_1.default.error('[DryRun] Error in simulated fill', e);
            }
        });
        // Start components
        await discovery.start();
        volatilitySqueeze.start();
        // Run for 30 minutes
        logger_1.default.info('Starting dry-run simulation for 30 minutes...');
        await new Promise(resolve => setTimeout(resolve, 30 * 60 * 1000));
        // Clean up
        discovery.stop();
        volatilitySqueeze.stop();
        // PnL summary
        try {
            const { computePnLSummary } = await Promise.resolve().then(() => __importStar(require('../src/utils/pnlStats')));
            const summary = computePnLSummary(fills);
            logger_1.default.info('[PnL Summary]', summary);
        }
        catch (e) {
            logger_1.default.error('[PnL Summary] Error computing summary', e);
        }
        logger_1.default.info('Dry-run simulation completed');
    }
    catch (error) {
        logger_1.default.error('Error in dry-run simulation:', error);
        process.exit(1);
    }
}
main();
//# sourceMappingURL=dry-vol-sim.js.map