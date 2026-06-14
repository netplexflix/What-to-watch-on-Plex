// File: src/lib/imagePrefetch.ts
// Lightweight image cache-warming helper used by the swiping flow.

const loaded = new Set<string>();
const inFlight = new Map<string, HTMLImageElement>();

// A URL we never want to spend a request on.
function isPrefetchable(url: string | undefined | null): url is string {
  return !!url && url !== "/placeholder.svg";
}

export function isImagePrefetched(url: string | undefined | null): boolean {
  return isPrefetchable(url) && loaded.has(url);
}

export function markImageLoaded(url: string | undefined | null): void {
  if (isPrefetchable(url)) {
    loaded.add(url);
    inFlight.delete(url);
  }
}

export function prefetchImages(urls: (string | undefined | null)[]): void {
  for (const url of urls) {
    if (!isPrefetchable(url) || loaded.has(url) || inFlight.has(url)) continue;

    const img = new Image();
    // Keep a strong reference until the request settles so it isn't GC'd.
    inFlight.set(url, img);
    img.onload = () => {
      loaded.add(url);
      inFlight.delete(url);
    };
    img.onerror = () => {
      // Don't mark as loaded — let the card fall back to its error placeholder.
      inFlight.delete(url);
    };
    img.src = url;
  }
}
