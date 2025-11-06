// Env interface no longer needed (no KV storage)
// export interface Env {}

export interface ScrapedData {
  amount: string;
  currency: string;
  target?: string;
  percentage?: number;
  timestamp: number;
}

