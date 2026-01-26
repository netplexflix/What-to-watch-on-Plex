// file: src/types/session.ts
export interface Session {
  id: string;
  code: string;
  host_user_id: string | null;
  status: 'waiting' | 'questions' | 'swiping' | 'voting' | 'completed' | 'no_match';
  created_at: string;
  updated_at: string;
  preferences: SessionPreferences;
  winner_item_key: string | null;
  media_type?: 'movies' | 'shows' | 'both';
  timed_duration?: number | null;  // in minutes
  timer_end_at?: string | null;    // ISO timestamp
}

// Selection state: undefined = not selected, true = preferred, false = excluded
export type SelectionState = boolean | undefined;

export interface SessionPreferences {
  genres?: string[];
  excludedGenres?: string[];
  eras?: string[];
  excludedEras?: string[];
  languages?: string[];
  excludedLanguages?: string[];
  selectedCollections?: string[];
  // Legacy support
  era?: string;
}

export interface Participant {
  id: string;
  session_id: string;
  user_id: string | null;
  display_name: string;
  is_guest: boolean;
  plex_token: string | null;
  preferences: SessionPreferences;
  questions_completed: boolean;
  created_at: string;
}

export interface Vote {
  id: string;
  session_id: string;
  participant_id: string;
  item_key: string;
  vote: boolean;
  created_at: string;
}

export interface PlexItem {
  ratingKey: string;
  title: string;
  year: number;
  summary: string;
  thumb: string;
  art?: string;
  duration: number;
  rating?: number;
  contentRating?: string;
  genres: string[];
  directors?: string[];
  actors?: string[];
  type: 'movie' | 'show';
  studio?: string;
  audienceRating?: number;
  languages?: string[];
}