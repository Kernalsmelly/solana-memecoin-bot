const axios = require("axios");

const API_KEY = "4b135f74ae3454980edad572f676fa6d"; // Replace with your actual key if it changes
const HEADERS = {
  "x-api-key": API_KEY,
};

const BASE_URL = "https://public-api.birdeye.so/public";

async function getTopTokens(limit = 25) {
  const url = `${BASE_URL}/tokenlist?limit=${limit}&page=1`;
  const response = await axios.get(url);
  return response.data.data.tokens;
}

async function getTokenChartData(mint) {
  const url = `${BASE_URL}/token/${mint}/market-chart?interval=5m&range=1h`;
  try {
    const response = await axios.get(url, { headers: HEADERS });
    return response.data.data;
  } catch (err) {
    return null;
  }
}

function calculateMoonScore(latestCandle) {
  if (!latestCandle || latestCandle.length < 2) return 0;
  const [last, secondLast] = latestCandle.slice(-2);
  const volumeJump = last.volume - secondLast.volume;
  const txJump = last.txCount - secondLast.txCount;
  return Math.max(0, (volumeJump * 0.001 + txJump * 0.5)); // basic scoring model
}

async function runMoonWatcher() {
  console.log("🔭 Scanning Solana tokens...");

  const topTokens = await getTopTokens();
  const results = [];

  for (const token of topTokens) {
    const data = await getTokenChartData(token.address);
    if (!data || !data.candles) continue;

    const moonScore = calculateMoonScore(data.candles);
    if (moonScore > 0) {
      results.push({
        name: token.symbol,
        address: token.address,
        score: moonScore.toFixed(2),
        last5mVolume: data.candles.at(-1).volume,
        last5mTxCount: data.candles.at(-1).txCount,
      });
    }

    // Respect Birdeye rate limit
    await new Promise((r) => setTimeout(r, 1000));
  }

  results.sort((a, b) => b.score - a.score);
  console.table(results.slice(0, 10));
}

runMoonWatcher();
