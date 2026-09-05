// file: src/lib/rouletteStrip.ts
import type { PlexItem } from "@/types/session";

// Reel geometry - shared with RouletteWinner so the landing offset and the rendered
// layout can never drift apart.
export const ITEM_WIDTH = 100;
export const ITEM_GAP = 8;
export const VISIBLE_COUNT = 5;

const MIN_STRIP_LENGTH = 40;
const MIN_LEAD_IN = 30; // cells before the landing slot, so the spin always has runway
const TRAIL_COUNT = 4; // cells kept after the landing slot so the viewport stays filled

// The server only broadcasts "start", never the reel layout, so every client has to
// derive the exact same strip from the same seed - no bare Math.random() in here.
const hashSeed = (source: string): number =>
  source.split('').reduce((acc, char, i) => (acc + char.charCodeAt(0) * (i + 1)) >>> 0, 0);

const mulberry32 = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const shuffled = <T,>(source: T[], rand: () => number): T[] => {
  const copy = [...source];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

export interface RouletteStrip {
  strip: PlexItem[];
  winnerIndex: number;
  targetOffset: number;
}

/**
 * Builds the tie-breaker reel. Pure and deterministic for a given (items, winnerId) pair,
 * which is what keeps every participant's reel identical - the server broadcasts only the
 * start signal, never the layout.
 */
export const buildRouletteStrip = (items: PlexItem[], winnerId: string): RouletteStrip => {
  const itemTotalWidth = ITEM_WIDTH + ITEM_GAP;
  const containerWidth = VISIBLE_COUNT * ITEM_WIDTH + (VISIBLE_COUNT - 1) * ITEM_GAP;
  const centerOffset = Math.floor(containerWidth / 2) - Math.floor(ITEM_WIDTH / 2);

  const rand = mulberry32(hashSeed(`${winnerId}|${items.map(item => item.ratingKey).join(',')}`));

  // Bag shuffle: append shuffled copies of the full item list so every poster shows up
  // equally often, never twice in a row, and without any arithmetic pattern.
  // The backwards scan below can drop up to two blocks below maxIndex before it finds the
  // winner, so leave room for that on top of the lead-in or a big tie gets a short spin.
  const stripItems: PlexItem[] = [];
  const targetLength = Math.max(MIN_STRIP_LENGTH, MIN_LEAD_IN + 2 * items.length + TRAIL_COUNT);

  while (stripItems.length < targetLength) {
    const block = shuffled(items, rand);
    const previous = stripItems[stripItems.length - 1];
    if (previous && block.length > 1 && block[0].ratingKey === previous.ratingKey) {
      const swapWith = 1 + Math.floor(rand() * (block.length - 1));
      [block[0], block[swapWith]] = [block[swapWith], block[0]];
    }
    stripItems.push(...block);
  }

  // Land on a slot the winner already occupies. Never overwrite a cell: a stamped-in
  // poster ends up beside a copy of itself and the stop reads as rigged.
  const maxIndex = stripItems.length - 1 - TRAIL_COUNT;
  let winnerIndex = maxIndex;
  for (let i = maxIndex; i >= 0; i--) {
    if (stripItems[i].ratingKey === winnerId) {
      winnerIndex = i;
      break;
    }
  }

  return {
    strip: stripItems,
    winnerIndex,
    targetOffset: Math.max(0, (winnerIndex * itemTotalWidth) - centerOffset),
  };
};
