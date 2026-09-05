// file: src/test/rouletteStrip.test.ts
import { describe, it, expect } from "vitest";
import { buildRouletteStrip } from "@/lib/rouletteStrip";
import type { PlexItem } from "@/types/session";

const makeItems = (count: number): PlexItem[] =>
  Array.from({ length: count }, (_, i) => ({
    ratingKey: `key-${i}`,
    title: `Movie ${i}`,
    year: 2000 + i,
    summary: "",
    thumb: "",
  })) as PlexItem[];

// 7 and 14 used to collapse the whole reel to a single poster under the old
// `(seed + i * 7) % items.length` builder.
const TIE_SIZES = [2, 3, 4, 5, 7, 14];

describe("buildRouletteStrip", () => {
  TIE_SIZES.forEach((size) => {
    describe(`${size}-way tie`, () => {
      const items = makeItems(size);

      items.forEach((winner) => {
        const label = `winner ${winner.ratingKey}`;

        it(`${label}: never repeats a poster back-to-back`, () => {
          const { strip } = buildRouletteStrip(items, winner.ratingKey);
          const repeats = strip
            .map((item, i) => (i > 0 && item.ratingKey === strip[i - 1].ratingKey ? i : -1))
            .filter((i) => i >= 0);
          expect(repeats).toEqual([]);
        });

        it(`${label}: lands on a cell the winner genuinely occupies`, () => {
          const { strip, winnerIndex } = buildRouletteStrip(items, winner.ratingKey);
          expect(strip[winnerIndex].ratingKey).toBe(winner.ratingKey);
        });

        it(`${label}: keeps cells after the landing slot to fill the viewport`, () => {
          const { strip, winnerIndex } = buildRouletteStrip(items, winner.ratingKey);
          expect(strip.length - 1 - winnerIndex).toBeGreaterThanOrEqual(4);
          expect(winnerIndex).toBeGreaterThanOrEqual(30); // enough lead-in for a real spin
        });

        it(`${label}: is identical across clients`, () => {
          const a = buildRouletteStrip(items, winner.ratingKey);
          const b = buildRouletteStrip(items, winner.ratingKey);
          expect(a.strip.map((i) => i.ratingKey)).toEqual(b.strip.map((i) => i.ratingKey));
          expect(a.winnerIndex).toBe(b.winnerIndex);
          expect(a.targetOffset).toBe(b.targetOffset);
        });

        it(`${label}: uses every tied item`, () => {
          const { strip } = buildRouletteStrip(items, winner.ratingKey);
          expect(new Set(strip.map((i) => i.ratingKey)).size).toBe(size);
        });
      });
    });
  });

  // The reported bug: a 2-way tie alternated A,B,A,B and the winner was stamped over a
  // fixed slot, so for one of the two winners the stop showed the same poster 3x in a row.
  it("shows a different poster on each side of the landing cell in a 2-way tie", () => {
    const items = makeItems(2);
    items.forEach((winner) => {
      const { strip, winnerIndex } = buildRouletteStrip(items, winner.ratingKey);
      expect(strip[winnerIndex - 1].ratingKey).not.toBe(winner.ratingKey);
      expect(strip[winnerIndex + 1].ratingKey).not.toBe(winner.ratingKey);
    });
  });

  it("gives the two winners of a tie different reels", () => {
    const items = makeItems(2);
    const a = buildRouletteStrip(items, items[0].ratingKey);
    const b = buildRouletteStrip(items, items[1].ratingKey);
    expect(a.strip.map((i) => i.ratingKey)).not.toEqual(b.strip.map((i) => i.ratingKey));
  });

  it("centres the landing cell under the indicator", () => {
    const items = makeItems(3);
    const { winnerIndex, targetOffset } = buildRouletteStrip(items, items[1].ratingKey);
    // cell centre (index * 108 + 50) must line up with the 532px viewport centre (266)
    expect(winnerIndex * 108 + 50 - targetOffset).toBe(266);
  });
});
