// file: src/lib/questionStages.ts
// Single source of truth for the preference questionnaire stages. Both the questionnaire
// (src/components/QuestionFlow.tsx) and the admin toggles (AdminSettingsTab) are driven
// from QUESTION_STAGES, so adding a stage means adding one entry here.
import { Calendar, Clock, type LucideIcon } from "lucide-react";
import type { SessionPreferences } from "@/types/session";
import type { QuestionFlowSettings } from "@/types/settings";

export type QuestionStageId = "genre" | "era" | "runtime" | "language" | "rating";

interface QuestionStageBase {
  id: QuestionStageId;
  /** Admin panel toggle row. */
  adminLabel: string;
  adminDescription: string;
  /** Questionnaire screen. */
  question: string;
  /** Static copy, or derived from the admin config at render time. */
  subtext: string | ((settings: QuestionFlowSettings) => string);
  /** Caption under the "I don't mind" button. */
  dontMindHint: string;
  /** `chips` = flex-wrapped pills, `grid` = 2-column cards. */
  layout: "chips" | "grid";
  /** Optional icon shown on each option (grid layout only — chips ignore it). */
  optionIcon?: LucideIcon;
  /** Long option lists get their own scroll area rather than growing the page. */
  scrollOptions?: boolean;
  /**
   * What a missing key in the stored `question_stages` setting means for this stage.
   * Stages that predate the setting default to on so existing installs keep them;
   * stages added later default to off so an update never changes the questionnaire.
   */
  defaultEnabled: boolean;
}

/** Tap once to prefer, twice to exclude. Answers land in a pair of string arrays. */
export interface TriStateStageDef extends QuestionStageBase {
  kind: "tristate";
  prefKey: keyof Pick<SessionPreferences, "genres" | "eras" | "runtimes" | "languages">;
  excludeKey: keyof Pick<
    SessionPreferences,
    "excludedGenres" | "excludedEras" | "excludedRuntimes" | "excludedLanguages"
  >;
}

/** Pick one option (or none). The answer lands in a single numeric field. */
export interface SingleChoiceStageDef extends QuestionStageBase {
  kind: "single";
  valueKey: keyof Pick<SessionPreferences, "minRating">;
}

export type QuestionStageDef = TriStateStageDef | SingleChoiceStageDef;

export interface QuestionOption {
  value: string;
  label: string;
}

export const GENRES: QuestionOption[] = [
  "Action", "Adventure", "Animation", "Comedy", "Crime",
  "Documentary", "Drama", "Family", "Fantasy", "Horror",
  "Mystery", "Romance", "Sci-Fi", "Thriller", "War",
].map((g) => ({ value: g, label: g }));

export const ERAS: QuestionOption[] = [
  { value: "6months", label: "Past 6 months" },
  { value: "2years", label: "Past 2 years" },
  { value: "2020s", label: "2020s" },
  { value: "2010s", label: "2010s" },
  { value: "2000s", label: "2000s" },
  { value: "90s", label: "90s" },
  { value: "80s", label: "80s" },
  { value: "classic", label: "Classic" },
];

// Bucket boundaries live in matchesRuntime (Swipe.tsx and server/src/routes/plex.ts).
export const RUNTIMES: QuestionOption[] = [
  { value: "short", label: "Under 90 min" },
  { value: "medium", label: "90–120 min" },
  { value: "long", label: "Over 2 hours" },
];

// Plex ratings are 0–10. Values are parsed with Number() when the answer is submitted;
// the comparison itself lives in src/lib/ratingFilter.ts (and its server mirror).
export const RATING_THRESHOLDS: QuestionOption[] = [
  { value: "6", label: "6+" },
  { value: "7", label: "7+" },
  { value: "7.5", label: "7.5+" },
  { value: "8", label: "8+" },
  { value: "8.5", label: "8.5+" },
];

export const QUESTION_STAGES: QuestionStageDef[] = [
  {
    id: "genre",
    kind: "tristate",
    defaultEnabled: true,
    adminLabel: "Genre",
    adminDescription: "Ask which genres users prefer or want to avoid",
    question: "Pick some genres you'd enjoy",
    subtext: "Tap once to prefer, twice to exclude",
    dontMindHint: "Show all genres",
    layout: "chips",
    prefKey: "genres",
    excludeKey: "excludedGenres",
  },
  {
    id: "era",
    kind: "tristate",
    defaultEnabled: true,
    adminLabel: "Era",
    adminDescription: "Ask which release periods users prefer or want to avoid",
    question: "From which era?",
    subtext: "Tap once to prefer, twice to exclude",
    dontMindHint: "Show from any era",
    layout: "grid",
    optionIcon: Calendar,
    prefKey: "eras",
    excludeKey: "excludedEras",
  },
  {
    id: "runtime",
    kind: "tristate",
    defaultEnabled: true,
    adminLabel: "Runtime",
    adminDescription: "Ask how much time users have for a movie or episode",
    question: "How much time do you have?",
    subtext: "Tap once to prefer, twice to exclude",
    dontMindHint: "Show any length",
    layout: "grid",
    optionIcon: Clock,
    prefKey: "runtimes",
    excludeKey: "excludedRuntimes",
  },
  {
    id: "language",
    kind: "tristate",
    defaultEnabled: true,
    adminLabel: "Language",
    adminDescription: "Ask which spoken languages users prefer or want to avoid",
    question: "Which languages?",
    subtext: "Tap once to prefer, twice to exclude",
    dontMindHint: "Show content in any language",
    layout: "chips",
    scrollOptions: true,
    prefKey: "languages",
    excludeKey: "excludedLanguages",
  },
  {
    id: "rating",
    kind: "single",
    defaultEnabled: false,
    adminLabel: "Minimum Rating",
    adminDescription:
      "Ask for a minimum rating. Compared against the Rating Display source (critic, audience or either)",
    question: "How well-rated should it be?",
    subtext: (settings) => {
      switch (settings.rating_display) {
        case "audience":
          return "Compared against the audience rating";
        case "both":
          return "Passes if either the critic or audience rating qualifies";
        default:
          return "Compared against the critic rating";
      }
    },
    dontMindHint: "Show titles with any rating",
    layout: "chips",
    valueKey: "minRating",
  },
];

export type QuestionStageSettings = Partial<Record<QuestionStageId, boolean>>;

/** What each stage's toggle reads as when the stored setting has no key for it. */
export const DEFAULT_QUESTION_STAGE_SETTINGS = Object.fromEntries(
  QUESTION_STAGES.map((stage) => [stage.id, stage.defaultEnabled])
) as Record<QuestionStageId, boolean>;

/**
 * A missing key falls back to the stage's own default, so installs that predate a stage
 * need no migration: the original four stay on, and stages added later stay off until an
 * admin switches them on.
 */
export function isStageEnabled(
  settings: QuestionStageSettings | undefined,
  id: QuestionStageId
): boolean {
  return settings?.[id] ?? DEFAULT_QUESTION_STAGE_SETTINGS[id];
}

export function getEnabledStages(
  settings: QuestionStageSettings | undefined
): QuestionStageDef[] {
  return QUESTION_STAGES.filter((stage) => isStageEnabled(settings, stage.id));
}
