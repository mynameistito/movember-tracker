export interface Env {
  CACHE: KVNamespace;
}

export interface ScrapedData {
  amount: string;
  currency: string;
  target?: string;
  percentage?: number;
  timestamp: number;
}

