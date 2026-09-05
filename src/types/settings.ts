// file: src/types/settings.ts
// Shape of the `session_settings` blob in app_config. Every key the blob can hold lives
// here so the admin tabs and the consumers stop drifting apart.
//
// NOTE: /save-session-settings shallow-merges, and each admin tab posts the whole object
// it holds. So a tab must type its state as `Pick<SessionSettings, ...>` of exactly the
// keys it owns — typing it as the full SessionSettings would make it post keys owned by
// another tab (e.g. auto_cache_refresh) and clobber them.
import type { QuestionStageId } from "@/lib/questionStages";

export interface SessionSettings {
  suggestion_order: "random" | "fixed";
  max_choices: number;
  max_exclusions: number;
  enable_collections: boolean;
  enable_plex_button: boolean;
  enable_label_restrictions: boolean;
  label_restriction_mode: "include" | "exclude";
  restricted_labels: string[];
  rating_display: "critic" | "audience" | "both";
  enable_lobby_qr: boolean;
  hard_filter_preferences: boolean;
  /** Exclude items a Plex-signed-in user has already watched from their deck. */
  filter_watched_items: boolean;
  require_plex_member: boolean;
  restrict_create_plex: boolean;
  restrict_create_password: boolean;
  trailers_mode: "off" | "on" | "voting";
  /** Which questionnaire stages to ask. A missing stage key reads as enabled. */
  question_stages: Record<QuestionStageId, boolean>;
  /** Owned by the Connection tab, not the Settings tab. */
  auto_cache_refresh: boolean;
}

export const DEFAULT_SESSION_SETTINGS: SessionSettings = {
  suggestion_order: "random",
  max_choices: 3,
  max_exclusions: 3,
  enable_collections: false,
  enable_plex_button: false,
  enable_label_restrictions: false,
  label_restriction_mode: "include",
  restricted_labels: [],
  rating_display: "critic",
  enable_lobby_qr: false,
  hard_filter_preferences: true,
  filter_watched_items: true,
  require_plex_member: false,
  restrict_create_plex: false,
  restrict_create_password: false,
  trailers_mode: "off",
  question_stages: { genre: true, era: true, runtime: true, language: true },
  auto_cache_refresh: false,
};

/** The subset the questionnaire needs. */
export type QuestionFlowSettings = Pick<
  SessionSettings,
  "max_choices" | "max_exclusions" | "question_stages"
>;

export const DEFAULT_QUESTION_FLOW_SETTINGS: QuestionFlowSettings = {
  max_choices: DEFAULT_SESSION_SETTINGS.max_choices,
  max_exclusions: DEFAULT_SESSION_SETTINGS.max_exclusions,
  question_stages: DEFAULT_SESSION_SETTINGS.question_stages,
};
