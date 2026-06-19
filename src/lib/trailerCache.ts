// File: src/lib/trailerCache.ts
// Resolves item trailers on demand and caches the result, so the swipe card can decide whether to show a "Play Trailer" button without re-querying. 

import { plexApi } from "@/lib/api";

// ratingKey -> partKey (trailer exists) or null (no trailer). Absent = not yet resolved.
const resolved = new Map<string, string | null>();
const inFlight = new Map<string, Promise<string | null>>();

export function getCachedTrailer(ratingKey: string): string | null | undefined {
  return resolved.get(ratingKey);
}

export function resolveTrailer(ratingKey: string): Promise<string | null> {
  if (resolved.has(ratingKey)) return Promise.resolve(resolved.get(ratingKey)!);
  const existing = inFlight.get(ratingKey);
  if (existing) return existing;

  const p = plexApi
    .getTrailerInfo(ratingKey)
    .then(({ data, error }) => {
      const partKey = !error && data?.partKey ? data.partKey : null;
      resolved.set(ratingKey, partKey);
      inFlight.delete(ratingKey);
      return partKey;
    })
    .catch(() => {
      resolved.set(ratingKey, null);
      inFlight.delete(ratingKey);
      return null;
    });

  inFlight.set(ratingKey, p);
  return p;
}

export function prefetchTrailers(ratingKeys: string[]): void {
  for (const ratingKey of ratingKeys) {
    if (!ratingKey || resolved.has(ratingKey) || inFlight.has(ratingKey)) continue;
    void resolveTrailer(ratingKey);
  }
}
