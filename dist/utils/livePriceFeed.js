"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LivePriceFeed = void 0;
const axios_1 = __importDefault(require("axios"));
const events_1 = require("events");
class LivePriceFeed extends events_1.EventEmitter {
    constructor(tokenAddress) {
        super();
        this.lastVolume = 0;
        this.lastPrice = 0;
        this.timer = null;
        this.tokenAddress = tokenAddress;
    }
    async start() {
        try {
            const data = await this.fetchPriceData();
            this.emit('price', data);
        }
        catch (error) {
            console.error('Error fetching price:', error);
            this.emit('error', error);
        }
        this.timer = setInterval(async () => {
            try {
                const data = await this.fetchPriceData();
                this.emit('price', data);
            }
            catch (error) {
                console.error('Error fetching price:', error);
                this.emit('error', error);
            }
        }, 10000);
    }
    stop() {
        if (this.timer !== null) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
    async tryDexscreener() {
        try {
            const url = `https://api.dexscreener.com/latest/dex/tokens/${this.tokenAddress}`;
            console.log(`Trying Dexscreener: ${url}`);
            const response = await axios_1.default.get(url, {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0'
                }
            });
            if (!response.data?.pairs?.[0]) {
                return null;
            }
            const pair = response.data.pairs.reduce((a, b) => (a.volume?.h24 || 0) > (b.volume?.h24 || 0) ? a : b);
            const price = parseFloat(pair.priceUsd);
            const volume = pair.volume?.h24 || 0;
            const volumeDelta = volume - this.lastVolume;
            // Calculate buy/sell ratio
            const buyRatio = pair.txns?.h24?.buys && pair.txns?.h24?.sells ?
                pair.txns.h24.buys / pair.txns.h24.sells : undefined;
            this.lastVolume = volume;
            this.lastPrice = price;
            console.log(`[Dexscreener] Price: ${price} USD, Volume: ${volume} USD`);
            if (buyRatio) {
                console.log(`[Dexscreener] Buy/Sell Ratio: ${buyRatio.toFixed(2)}`);
            }
            return {
                price,
                volume: volumeDelta,
                timestamp: Date.now(),
                buyRatio
            };
        }
        catch (err) {
            console.log('Dexscreener failed:', err.message);
            return null;
        }
    }
    async tryCoingecko() {
        try {
            // Note: This requires mapping SOL addresses to CoinGecko IDs
            const tokenId = this.getCoingeckoId(this.tokenAddress);
            if (!tokenId)
                return null;
            const url = `https://api.coingecko.com/api/v3/coins/${tokenId}`;
            console.log(`Trying CoinGecko: ${url}`);
            const response = await axios_1.default.get(url);
            if (!response.data?.market_data?.current_price) {
                return null;
            }
            const price = response.data.market_data.current_price.usd;
            const volume = response.data.market_data.total_volume.usd;
            const volumeDelta = volume - this.lastVolume;
            this.lastVolume = volume;
            this.lastPrice = price;
            console.log(`[CoinGecko] Price: ${price} USD, Volume: ${volume} USD`);
            return {
                price,
                volume: volumeDelta,
                timestamp: Date.now()
            };
        }
        catch (err) {
            console.log('CoinGecko failed:', err.message);
            return null;
        }
    }
    async tryOrca() {
        try {
            const url = `https://api.orca.so/v1/pool/quote?inputToken=${this.tokenAddress}&outputToken=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=1000000&slippage=1`;
            console.log(`Trying Orca: ${url}`);
            const response = await axios_1.default.get(url);
            if (!response.data?.data) {
                return null;
            }
            const price = parseFloat(response.data.data.price);
            const volume = parseFloat(response.data.data.volume24h);
            const volumeDelta = volume - this.lastVolume;
            this.lastVolume = volume;
            this.lastPrice = price;
            console.log(`[Orca] Price: ${price} USD, Volume: ${volume} USD, TVL: ${response.data.data.tvl}`);
            return {
                price,
                volume: volumeDelta,
                timestamp: Date.now()
            };
        }
        catch (err) {
            console.log('Orca failed:', err.message);
            return null;
        }
    }
    getCoingeckoId(address) {
        // Common token mappings
        const mappings = {
            'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': 'bonk',
            '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU': 'samoyedcoin',
            '8HGyAAB1yoM1ttS7pXjHMa3dukTFGQggnFFH3hJZgzQh': 'cope'
        };
        return mappings[address] || null;
    }
    async fetchPriceData() {
        // Try each API in sequence
        const result = await this.tryDexscreener() ||
            await this.tryCoingecko() ||
            await this.tryOrca();
        if (!result) {
            throw new Error('All price feeds failed');
        }
        return result;
    }
}
exports.LivePriceFeed = LivePriceFeed;
