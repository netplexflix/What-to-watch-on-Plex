// file: src/lib/questionStages.ts
// Single source of truth for the preference questionnaire stages. Both the questionnaire
// (src/components/QuestionFlow.tsx) and the admin toggles (AdminSettingsTab) are driven
// from QUESTION_STAGES, so adding a stage means adding one entry here.
import { Calendar, Clock, type LucideIcon } from "lucide-react";
import type { SessionPreferences } from "@/types/session";

export type QuestionStageId = "genre" | "era" | "runtime" | "language";

export interface QuestionStageDef {
  id: QuestionStageId;
  /** Admin panel toggle row. */
  adminLabel: string;
  adminDescription: string;
  /** Questionnaire screen. */
  question: string;
  subtext: string;
  /** Caption under the "I don't mind" button. */
  dontMindHint: string;
  /** `chips` = flex-wrapped pills, `grid` = 2-column cards. */
  layout: "chips" | "grid";
  /** Optional icon shown on each option. */
  optionIcon?: LucideIcon;
  /** Long option lists get their own scroll area rather than growing the page. */
  scrollOptions?: boolean;
  prefKey: keyof Pick<SessionPreferences, "genres" | "eras" | "runtimes" | "languages">;
  excludeKey: keyof Pick<
    SessionPreferences,
    "excludedGenres" | "excludedEras" | "excludedRuntimes" | "excludedLanguages"
  >;
}

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

export const QUESTION_STAGES: QuestionStageDef[] = [
  {
    id: "genre",
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
];

export type QuestionStageSettings = Partial<Record<QuestionStageId, boolean>>;

/**
 * A missing key reads as enabled, so installs that predate this setting keep all three
 * stages and need no migration.
 */
export function isStageEnabled(
  settings: QuestionStageSettings | undefined,
  id: QuestionStageId
): boolean {
  return settings?.[id] ?? true;
}

export function getEnabledStages(
  settings: QuestionStageSettings | undefined
): QuestionStageDef[] {
  return QUESTION_STAGES.filter((stage) => isStageEnabled(settings, stage.id));
}
