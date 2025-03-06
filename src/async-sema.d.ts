declare module 'async-sema' {
    export function RateLimit(limit: number): () => Promise<void>;
  }
  