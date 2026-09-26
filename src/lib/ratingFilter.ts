// file: src/lib/ratingFilter.ts
// Minimum-rating preference: which rating an item is judged on, and how many of the group's
// thresholds it clears. Runs on the normal (cached) path in src/pages/Swipe.tsx.
//
// Keep in sync with the copy in server/src/routes/plex.ts, which only runs on a cache miss.
// The client and server share no code, so the same duplication as matchesRuntime applies.
import type { Participant, PlexItem } from "@/types/session";
import type { SessionSettings } from "@/types/settings";

export type RatingDisplay = SessionSettings["rating_display"];

type RatedItem = Pick<PlexItem, "rating" | "audienceRating">;

// The cards test ratings for truthiness (`if (item.rating)`), so 0 counts as "no rating"
// here too — otherwise the filter and the card would disagree about what the item has.
const present = (value: number | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

/**
 * Exactly the numbers the detail cards render for this display mode: the selected source(s)
 * when present, otherwise whichever of the two exists (critic first). Empty when unrated.
 * Mirrors renderRating in FlippableCard / SwipeCard / MatchCelebration.
 */
export function effectiveRatings(item: RatedItem, mode: RatingDisplay): number[] {
  const ratings: number[] = [];
  if ((mode === "critic" || mode === "both") && present(item.rating)) ratings.push(item.rating);
  if ((mode === "audience" || mode === "both") && present(item.audienceRating)) {
    ratings.push(item.audienceRating);
  }
  if (ratings.length > 0) return ratings;

  // Fallback: nothing for the selected mode, show what we have.
  if (present(item.rating)) return [item.rating];
  if (present(item.audienceRating)) return [item.audienceRating];
  return [];
}

/**
 * How many of the group's thresholds this item clears (0 when unrated). Inclusive, so "7+"
 * keeps a 7.0. The analog of countMatchingEras: > 0 passes the hard filter, and the count
 * feeds the score so titles that satisfy more people surface first. `minRatings` holds one
 * entry per participant, so clearing a threshold two people chose counts twice.
 */
export function countMetMinRatings(
  item: RatedItem,
  minRatings: number[],
  mode: RatingDisplay
): number {
  if (minRatings.length === 0) return 0;
  const ratings = effectiveRatings(item, mode);
  if (ratings.length === 0) return 0;
  const best = Math.max(...ratings);
  return minRatings.filter((threshold) => best >= threshold).length;
}

/**
 * Every threshold the participants chose, ascending; [] when nobody set one. A union, like
 * every other preference: the lowest value decides what is shown, the rest decide ordering.
 * Duplicates are kept on purpose — one entry per participant — so a threshold several people
 * chose weighs that much more in the score, exactly like a genre several people preferred.
 * Participants recorded before this stage existed simply lack the key.
 */
export function aggregateMinRatings(
  participants: Pick<Participant, "preferences">[]
): number[] {
  const values = participants
    .map((p) => p.preferences?.minRating)
    .filter(present);
  return values.sort((a, b) => a - b);
}
