/**
 * In-process cache: generation_id → Replicate prediction_id.
 *
 * Used as a fallback when migration 011 (prediction_id column on generations)
 * has not yet been applied to the database. The progress route checks this
 * cache after the DB query so polling works even without the column.
 *
 * Stored on globalThis so the Map survives Next.js hot-module reloads in
 * development mode (module re-evaluation would otherwise create a new Map
 * and lose all cached prediction IDs).
 *
 * Once migration 011 is applied the DB value takes precedence and this
 * cache becomes a no-op.
 */
declare global {
  // eslint-disable-next-line no-var
  var __predictionCache: Map<string, string> | undefined;
}

if (!globalThis.__predictionCache) {
  globalThis.__predictionCache = new Map<string, string>();
}

export const predictionCache: Map<string, string> = globalThis.__predictionCache;
