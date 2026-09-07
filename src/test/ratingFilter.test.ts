// file: src/test/ratingFilter.test.ts
import { describe, it, expect } from "vitest";
import { effectiveRatings, countMetMinRatings, aggregateMinRatings } from "@/lib/ratingFilter";

describe("effectiveRatings", () => {
  const both = { rating: 7.2, audienceRating: 8.4 };
  const criticOnly = { rating: 6.1 };
  const audienceOnly = { audienceRating: 9.0 };

  it("uses the selected source when it exists", () => {
    expect(effectiveRatings(both, "critic")).toEqual([7.2]);
    expect(effectiveRatings(both, "audience")).toEqual([8.4]);
  });

  it("returns both sources in 'both' mode", () => {
    expect(effectiveRatings(both, "both")).toEqual([7.2, 8.4]);
  });

  it("falls back to the other source when the selected one is missing, as the cards do", () => {
    expect(effectiveRatings(audienceOnly, "critic")).toEqual([9.0]);
    expect(effectiveRatings(criticOnly, "audience")).toEqual([6.1]);
    expect(effectiveRatings(criticOnly, "both")).toEqual([6.1]);
  });

  it("is empty for unrated items, and treats 0 as unrated like the cards do", () => {
    expect(effectiveRatings({}, "critic")).toEqual([]);
    expect(effectiveRatings({ rating: 0, audienceRating: 0 }, "both")).toEqual([]);
  });
});

describe("countMetMinRatings", () => {
  it("counts how many of the group's thresholds the item clears", () => {
    expect(countMetMinRatings({ rating: 6.5 }, [7, 8], "critic")).toBe(0);
    expect(countMetMinRatings({ rating: 7.5 }, [7, 8], "critic")).toBe(1);
    expect(countMetMinRatings({ rating: 8.5 }, [7, 8], "critic")).toBe(2);
  });

  it("is inclusive at the threshold", () => {
    expect(countMetMinRatings({ rating: 7.5 }, [7.5], "critic")).toBe(1);
  });

  it("counts a threshold once per participant who chose it", () => {
    expect(countMetMinRatings({ rating: 8.5 }, [7, 7, 8], "critic")).toBe(3);
    expect(countMetMinRatings({ rating: 7.5 }, [7, 7, 8], "critic")).toBe(2);
  });

  it("passes in 'both' mode when either rating qualifies", () => {
    expect(countMetMinRatings({ rating: 5.0, audienceRating: 8.0 }, [7], "both")).toBe(1);
    expect(countMetMinRatings({ rating: 8.0, audienceRating: 5.0 }, [7], "both")).toBe(1);
    expect(countMetMinRatings({ rating: 5.0, audienceRating: 6.0 }, [7], "both")).toBe(0);
  });

  it("judges only the selected source when it exists", () => {
    expect(countMetMinRatings({ rating: 5.0, audienceRating: 8.0 }, [7], "critic")).toBe(0);
    expect(countMetMinRatings({ rating: 5.0, audienceRating: 8.0 }, [7], "audience")).toBe(1);
  });

  it("returns 0 for unrated items and for an empty threshold list", () => {
    expect(countMetMinRatings({}, [7], "critic")).toBe(0);
    expect(countMetMinRatings({ rating: 9 }, [], "critic")).toBe(0);
  });
});

describe("aggregateMinRatings", () => {
  it("keeps one entry per participant, ascending, so a shared threshold weighs more", () => {
    const participants = [
      { preferences: { minRating: 8 } },
      { preferences: { minRating: 7 } },
      { preferences: { minRating: 8 } },
    ];
    expect(aggregateMinRatings(participants)).toEqual([7, 8, 8]);
  });

  it("is empty when nobody chose one", () => {
    expect(
      aggregateMinRatings([{ preferences: {} }, { preferences: { genres: ["Drama"] } }])
    ).toEqual([]);
  });

  it("ignores missing, zero and non-finite values", () => {
    const participants = [
      { preferences: { minRating: undefined } },
      { preferences: { minRating: 0 } },
      { preferences: { minRating: Number.NaN } },
      { preferences: { minRating: 7.5 } },
    ];
    expect(aggregateMinRatings(participants)).toEqual([7.5]);
  });
});
