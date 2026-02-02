// File: src/pages/Swipe.tsx
import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Loader2, RotateCcw, Clock } from "lucide-react";
import { Logo } from "@/components/Logo";
import { SwipeCard } from "@/components/SwipeCard";
import { Button } from "@/components/ui/button";
import { sessionsApi, plexApi, adminApi } from "@/lib/api";
import { wsClient } from "@/lib/websocket";
import { getLocalSession } from "@/lib/sessionStore";
import { toast } from "sonner";
import { useHaptics } from "@/hooks/useHaptics";
import type { PlexItem, Participant } from "@/types/session";

// Genre name mapping - maps UI names to possible Plex genre names
const GENRE_ALIASES: Record<string, string[]> = {
  "Sci-Fi": ["Science Fiction", "Sci-Fi", "SciFi", "SF"],
  "Science Fiction": ["Science Fiction", "Sci-Fi", "SciFi", "SF"],
  "Rom-Com": ["Romantic Comedy", "Romance", "Comedy"],
  "Romantic Comedy": ["Romantic Comedy", "Romance"],
  "Action": ["Action", "Action/Adventure"],
  "Adventure": ["Adventure", "Action/Adventure"],
};

// Normalize a genre name for comparison
function normalizeGenre(genre: string): string {
  return genre.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Check if an item's genres match any of the preferred genres
function itemMatchesGenres(itemGenres: string[], preferredGenres: string[]): boolean {
  if (preferredGenres.length === 0) return true;
  
  const normalizedItemGenres = itemGenres.map(normalizeGenre);
  
  for (const preferred of preferredGenres) {
    if (normalizedItemGenres.includes(normalizeGenre(preferred))) {
      return true;
    }
    
    const aliases = GENRE_ALIASES[preferred] || [];
    for (const alias of aliases) {
      if (normalizedItemGenres.includes(normalizeGenre(alias))) {
        return true;
      }
    }
  }
  
  return false;
}

// Check if an item's genres match any excluded genres
function itemMatchesExcludedGenres(itemGenres: string[], excludedGenres: string[]): boolean {
  if (excludedGenres.length === 0) return false;
  
  const normalizedItemGenres = itemGenres.map(normalizeGenre);
  
  for (const excluded of excludedGenres) {
    if (normalizedItemGenres.includes(normalizeGenre(excluded))) {
      return true;
    }
    
    const aliases = GENRE_ALIASES[excluded] || [];
    for (const alias of aliases) {
      if (normalizedItemGenres.includes(normalizeGenre(alias))) {
        return true;
      }
    }
  }
  
  return false;
}

// Normalize language for comparison
function normalizeLanguage(lang: string): string {
  return lang.toLowerCase().trim();
}

// Check if item languages match preferred languages
function itemMatchesLanguages(itemLanguages: string[], preferredLanguages: string[]): boolean {
  if (preferredLanguages.length === 0) return true;
  if (itemLanguages.length === 0) return false;
  
  const normalizedItemLangs = itemLanguages.map(normalizeLanguage);
  
  for (const preferred of preferredLanguages) {
    if (normalizedItemLangs.includes(normalizeLanguage(preferred))) {
      return true;
    }
  }
  
  return false;
}

// Seeded random number generator for consistent shuffling
function seededRandom(seed: number) {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}

function shuffleWithSeed<T>(array: T[], seed: number): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(seededRandom(seed + i) * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function matchesEra(year: number, era: string): boolean {
  const currentYear = new Date().getFullYear();
  switch (era) {
    case 'recent': return year >= currentYear - 2;
    case '2020s': return year >= 2020;
    case '2010s': return year >= 2010 && year < 2020;
    case '2000s': return year >= 2000 && year < 2010;
    case '90s': return year >= 1990 && year < 2000;
    case 'classic': return year < 1990;
    default: return false;
  }
}

// Score an item based on how well it matches preferences (higher = better match)
function scoreItem(item: any, filters: any): number {
  let score = 0;
  
  const itemGenres = item.genres || [];
  const year = item.year;
  const itemLanguages = item.languages || [];
  
  if (filters.genres?.length > 0 && itemGenres.length > 0) {
    if (itemMatchesGenres(itemGenres, filters.genres)) {
      score += 100;
    }
  }
  
  if (filters.eras?.length > 0 && year) {
    if (filters.eras.some((era: string) => matchesEra(year, era))) {
      score += 50;
    }
  }
  
  if (filters.languages?.length > 0) {
    if (itemMatchesLanguages(itemLanguages, filters.languages)) {
      score += 75;
    }
  }
  
  return score;
}

const Swipe = () => {
  const navigate = useNavigate();
  const { code } = useParams<{ code: string }>();
  const localSession = getLocalSession();
  const haptics = useHaptics();
  
  const [items, setItems] = useState<PlexItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState("Loading session...");
  const [waitingForQuestions, setWaitingForQuestions] = useState(false);
  const [questionsProgress, setQuestionsProgress] = useState({ completed: 0, total: 0 });
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [swipeHistory, setSwipeHistory] = useState<{ item: PlexItem; direction: "left" | "right" }[]>([]);
  const [waitingForOthers, setWaitingForOthers] = useState(false);
  const [matchFound, setMatchFound] = useState(false);
  const [winnerItemKey, setWinnerItemKey] = useState<string | null>(null);
  const [sessionMediaType, setSessionMediaType] = useState<'movies' | 'shows' | 'both'>('both');
  const [ratingDisplay, setRatingDisplay] = useState<'critic' | 'audience' | 'both'>('critic');
  const [labelRestrictions, setLabelRestrictions] = useState<{
    enabled: boolean;
    mode: 'include' | 'exclude';
    labels: string[];
  }>({ enabled: false, mode: 'include', labels: [] });
  
  // Timer state for timed sessions
  const [isTimedSession, setIsTimedSession] = useState(false);
  const [timerEndAt, setTimerEndAt] = useState<Date | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(0); // in seconds
  const [timerProgress, setTimerProgress] = useState(100); // percentage
  const [totalDuration, setTotalDuration] = useState<number>(0); // in seconds
  
  const itemsLoadedRef = useRef(false);
  const sessionSeedRef = useRef<number | null>(null);
  const isInitializedRef = useRef(false);
  const currentIndexRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);
  const mediaTypeRef = useRef<string | null>(null);
  const participantsRef = useRef<Participant[]>([]);
  const hasNavigatedRef = useRef(false);
  const orderModeRef = useRef<"random" | "fixed">("random");
  const baseItemOrderRef = useRef<string[]>([]);
  const isSwipingRef = useRef(false);
  const timerIntervalRef = useRef<number | null>(null);
  const isTimedSessionRef = useRef(false);
  const labelRestrictionsRef = useRef(labelRestrictions);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  useEffect(() => {
    isTimedSessionRef.current = isTimedSession;
  }, [isTimedSession]);

  useEffect(() => {
    labelRestrictionsRef.current = labelRestrictions;
  }, [labelRestrictions]);

  // Timer countdown effect
  useEffect(() => {
    if (!isTimedSession || !timerEndAt || hasNavigatedRef.current) {
      return;
    }

    console.log('[Swipe] Starting timer countdown, ends at:', timerEndAt.toISOString());

    const updateTimer = () => {
      const now = new Date();
      const remaining = Math.max(0, Math.floor((timerEndAt.getTime() - now.getTime()) / 1000));
      setTimeRemaining(remaining);
      
      if (totalDuration > 0) {
        const progress = (remaining / totalDuration) * 100;
        setTimerProgress(Math.max(0, Math.min(100, progress)));
      }
      
      // Timer expired
      if (remaining <= 0 && !hasNavigatedRef.current) {
        console.log("[Swipe] Timer expired! Navigating to timed results");
        hasNavigatedRef.current = true;
        
        // Clear the interval
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
        }
        
        haptics.medium();
        navigate(`/timed-results/${code}`);
      }
    };

    // Initial update
    updateTimer();

    // Update every second
    timerIntervalRef.current = window.setInterval(updateTimer, 1000);

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [isTimedSession, timerEndAt, totalDuration, code, navigate, haptics]);

  // Effect to handle navigation when match is found (non-timed sessions only)
  useEffect(() => {
    if (matchFound && !hasNavigatedRef.current && !isTimedSessionRef.current) {
      hasNavigatedRef.current = true;
      console.log("[Swipe] Match found, navigating to results");
      navigate(`/results/${code}`);
    }
  }, [matchFound, navigate, code]);

  const navigateToResults = useCallback(() => {
    if (hasNavigatedRef.current) return;
    if (isTimedSessionRef.current) {
      // For timed sessions, go to timed-results
      hasNavigatedRef.current = true;
      navigate(`/timed-results/${code}`);
    } else {
      setMatchFound(true);
    }
  }, [navigate, code]);

  const checkAllQuestionsCompleted = useCallback(async (sessionIdToCheck: string): Promise<{ allCompleted: boolean; participants: Participant[] }> => {
    const { data } = await sessionsApi.getParticipants(sessionIdToCheck);

    if (!data?.participants || data.participants.length === 0) {
      return { allCompleted: false, participants: [] };
    }

    const mappedParticipants: Participant[] = data.participants.map((p: any) => ({
      ...p,
      preferences: p.preferences || {},
    }));

    const completedCount = mappedParticipants.filter(p => p.questions_completed).length;
    const allCompleted = completedCount === mappedParticipants.length;
    
    setQuestionsProgress({ completed: completedCount, total: mappedParticipants.length });
    
    return { allCompleted, participants: mappedParticipants };
  }, []);

  const aggregatePreferences = useCallback((participantsList: Participant[]) => {
    const participantsWithGenres: string[][] = [];
    const allExcludedGenres: string[] = [];
    const participantsWithEras: string[][] = [];
    const allExcludedEras: string[] = [];
    const participantsWithLanguages: string[][] = [];
    const allExcludedLanguages: string[] = [];

    participantsList.forEach((p) => {
      if (p.preferences?.genres && p.preferences.genres.length > 0) {
        participantsWithGenres.push(p.preferences.genres);
      }
      if (p.preferences?.excludedGenres) allExcludedGenres.push(...p.preferences.excludedGenres);
      
      if (p.preferences?.eras && p.preferences.eras.length > 0) {
        participantsWithEras.push(p.preferences.eras);
      }
      if (p.preferences?.excludedEras) allExcludedEras.push(...p.preferences.excludedEras);
      
      if (p.preferences?.languages && p.preferences.languages.length > 0) {
        participantsWithLanguages.push(p.preferences.languages);
      }
      if (p.preferences?.excludedLanguages) allExcludedLanguages.push(...p.preferences.excludedLanguages);
    });

    let finalGenres: string[] = [];
    if (participantsWithGenres.length > 0) {
      const allGenres = participantsWithGenres.flat();
      finalGenres = [...new Set(allGenres)];
    }

    let finalEras: string[] = [];
    if (participantsWithEras.length > 0) {
      const allEras = participantsWithEras.flat();
      finalEras = [...new Set(allEras)];
    }

    let finalLanguages: string[] = [];
    if (participantsWithLanguages.length > 0) {
      const allLanguages = participantsWithLanguages.flat();
      finalLanguages = [...new Set(allLanguages)];
    }

    return {
      genres: finalGenres,
      excludedGenres: [...new Set(allExcludedGenres)],
      eras: finalEras,
      excludedEras: [...new Set(allExcludedEras)],
      languages: finalLanguages,
      excludedLanguages: [...new Set(allExcludedLanguages)],
    };
  }, []);

  const loadMediaItems = useCallback(async (sid: string, mediaType?: string | null, useWatchlist?: boolean, hostPlexToken?: string | null) => {
    if (itemsLoadedRef.current) return;
    
    try {
      setLoading(true);
      setWaitingForQuestions(false);
      setLoadingMessage("Loading participants...");
      
      const { data: participantsData } = await sessionsApi.getParticipants(sid);

      if (!participantsData?.participants) {
        setLoading(false);
        return;
      }

      const mappedParticipants: Participant[] = participantsData.participants.map((p: any) => ({
        ...p,
        preferences: p.preferences || {},
      }));
      setParticipants(mappedParticipants);
      participantsRef.current = mappedParticipants;

      setLoadingMessage("Calculating preferences...");
      
      const aggregatedFilters = aggregatePreferences(mappedParticipants);
      console.log('[Swipe] Aggregated filters:', aggregatedFilters);

      // Load admin settings
      let currentLabelRestrictions = labelRestrictionsRef.current;
      try {
        const { data: settingsData } = await adminApi.getSessionSettings();
        if (settingsData?.settings) {
          setRatingDisplay(settingsData.settings.rating_display || 'critic');
          if (settingsData.settings.enable_label_restrictions) {
            currentLabelRestrictions = {
              enabled: true,
              mode: settingsData.settings.label_restriction_mode || 'include',
              labels: settingsData.settings.restricted_labels || [],
            };
            setLabelRestrictions(currentLabelRestrictions);
          }
        }
      } catch (e) {
        console.error('[Swipe] Error loading admin settings:', e);
      }

      const { data: sessionSettingsData } = await sessionsApi.getConfig('session_settings');
      const sessionSettings = sessionSettingsData?.value || {};
      const orderMode = sessionSettings.suggestion_order || "random";
      orderModeRef.current = orderMode;

      const currentParticipant = mappedParticipants.find(p => p.id === localSession?.participantId);
      const userPlexToken = currentParticipant?.plex_token;

      setLoadingMessage("Loading media from cache...");
      
      let fetchedItems: any[] = [];
      
      // Check if this is a watchlist-based session
      if (useWatchlist && hostPlexToken) {
        setLoadingMessage("Loading from watchlist...");
        try {
          const { data: watchlistData } = await plexApi.getWatchlist(hostPlexToken);
          if (watchlistData?.watchlistKeys && watchlistData.watchlistKeys.length > 0) {
            // Get all cached items first
            const { data: cachedData } = await sessionsApi.getCachedMedia(mediaType || 'both');
            if (cachedData?.items) {
              const watchlistSet = new Set(watchlistData.watchlistKeys);
              fetchedItems = cachedData.items.filter((item: any) => watchlistSet.has(item.ratingKey));
              console.log(`[Swipe] Filtered to ${fetchedItems.length} watchlist items`);
            }
          }
        } catch (e) {
          console.error('[Swipe] Error loading watchlist:', e);
        }
      }
      
      // If no watchlist items or not a watchlist session, load from cache normally
      if (fetchedItems.length === 0) {
        const { data: cachedData } = await sessionsApi.getCachedMedia(mediaType || 'both');
        
        if (cachedData?.items && cachedData.items.length > 0) {
          console.log(`[Swipe] Loaded ${cachedData.items.length} items from cache`);
          fetchedItems = cachedData.items;
        } else {
          setLoadingMessage("Fetching media from Plex...");
          const { data: mediaData } = await plexApi.getMedia(
            mediaType || 'both',
            aggregatedFilters,
            userPlexToken || undefined
          );
          fetchedItems = mediaData?.items || [];
          console.log(`[Swipe] Loaded ${fetchedItems.length} items from Plex API`);
        }
      }

      // Check if session has selected collections
      const { data: sessionData } = await sessionsApi.getById(sid);
      const selectedCollectionKeys = sessionData?.session?.preferences?.selectedCollections || [];

      console.log('[Swipe] Selected collections:', selectedCollectionKeys);

      if (selectedCollectionKeys.length > 0) {
        setLoadingMessage("Filtering by collections...");
        try {
          const { data: collectionItemsData } = await plexApi.getCollectionItems(selectedCollectionKeys);
          console.log('[Swipe] Collection items response:', collectionItemsData);
          
          if (collectionItemsData?.itemKeys && collectionItemsData.itemKeys.length > 0) {
            const allowedKeys = new Set(collectionItemsData.itemKeys);
            const beforeCount = fetchedItems.length;
            fetchedItems = fetchedItems.filter((item: any) => allowedKeys.has(item.ratingKey));
            console.log(`[Swipe] Filtered to ${fetchedItems.length} items from ${beforeCount} (collections filter)`);
          } else {
            console.log('[Swipe] No items returned from collection filter');
          }
        } catch (err) {
          console.error('[Swipe] Error filtering by collections:', err);
        }
      }

      // Apply label restrictions if enabled
      if (currentLabelRestrictions.enabled && currentLabelRestrictions.labels.length > 0) {
        const beforeCount = fetchedItems.length;
        fetchedItems = fetchedItems.filter((item: any) => {
          const itemLabels = item.labels || [];
          
          if (currentLabelRestrictions.mode === 'include') {
            // Only include items that have at least one of the restricted labels
            return currentLabelRestrictions.labels.some(label => itemLabels.includes(label));
          } else {
            // Exclude items that have any of the restricted labels
            return !currentLabelRestrictions.labels.some(label => itemLabels.includes(label));
          }
        });
        console.log(`[Swipe] After label restrictions: ${fetchedItems.length} items (${currentLabelRestrictions.mode} mode, removed ${beforeCount - fetchedItems.length})`);
      }

      setLoadingMessage("Applying filters...");
      
      // Apply HARD filters (exclusions only)
      const hasExclusions = aggregatedFilters && (
        (aggregatedFilters.excludedGenres?.length > 0) ||
        (aggregatedFilters.excludedEras?.length > 0) ||
        (aggregatedFilters.excludedLanguages?.length > 0)
      );

      if (hasExclusions) {
        const beforeCount = fetchedItems.length;
        fetchedItems = fetchedItems.filter((item: any) => {
          const itemGenres = item.genres || [];
          const year = item.year;
          const itemLanguages = item.languages || [];
          
          if (aggregatedFilters.excludedGenres && aggregatedFilters.excludedGenres.length > 0) {
            if (itemMatchesExcludedGenres(itemGenres, aggregatedFilters.excludedGenres)) {
              return false;
            }
          }
          
          if (aggregatedFilters.excludedEras && aggregatedFilters.excludedEras.length > 0 && year) {
            if (aggregatedFilters.excludedEras.some((era: string) => matchesEra(year, era))) {
              return false;
            }
          }
          
          if (aggregatedFilters.excludedLanguages && aggregatedFilters.excludedLanguages.length > 0) {
            if (itemLanguages.length > 0) {
              const normalizedItemLangs = itemLanguages.map(normalizeLanguage);
              if (aggregatedFilters.excludedLanguages.some((l: string) => normalizedItemLangs.includes(normalizeLanguage(l)))) {
                return false;
              }
            }
          }
          
          return true;
        });
        console.log(`[Swipe] After exclusion filters: ${fetchedItems.length} items (removed ${beforeCount - fetchedItems.length})`);
      }

      setLoadingMessage("Preparing suggestions...");
      
      const hasPreferences = aggregatedFilters && (
        (aggregatedFilters.genres?.length > 0) ||
        (aggregatedFilters.eras?.length > 0) ||
        (aggregatedFilters.languages?.length > 0)
      );

      // Transform items and add scores
      const transformedItems: (PlexItem & { _score: number })[] = fetchedItems.map((item: any) => ({
        ratingKey: item.ratingKey,
        title: item.title,
        year: item.year || 0,
        summary: item.summary || "",
        thumb: item.thumb || "/placeholder.svg",
        art: item.art,
        duration: item.duration || 0,
        rating: item.rating || item.audienceRating,
        contentRating: item.contentRating,
        genres: item.genres || [],
        directors: item.directors || [],
        actors: item.actors || [],
        type: item.type === "show" ? "show" : "movie",
        studio: item.studio,
        audienceRating: item.audienceRating,
        languages: item.languages || [],
        _score: hasPreferences ? scoreItem(item, aggregatedFilters) : 0,
      }));

      let orderedItems: (PlexItem & { _score: number })[];
      
      const seed = sessionSeedRef.current || 0;
      
      if (orderMode === "fixed") {
        transformedItems.sort((a, b) => {
          if (b._score !== a._score) return b._score - a._score;
          return a.ratingKey.localeCompare(b.ratingKey);
        });
        
        const scoreGroups = new Map<number, typeof transformedItems>();
        for (const item of transformedItems) {
          const group = scoreGroups.get(item._score) || [];
          group.push(item);
          scoreGroups.set(item._score, group);
        }
        
        orderedItems = [];
        const sortedScores = Array.from(scoreGroups.keys()).sort((a, b) => b - a);
        for (const score of sortedScores) {
          const group = scoreGroups.get(score)!;
          const shuffledGroup = shuffleWithSeed(group, seed + score);
          orderedItems.push(...shuffledGroup);
        }
        
        baseItemOrderRef.current = orderedItems.map(item => item.ratingKey);
        
        console.log(`[Swipe] Using fixed order with seed: ${seed}`);
      } else {
        orderedItems = shuffleWithSeed(transformedItems, Date.now() + Math.random() * 1000000);
        
        if (hasPreferences) {
          orderedItems.sort((a, b) => b._score - a._score);
        }
        
        console.log(`[Swipe] Using random order`);
      }

      // Filter watched items
      if (userPlexToken) {
        setLoadingMessage("Filtering watched items...");
        try {
          const { data: watchedData } = await plexApi.getWatchedKeys(userPlexToken);
          if (watchedData?.watchedKeys && watchedData.watchedKeys.length > 0) {
            const watchedSet = new Set(watchedData.watchedKeys);
            const beforeCount = orderedItems.length;
            
            orderedItems = orderedItems.filter((item) => !watchedSet.has(item.ratingKey));
            
            console.log(`[Swipe] Filtered out ${beforeCount - orderedItems.length} watched items`);
          }
        } catch (err) {
          console.error('[Swipe] Error filtering watched items:', err);
        }
      }

      const finalItems: PlexItem[] = orderedItems.map(({ _score, ...item }) => item as PlexItem);

      itemsLoadedRef.current = true;
      setItems(finalItems);

      console.log(`[Swipe] Ready with ${finalItems.length} items`);

      // Update session status to swiping - this will trigger timer_end_at to be set on server
      console.log('[Swipe] Updating session status to swiping...');
      const { data: updateData } = await sessionsApi.update(sid, { status: "swiping" });
      
      // Check if server returned timer_end_at (for timed sessions)
      if (updateData?.session?.timer_end_at && isTimedSessionRef.current) {
        const endTime = new Date(updateData.session.timer_end_at);
        console.log('[Swipe] Server set timer_end_at:', endTime.toISOString());
        setTimerEndAt(endTime);
      }

    } catch (error) {
      console.error("[Swipe] Error loading media:", error);
      toast.error("Failed to load media");
    } finally {
      setLoading(false);
    }
  }, [localSession, aggregatePreferences]);

  useEffect(() => {
    if (!code || isInitializedRef.current) return;
    isInitializedRef.current = true;

    const initSession = async () => {
      try {
        setLoadingMessage("Loading session...");
        
        const { data: sessionData, error: sessionError } = await sessionsApi.getByCode(code);

        if (sessionError || !sessionData?.session) {
          toast.error("Session not found");
          navigate("/");
          return;
        }

        const session = sessionData.session;
        setSessionId(session.id);
        sessionIdRef.current = session.id;
        mediaTypeRef.current = session.media_type;
        setSessionMediaType(session.media_type || 'both');
        
        sessionSeedRef.current = session.id.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0) + 
          new Date(session.created_at).getTime();

        // Check if this is a timed session
        if (session.timed_duration && session.timed_duration > 0) {
          console.log(`[Swipe] This is a timed session: ${session.timed_duration} minutes`);
          setIsTimedSession(true);
          isTimedSessionRef.current = true;
          setTotalDuration(session.timed_duration * 60); // Convert minutes to seconds
          
          // If timer_end_at is already set (session already started), use it
          if (session.timer_end_at) {
            const endTime = new Date(session.timer_end_at);
            console.log(`[Swipe] Timer already running, ends at: ${endTime.toISOString()}`);
            setTimerEndAt(endTime);
            
            // Check if timer already expired
            if (endTime.getTime() <= Date.now()) {
              console.log('[Swipe] Timer already expired, navigating to timed results');
              hasNavigatedRef.current = true;
              navigate(`/timed-results/${code}`);
              return;
            }
          }
        }

        if (session.winner_item_key) {
          setWinnerItemKey(session.winner_item_key);
          navigateToResults();
          return;
        }

        setLoadingMessage("Connecting...");
        
        await wsClient.connect();
        await wsClient.subscribe(session.id, localSession?.participantId);

        const { allCompleted, participants: currentParticipants } = await checkAllQuestionsCompleted(session.id);
        
        if (!allCompleted) {
          setWaitingForQuestions(true);
          setLoading(false);
        } else if (!itemsLoadedRef.current) {
          setParticipants(currentParticipants);
          participantsRef.current = currentParticipants;
          await loadMediaItems(session.id, session.media_type, session.use_watchlist, session.host_plex_token);
        }
      } catch (error) {
        console.error("[Swipe] Error loading session:", error);
        toast.error("Failed to load session");
        setLoading(false);
      }
    };

    initSession();

    return () => {
      wsClient.unsubscribe();
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [code, navigate, checkAllQuestionsCompleted, localSession, loadMediaItems, navigateToResults]);

  useEffect(() => {
    if (!sessionId) return;

    const unsubParticipantUpdated = wsClient.on('participant_updated', async () => {
      const sid = sessionIdRef.current;
      if (!sid) return;

      if (waitingForQuestions) {
        const { allCompleted, participants: currentParticipants } = await checkAllQuestionsCompleted(sid);
        if (allCompleted && !itemsLoadedRef.current) {
          setParticipants(currentParticipants);
          participantsRef.current = currentParticipants;
          
          // Get session data for watchlist info
          const { data: sessionData } = await sessionsApi.getById(sid);
          await loadMediaItems(sid, mediaTypeRef.current, sessionData?.session?.use_watchlist, sessionData?.session?.host_plex_token);
        }
      }
    });

    const unsubVoteAdded = wsClient.on('vote_added', async () => {
      if (hasNavigatedRef.current || matchFound) return;
      
      // For timed sessions, don't check for immediate match on every vote
      if (isTimedSessionRef.current) return;
      
      const sid = sessionIdRef.current;
      if (!sid) return;
      
      try {
        const { data: sessionData } = await sessionsApi.getById(sid);
        if (sessionData?.session?.winner_item_key || sessionData?.session?.status === 'completed') {
          console.log("[Swipe] Match detected via vote_added event");
          setWinnerItemKey(sessionData.session.winner_item_key);
          navigateToResults();
        }
      } catch (err) {
        console.error("[Swipe] Error checking session after vote:", err);
      }
    });

    const unsubSessionUpdated = wsClient.on('session_updated', (data) => {
      console.log("[Swipe] session_updated event received:", data);
      
      // Update timer_end_at if provided (for timed sessions)
      if (data.timer_end_at && isTimedSessionRef.current) {
        const endTime = new Date(data.timer_end_at);
        console.log(`[Swipe] Timer updated via WebSocket: ends at ${endTime.toISOString()}`);
        setTimerEndAt(endTime);
      }
      
      if (data.winner_item_key || data.status === 'completed') {
        // For timed sessions, go to timed-results instead
        if (isTimedSessionRef.current) {
          console.log("[Swipe] Timed session completed, navigating to timed results");
          if (!hasNavigatedRef.current) {
            hasNavigatedRef.current = true;
            navigate(`/timed-results/${code}`);
          }
          return;
        }
        
        console.log("[Swipe] Match detected via session_updated, navigating...");
        if (data.winner_item_key) {
          setWinnerItemKey(data.winner_item_key);
        }
        navigateToResults();
        return;
      }
      
      if (data.status === 'no_match') {
        console.log("[Swipe] No match status received, navigating...");
        navigateToResults();
        return;
      }
      
      if (data.status === 'questions') {
        navigate(`/questions/${code}`);
      }
    });

    return () => {
      unsubParticipantUpdated();
      unsubVoteAdded();
      unsubSessionUpdated();
    };
  }, [sessionId, waitingForQuestions, matchFound, code, navigate, checkAllQuestionsCompleted, loadMediaItems, navigateToResults]);

  // Periodically check for match (backup mechanism) - only for non-timed sessions
  useEffect(() => {
    if (!sessionId || loading || waitingForQuestions || matchFound || hasNavigatedRef.current) return;
    
    // Skip periodic match check for timed sessions
    if (isTimedSessionRef.current) return;

    const checkForMatch = async () => {
      try {
        const { data: sessionData } = await sessionsApi.getById(sessionId);
        if (sessionData?.session?.winner_item_key || sessionData?.session?.status === 'completed') {
          console.log("[Swipe] Match detected via periodic check");
          if (sessionData.session.winner_item_key) {
            setWinnerItemKey(sessionData.session.winner_item_key);
          }
          navigateToResults();
        }
      } catch (err) {
        // Silently ignore errors in periodic check
      }
    };

    // Check every 2 seconds as a backup
    const intervalId = setInterval(checkForMatch, 2000);

    return () => clearInterval(intervalId);
  }, [sessionId, loading, waitingForQuestions, matchFound, navigateToResults]);

  const handleSwipe = useCallback(
    async (direction: "left" | "right") => {
      // Prevent concurrent swipes
      if (isSwipingRef.current) return;
      if (!localSession || !sessionIdRef.current || currentIndexRef.current >= items.length) return;
      if (hasNavigatedRef.current || matchFound) return;

      isSwipingRef.current = true;

      const currentItem = items[currentIndexRef.current];
      const isLike = direction === "right";

      if (isLike) {
        haptics.medium();
      } else {
        haptics.light();
      }

      setSwipeHistory((prev) => [...prev, { item: currentItem, direction }]);

      try {
        const { data, error } = await sessionsApi.addVote(
          sessionIdRef.current, 
          localSession.participantId, 
          currentItem.ratingKey, 
          isLike
        );

        if (error) {
          throw new Error(error);
        }

        // For non-timed sessions, server detected a match - set state to trigger navigation immediately
        if (data?.match && !isTimedSessionRef.current) {
          console.log("[Swipe] Server confirmed match for item:", data.winnerItemKey || currentItem.ratingKey);
          haptics.success();
          if (data.winnerItemKey) {
            setWinnerItemKey(data.winnerItemKey);
          }
          setMatchFound(true);
          isSwipingRef.current = false;
          return;
        }
      } catch (error) {
        console.error("[Swipe] Error recording vote:", error);
        haptics.error();
        toast.error("Failed to record vote");
        setSwipeHistory((prev) => prev.slice(0, -1));
        isSwipingRef.current = false;
        return;
      }

      // Check if we've already navigated (could happen via WebSocket while awaiting)
      if (hasNavigatedRef.current || matchFound) {
        isSwipingRef.current = false;
        return;
      }

      // Move to next card after successful vote
      const nextIndex = currentIndexRef.current + 1;
      setCurrentIndex(nextIndex);
      isSwipingRef.current = false;

      // For timed sessions, don't end when items run out - just show waiting
      if (nextIndex >= items.length) {
        if (isTimedSessionRef.current) {
          setWaitingForOthers(true);
          // Don't navigate - wait for timer to expire
        } else {
          setWaitingForOthers(true);
          
          setTimeout(async () => {
            if (hasNavigatedRef.current || matchFound) return;
            
            const sid = sessionIdRef.current;
            if (!sid) return;
            
            const { data: votesData } = await sessionsApi.getVotes(sid);
            const { data: participantsData } = await sessionsApi.getParticipants(sid);
            
            if (votesData?.votes && participantsData?.participants) {
              const votesPerParticipant = new Map<string, number>();
              votesData.votes.forEach((v: any) => {
                votesPerParticipant.set(v.participant_id, (votesPerParticipant.get(v.participant_id) || 0) + 1);
              });
              
              const allDone = participantsData.participants.every((p: any) => 
                (votesPerParticipant.get(p.id) || 0) >= items.length
              );
              
              if (allDone && !hasNavigatedRef.current && !matchFound) {
                const { data: sessionData } = await sessionsApi.getById(sid);
                if (sessionData?.session?.winner_item_key) {
                  setWinnerItemKey(sessionData.session.winner_item_key);
                  navigateToResults();
                  return;
                }
                
                await sessionsApi.update(sid, { status: "no_match" });
                navigateToResults();
              }
            }
          }, 2000);
        }
      }
    },
    [localSession, items, haptics, navigateToResults, matchFound]
  );

  const handleUndo = useCallback(() => {
    if (swipeHistory.length === 0 || currentIndex === 0) return;
    if (isSwipingRef.current) return;

    haptics.light();
    const lastSwipe = swipeHistory[swipeHistory.length - 1];
    setSwipeHistory((prev) => prev.slice(0, -1));
    setCurrentIndex((prev) => prev - 1);
    setWaitingForOthers(false);

    if (localSession && sessionIdRef.current) {
      sessionsApi.deleteVote(sessionIdRef.current, localSession.participantId, lastSwipe.item.ratingKey);
    }
  }, [swipeHistory, currentIndex, localSession, haptics]);

  const handleRestartSession = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    
    haptics.medium();
    
    try {
      itemsLoadedRef.current = false;
      
      await sessionsApi.update(sid, { status: "questions" });
      
      for (const p of participantsRef.current) {
        await sessionsApi.updateParticipant(p.id, { questions_completed: false });
      }
      
      navigate(`/questions/${code}`);
      toast.success("Session restarted - adjust your preferences!");
    } catch (error) {
      console.error("[Swipe] Error restarting session:", error);
      haptics.error();
      toast.error("Failed to restart session");
    }
  }, [code, navigate, haptics]);

  // Format time remaining for display
  const formatTimeRemaining = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Show loading while match navigation is pending
  if (matchFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="animate-spin text-primary mx-auto mb-4" size={48} />
          <p className="text-muted-foreground">It's a match! Loading results...</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="animate-spin text-primary mx-auto mb-4" size={48} />
          <p className="text-muted-foreground">{loadingMessage}</p>
        </div>
      </div>
    );
  }

  if (waitingForQuestions) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6">
        <Logo size="md" className="justify-center mb-8" />
        <Loader2 className="animate-spin text-primary mb-4" size={48} />
        <h1 className="text-2xl font-bold text-foreground mb-2">Almost Ready!</h1>
        <p className="text-muted-foreground text-center">
          Waiting for all participants to answer their preference questions...
        </p>
        <div className="mt-6 glass-card rounded-xl p-4">
          <p className="text-sm text-muted-foreground">
            {questionsProgress.completed} / {questionsProgress.total} completed
          </p>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    const isHost = localSession?.isHost || false;
    
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6">
        <Logo size="md" className="justify-center mb-8" />
        <h1 className="text-2xl font-bold text-foreground mb-2">No Media Found</h1>
        <p className="text-muted-foreground text-center mb-6 max-w-sm">
          No movies or shows match the group's preferences. Try adjusting your filters or removing some exclusions.
        </p>
        {isHost ? (
          <Button onClick={handleRestartSession} className="bg-primary text-primary-foreground">
            <RotateCcw size={18} className="mr-2" />
            Restart & Adjust Preferences
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">Waiting for host to restart session...</p>
        )}
      </div>
    );
  }

  if (waitingForOthers) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6">
        <Logo size="md" className="justify-center mb-8" />
        
        {/* Timer bar for timed sessions */}
        {isTimedSession && timerEndAt && (
          <div className="w-full max-w-md mb-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Time remaining</span>
              </div>
              <span className="text-sm font-mono text-foreground">{formatTimeRemaining(timeRemaining)}</span>
            </div>
            <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
              <motion.div
                className={`h-full transition-colors duration-500 ${
                  timerProgress < 20 ? 'bg-destructive' : timerProgress < 50 ? 'bg-accent' : 'bg-primary'
                }`}
                style={{ width: `${timerProgress}%` }}
              />
            </div>
          </div>
        )}
        
        <Loader2 className="animate-spin text-primary mb-4" size={48} />
        <h1 className="text-2xl font-bold text-foreground mb-2">All Done!</h1>
        <p className="text-muted-foreground text-center">
          {isTimedSession 
            ? "Waiting for the timer to end..."
            : "Waiting for others to finish swiping..."}
        </p>
        <p className="text-sm text-muted-foreground mt-4">
          {currentIndex} of {items.length} items reviewed
        </p>
      </div>
    );
  }

  const currentItem = items[currentIndex];
  const progress = ((currentIndex + 1) / items.length) * 100;

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      <div className="fixed inset-0 bg-background">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
      </div>

      <div className="flex-1 flex flex-col px-4 py-6 relative z-10">
        <div className="flex items-center justify-between mb-2">
          <Logo size="sm" />
          <div className="text-right">
            <span className="text-sm text-muted-foreground">
              {currentIndex + 1} / {items.length}
            </span>
          </div>
        </div>

        {/* Timer bar for timed sessions */}
        {isTimedSession && timerEndAt && (
          <div className="mb-2">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1">
                <Clock size={12} className="text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Time remaining</span>
              </div>
              <span className={`text-xs font-mono ${timeRemaining < 60 ? 'text-destructive font-bold' : 'text-foreground'}`}>
                {formatTimeRemaining(timeRemaining)}
              </span>
            </div>
            <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
              <motion.div
                className={`h-full transition-colors duration-500 ${
                  timerProgress < 20 ? 'bg-destructive' : timerProgress < 50 ? 'bg-accent' : 'bg-primary'
                }`}
                initial={false}
                animate={{ width: `${timerProgress}%` }}
                transition={{ duration: 0.5, ease: "linear" }}
              />
            </div>
          </div>
        )}

        {/* Progress bar */}
        <div className="w-full h-1 bg-secondary rounded-full mb-6 overflow-hidden">
          <motion.div
            className="h-full bg-primary"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>

        <div className="flex-1 flex items-center justify-center">
          {currentItem && (
            <SwipeCard
              key={currentItem.ratingKey}
              item={currentItem}
              onSwipe={handleSwipe}
              onUndo={swipeHistory.length > 0 ? handleUndo : undefined}
              sessionMediaType={sessionMediaType}
              ratingDisplay={ratingDisplay}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default Swipe;