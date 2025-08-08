// src/utils/priceHistoryUtils.ts
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';

const priceHistoryFile = path.resolve(__dirname, '..', '..', 'data', 'price_history.csv');

export type PriceHistoryRow = {
  timestamp: number;
  token: string;
  poolAddress?: string;
  price: number;
  liquidity?: number;
  volume?: number;
};

export function loadPriceHistory(): PriceHistoryRow[] {
  if (!fs.existsSync(priceHistoryFile)) return [];
  const csv = fs.readFileSync(priceHistoryFile, 'utf-8');
  return parse(csv, { columns: true, skip_empty_lines: true }).map((row: any) => ({
    timestamp: Number(row.timestamp),
    token: row.token,
    poolAddress: row.poolAddress,
    price: Number(row.price),
    liquidity: row.liquidity ? Number(row.liquidity) : undefined,
    volume: row.volume ? Number(row.volume) : undefined,
  }));
}

export function getWindowedPrices(
  priceHistory: PriceHistoryRow[],
  token: string,
  poolAddress: string | undefined,
  startTime: number,
  windowMs: number,
): PriceHistoryRow[] {
  return priceHistory.filter(
    (row) =>
      row.token === token &&
      (poolAddress === undefined || row.poolAddress === poolAddress) &&
      row.timestamp >= startTime &&
      row.timestamp <= startTime + windowMs,
  );
}
