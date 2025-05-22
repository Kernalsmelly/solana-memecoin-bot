import { PublicKey } from '@solana/web3.js';
import axios from 'axios';
import logger from './logger';

// const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY;
// const BIRDEYE_API_URL = 'https://public-api.birdeye.so/public/price';

// export async function getTokenPrice(tokenAddress: PublicKey): Promise<number | null> {
//     try {
//         // if (!BIRDEYE_API_KEY) {
//         //     throw new Error('Birdeye API key not found');
//         // }

//         // const response = await axios.get(BIRDEYE_API_URL, {
//         //     params: {
//         //         address: tokenAddress.toString()
//         //     },
//         //     headers: {
//         //         'x-api-key': BIRDEYE_API_KEY,
//         //         'Accept': 'application/json'
//         //     }
//         // });

//         // if (response.data && response.data.success && response.data.data && response.data.data.value) {
//         //     return response.data.data.value;
//         // }

//         // throw new Error('Invalid response from Birdeye API');

//     } catch (error) {
//         logger.error('Failed to fetch token price:', error instanceof Error ? error.message : 'Unknown error');
//         return null;
//     }
//     logger.warn('Birdeye price fetch disabled.'); // Added warning
//     return null; // Return null as Birdeye is disabled
// }

// export async function getTokenPriceHistory(tokenAddress: PublicKey, timeframe: string = '1h'): Promise<any[]> {
//     try {
//         // if (!BIRDEYE_API_KEY) {
//         //     throw new Error('Birdeye API key not found');
//         // }

//         // const response = await axios.get(`${BIRDEYE_API_URL}/history`, {
//         //     params: {
//         //         address: tokenAddress.toString(),
//         //         timeframe
//         //     },
//         //     headers: {
//         //         'x-api-key': BIRDEYE_API_KEY,
//         //         'Accept': 'application/json'
//         //     }
//         // });

//         // if (response.data && response.data.success && Array.isArray(response.data.data)) {
//         //     return response.data.data;
//         // }

//         // throw new Error('Invalid response from Birdeye API');

//     } catch (error) {
//         logger.error('Failed to fetch price history:', error instanceof Error ? error.message : 'Unknown error');
//         return [];
//     }
//     logger.warn('Birdeye historical data fetch disabled.'); // Added warning
//     return null; // Return null as Birdeye is disabled
// }
