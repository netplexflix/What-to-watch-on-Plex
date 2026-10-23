// File: src/pages/TimedResults.tsx
import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Check, Users, Home, CircleSlash, SkipForward, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Logo } from "@/components/Logo";
import { RouletteWinner } from "@/components/RouletteWinner";
import { MatchCelebration } from "@/components/MatchCelebration";
import { PlaybackControl } from "@/components/PlaybackControl";
import { FlippableCard } from "@/components/FlippableCard";
import { prefetchTrailers } from "@/lib/trailerCache";
import { sessionsApi, adminApi } from "@/lib/api";
import { wsClient } from "@/lib/websocket";
import { getLocalSession, clearLocalSession } from "@/lib/sessionStore";
import { toast } from "sonner";
import { useHaptics } from "@/hooks/useHaptics";
import { cn } from "@/lib/utils";
import { ABSTAIN_ITEM_KEY, type PlexItem } from "@/types/session";

const transformToPlexItem = (item: any): PlexItem => ({
  ratingKey: item.ratingKey,
  title: item.title,
  year: item.year || 0,
  summary: item.summary || "",
  thumb: item.thumb || "/placeholder.svg",
  art: item.art,
  duration: item.duration || 0,
  rating: item.rating,
  contentRating: item.contentRating,
  genres: item.genres || [],
  directors: item.directors || [],
  actors: item.actors || [],
  type: item.type === "show" ? "show" : "movie",
  studio: item.studio,
  audienceRating: item.audienceRating,
  languages: item.languages || [],
});

type PageState = 'loading' | 'voting' | 'waiting' | 'roulette' | 'winner' | 'error';

// Without any full matches the vote falls back to the most-liked items, and only this many are shown.
// Full matches are never capped - a match target above six promises that many candidates.
// Keep in sync with TOP_LIKED_LIMIT in server/src/routes/sessions.ts.
const TOP_LIKED_LIMIT = 6;

const getVotingItems = (
  matches: PlexItem[],
  topLiked: { item: PlexItem; likeCount: number }[]
): PlexItem[] =>
  matches.length > 0 ? matches : topLiked.slice(0, TOP_LIKED_LIMIT).map((t) => t.item);

// session.tied_items is a JSON array of item keys, or null when the final vote had no tie.
const parseTiedItems = (value: unknown): string[] => {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

// How often the voting screen re-reads the session while it waits on other people
const RESYNC_INTERVAL_MS = 3000;

const TimedResults = () => {
  const navigate = useNavigate();
  const { code } = useParams<{ code: string }>();
  const haptics = useHaptics();
  
  const [pageState, setPageState] = useState<PageState>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [matches, setMatches] = useState<PlexItem[]>([]);
  const [topLiked, setTopLiked] = useState<{ item: PlexItem; likeCount: number }[]>([]);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [votingStatus, setVotingStatus] = useState({ voted: 0, total: 0 });
  const [rouletteItems, setRouletteItems] = useState<PlexItem[]>([]);
  const [rouletteWinner, setRouletteWinner] = useState<string | null>(null);
  const [finalWinner, setFinalWinner] = useState<PlexItem | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [localSession, setLocalSession] = useState(() => getLocalSession());
  const [enablePlexButton, setEnablePlexButton] = useState(false);
  const [ratingDisplay, setRatingDisplay] = useState<'critic' | 'audience' | 'both'>('critic');
  // Trailers appear on the voting cards in both 'on' and 'voting' modes.
  const [enableTrailers, setEnableTrailers] = useState(false);
  const [isMatchTargetSession, setIsMatchTargetSession] = useState(false);
  const [isTimedSession, setIsTimedSession] = useState(false);
  const [matchTarget, setMatchTarget] = useState(0);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);

  // Warm trailer availability for the voting cards so the button appears without delay.
  useEffect(() => {
    if (!enableTrailers) return;
    prefetchTrailers(getVotingItems(matches, topLiked).map((i) => i.ratingKey));
  }, [enableTrailers, matches, topLiked]);

  const mediaMapRef = useRef<Map<string, any>>(new Map());
  const hasHandledResultRef = useRef(false);
  const matchesRef = useRef<PlexItem[]>([]);
  const topLikedRef = useRef<{ item: PlexItem; likeCount: number }[]>([]);
  const initStartedRef = useRef(false);
  const isVotingRef = useRef(false);

  useEffect(() => {
    matchesRef.current = matches;
  }, [matches]);

  useEffect(() => {
    topLikedRef.current = topLiked;
  }, [topLiked]);

  const findItemByKey = useCallback((key: string): PlexItem | null => {
    const fromMatches = matchesRef.current.find(m => m.ratingKey === key);
    if (fromMatches) return fromMatches;
    
    const fromTopLiked = topLikedRef.current.find(t => t.item.ratingKey === key);
    if (fromTopLiked) return fromTopLiked.item;
    
    const fromMedia = mediaMapRef.current.get(key);
    if (fromMedia) return transformToPlexItem(fromMedia);
    
    return null;
  }, []);

  const handleVotingResult = useCallback((data: { winner: string; wasTie: boolean; tiedItems?: string[] }) => {
    if (hasHandledResultRef.current) {
      return;
    }
    
    hasHandledResultRef.current = true;
    
    if (data.wasTie && data.tiedItems && data.tiedItems.length > 1) {
      const tiedPlexItems = data.tiedItems
        .map(key => findItemByKey(key))
        .filter((item): item is PlexItem => item !== null);
      
      // Only spin if the winner itself resolved - otherwise the reel would land on a
      // poster that didn't win and the caption underneath would render empty.
      if (tiedPlexItems.length > 1 && tiedPlexItems.some(item => item.ratingKey === data.winner)) {
        setRouletteItems(tiedPlexItems);
        setRouletteWinner(data.winner);
        setPageState('roulette');
        return;
      }
    }
    
    const winner = findItemByKey(data.winner);
    if (winner) {
      setFinalWinner(winner);
      setPageState('winner');
    } else {
      hasHandledResultRef.current = false;
    }
  }, [findItemByKey]);

  // Shows the result the server already stored, for a client that missed voting_complete (a reload,
  // a phone that slept through it, a dropped socket). A tie nobody has spun yet still goes to the
  // roulette: if the host skipped it, everyone else would wait on "Waiting for host" forever.
  const showStoredResult = useCallback((session: any) => {
    if (session?.status !== 'completed' || !session.winner_item_key) return;
    const tiedItems = parseTiedItems(session.tied_items);
    handleVotingResult({
      winner: session.winner_item_key,
      wasTie: tiedItems.length > 1 && !session.roulette_started_at,
      tiedItems,
    });
  }, [handleVotingResult]);

  useEffect(() => {
    if (initStartedRef.current) return;
    
    if (!code) {
      navigate("/");
      return;
    }

    const currentLocalSession = getLocalSession();
    setLocalSession(currentLocalSession);
    
    if (!currentLocalSession) {
      toast.error("Session expired. Please rejoin.");
      navigate("/");
      return;
    }

    initStartedRef.current = true;
    
    const init = async () => {
      try {
        // Load settings
        try {
          const { data: settingsData } = await adminApi.getSessionSettings();
          if (settingsData?.settings) {
            if (settingsData.settings.enable_plex_button) {
              setEnablePlexButton(true);
            }
            if (settingsData.settings.rating_display) {
              setRatingDisplay(settingsData.settings.rating_display);
            }
            const trailersMode = settingsData.settings.trailers_mode ?? (settingsData.settings.enable_trailers ? 'on' : 'off');
            setEnableTrailers(trailersMode === 'on' || trailersMode === 'voting');
          }
        } catch (e) {
          console.error('[TimedResults] Error loading settings:', e);
        }

        const sessionResult = await sessionsApi.getByCode(code);
        
        if (sessionResult.error) {
          throw new Error(`Session error: ${sessionResult.error}`);
        }
        
        if (!sessionResult.data?.session) {
          throw new Error('Session not found');
        }

        const session = sessionResult.data.session;
        setSessionId(session.id);
        const userIsHost = currentLocalSession.isHost || session.host_user_id === currentLocalSession.participantId;
        setIsHost(userIsHost);

        // Detect if this is a match target session
        if (session.match_target && session.match_target > 0) {
          setIsMatchTargetSession(true);
          setMatchTarget(session.match_target);
        }

        // Detect if this is a timed session (both can be true for timed+target)
        if (session.timed_duration && session.timed_duration > 0) {
          setIsTimedSession(true);
        }

        let mediaItems: any[] = [];
        try {
          const mediaResult = await sessionsApi.getCachedMedia(session.media_type || 'both');
          if (mediaResult.data?.items) {
            mediaItems = mediaResult.data.items;
            mediaItems.forEach((item: any) => {
              mediaMapRef.current.set(item.ratingKey, item);
            });
          }
        } catch (mediaError) {
          console.error('[TimedResults] Error fetching media:', mediaError);
        }

        // Subscribed before the completed check below: a stored tie can land on the roulette,
        // which still needs the host's roulette_started broadcast.
        try {
          await wsClient.connect();
          await wsClient.subscribe(session.id, currentLocalSession.participantId);
        } catch (wsError) {
          console.warn('[TimedResults] WebSocket connection failed:', wsError);
        }

        showStoredResult(session);
        if (hasHandledResultRef.current) return;

        const loadedMatches: PlexItem[] = [];
        const loadedTopLiked: { item: PlexItem; likeCount: number }[] = [];
        
        try {
          const matchesResult = await sessionsApi.getMatches(session.id);

          if (matchesResult.data?.matches && matchesResult.data.matches.length > 0) {
            for (const key of matchesResult.data.matches) {
              const item = mediaMapRef.current.get(key);
              if (item) {
                loadedMatches.push(transformToPlexItem(item));
              }
            }
            setMatches(loadedMatches);
            matchesRef.current = loadedMatches;
          }

          if (matchesResult.data?.topLiked && matchesResult.data.topLiked.length > 0) {
            for (const { itemKey, likeCount } of matchesResult.data.topLiked) {
              const item = mediaMapRef.current.get(itemKey);
              if (item) {
                loadedTopLiked.push({ item: transformToPlexItem(item), likeCount });
              }
            }
            setTopLiked(loadedTopLiked);
            topLikedRef.current = loadedTopLiked;
          }
        } catch (matchesError) {
          console.error('[TimedResults] Error fetching matches:', matchesError);
        }

        if (loadedMatches.length === 1 && !hasHandledResultRef.current) {
          hasHandledResultRef.current = true;
          
          sessionsApi.update(session.id, { 
            winner_item_key: loadedMatches[0].ratingKey,
            status: 'completed'
          }).catch(err => {
            console.error('[TimedResults] Error updating session:', err);
          });
          
          setFinalWinner(loadedMatches[0]);
          setPageState('winner');
          haptics.success();
          return;
        }

        let userHasVoted = false;
        
        try {
          const votesResult = await sessionsApi.getFinalVotes(session.id);

          if (votesResult.data) {
            setVotingStatus({ 
              voted: votesResult.data.votedCount || 0, 
              total: votesResult.data.totalCount || 0 
            });
            
            if (votesResult.data.finalVotes) {
              const myVote = votesResult.data.finalVotes.find(
                (v: any) => v.participant_id === currentLocalSession.participantId
              );
              
              if (myVote) {
                userHasVoted = true;
                setHasVoted(true);
                setSelectedItem(myVote.item_key);
              }
            }
            
            if (votesResult.data.allVoted && !hasHandledResultRef.current) {
              try {
                const updatedSessionResult = await sessionsApi.getById(session.id);
                showStoredResult(updatedSessionResult.data?.session);
                if (hasHandledResultRef.current) return;
              } catch (updateError) {
                console.error('[TimedResults] Error fetching updated session:', updateError);
              }
            }
          }
        } catch (votesError) {
          console.error('[TimedResults] Error fetching votes:', votesError);
        }

        if (!hasHandledResultRef.current) {
          const finalState = userHasVoted ? 'waiting' : 'voting';
          setPageState(finalState);
        }
        
      } catch (error) {
        console.error("[TimedResults] Initialization error:", error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        setErrorMessage(message);
        setPageState('error');
      }
    };

    init();
  }, [code, navigate, haptics, showStoredResult]);

  useEffect(() => {
    if (!sessionId || !localSession) return;

    const unsubFinalVote = wsClient.on('final_vote_cast', async () => {
      try {
        const { data: votesData } = await sessionsApi.getFinalVotes(sessionId);
        if (votesData) {
          setVotingStatus({ voted: votesData.votedCount || 0, total: votesData.totalCount || 0 });
        }
      } catch (e) {
        console.error('[TimedResults] Error fetching final votes:', e);
      }
    });

    const unsubVotingComplete = wsClient.on('voting_complete', (data) => {
      handleVotingResult(data);
    });

    const unsubSessionUpdated = wsClient.on('session_updated', (data) => {
      if (data.winner_item_key && data.status === 'completed' && !hasHandledResultRef.current) {
        const winner = findItemByKey(data.winner_item_key);
        if (winner) {
          hasHandledResultRef.current = true;
          setFinalWinner(winner);
          setPageState('winner');
        }
      }
    });

    return () => {
      unsubFinalVote();
      unsubVotingComplete();
      unsubSessionUpdated();
    };
  }, [sessionId, localSession, handleVotingResult, findItemByKey]);

  // Backup for the WebSocket events above: while this screen waits on other people, re-read the
  // vote count and the session, so a missed final_vote_cast / voting_complete can't strand it.
  // Every dependency is stable, so the interval survives re-renders.
  useEffect(() => {
    if (!sessionId || (pageState !== 'voting' && pageState !== 'waiting')) return;

    const resync = async () => {
      if (hasHandledResultRef.current) return;

      const [{ data: votesData }, { data: sessionData }] = await Promise.all([
        sessionsApi.getFinalVotes(sessionId),
        sessionsApi.getById(sessionId),
      ]);
      if (hasHandledResultRef.current) return;

      if (votesData) {
        setVotingStatus({ voted: votesData.votedCount || 0, total: votesData.totalCount || 0 });
      }
      showStoredResult(sessionData?.session);
    };

    const intervalId = setInterval(resync, RESYNC_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [sessionId, pageState, showStoredResult]);

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const scrollContentRef = useRef<HTMLDivElement>(null);
  const [canScrollDown, setCanScrollDown] = useState(false);

  // Scroll hint: shown while posters are still hidden below the pinned vote controls.
  useEffect(() => {
    const area = scrollAreaRef.current;
    const content = scrollContentRef.current;
    if (!area || !content) return;

    const update = () => {
      // Layout height rather than scrollHeight: the posters' entrance transform inflates scrollHeight.
      const hiddenBelow = content.offsetHeight - area.scrollTop - area.clientHeight;
      setCanScrollDown(hiddenBelow > 8);
    };
    update();
    area.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(area);
    observer.observe(content);
    return () => {
      area.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [pageState, matches.length, topLiked.length]);

  const handleSelectItem = (itemKey: string) => {
    if (hasVoted) return;
    setSelectedItem(itemKey);
  };

  const handleCastVote = async () => {
    if (!selectedItem || !sessionId || !localSession) return;
    if (isVotingRef.current) return;
    
    isVotingRef.current = true;
    haptics.medium();
    setHasVoted(true);
    setPageState('waiting');
    
    try {
      const { data, error } = await sessionsApi.castFinalVote(
        sessionId,
        localSession.participantId,
        selectedItem
      );

      if (error) throw new Error(error);

      haptics.success();
      // toast.success("Vote cast!"); // disabled for now. too much noise imo

      if (data?.allVoted && data.winner && !hasHandledResultRef.current) {
        handleVotingResult({
          winner: data.winner,
          wasTie: data.wasTie || false,
          tiedItems: data.tiedItems,
        });
      }
    } catch (error) {
      haptics.error();
      console.error("[TimedResults] Error casting vote:", error);
      toast.error("Failed to cast vote");
      setHasVoted(false);
      setPageState('voting');
    } finally {
      isVotingRef.current = false;
    }
  };

  const finishVoting = useCallback(async () => {
    if (!sessionId || !localSession) return;
    if (isFinishing) return;

    setIsFinishing(true);
    haptics.medium();

    try {
      const { data, error } = await sessionsApi.finishVoting(sessionId, localSession.participantId);

      if (error) throw new Error(error);

      if (data?.winner && !hasHandledResultRef.current) {
        handleVotingResult({
          winner: data.winner,
          wasTie: data.wasTie || false,
          tiedItems: data.tiedItems,
        });
      }
    } catch (error) {
      haptics.error();
      console.error("[TimedResults] Error ending voting:", error);
      toast.error("Failed to end voting");
    } finally {
      setIsFinishing(false);
    }
  }, [sessionId, localSession, isFinishing, haptics, handleVotingResult]);

  const handleContinueClick = () => {
    // Everyone already voted - the result is on its way, no need to warn about anything.
    if (votingStatus.total > 0 && votingStatus.voted >= votingStatus.total) {
      finishVoting();
      return;
    }
    haptics.selection();
    setShowFinishConfirm(true);
  };

  const handleRouletteComplete = useCallback(() => {
    const winner = rouletteItems.find(item => item.ratingKey === rouletteWinner);
    if (winner) {
      setFinalWinner(winner);
      setPageState('winner');
    }
  }, [rouletteItems, rouletteWinner]);

  const handleNewSession = () => {
    clearLocalSession();
    haptics.medium();
    navigate("/");
  };

  const handleRetry = () => {
    initStartedRef.current = false;
    hasHandledResultRef.current = false;
    setPageState('loading');
    setErrorMessage('');
    window.location.reload();
  };

  if (pageState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="animate-spin text-primary mx-auto mb-4" size={48} />
          <p className="text-muted-foreground">Loading results...</p>
        </div>
      </div>
    );
  }

  if (pageState === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6">
        <Logo size="md" className="mb-8" />
        <h1 className="text-xl font-bold text-foreground mb-2">Something went wrong</h1>
        <p className="text-muted-foreground text-center mb-2">
          Failed to load the results page.
        </p>
        {errorMessage && (
          <p className="text-sm text-destructive text-center mb-6 font-mono">
            {errorMessage}
          </p>
        )}
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <Button onClick={handleRetry} className="w-full">
            Try Again
          </Button>
          <Button onClick={handleNewSession} variant="outline" className="w-full">
            <Home size={18} className="mr-2" />
            Start New Session
          </Button>
        </div>
      </div>
    );
  }

  if (pageState === 'roulette' && rouletteItems.length > 0 && rouletteWinner) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <div className="flex justify-center pt-6 pb-2">
          <Logo size="sm" />
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-4">
          <RouletteWinner
            key={`roulette-${rouletteWinner}`}
            items={rouletteItems}
            winnerId={rouletteWinner}
            onComplete={handleRouletteComplete}
            isHost={isHost}
            sessionId={sessionId}
          />
        </div>
      </div>
    );
  }

  if (pageState === 'winner' && finalWinner) {
    return (
      <div className="min-h-dvh flex flex-col relative overflow-hidden">
        <div className="fixed inset-0 bg-background">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
        </div>
        {/* MatchCelebration pads itself and sizes its poster to the remaining height */}
        <div className="flex-1 flex flex-col relative z-10">
          <MatchCelebration item={finalWinner} ratingDisplay={ratingDisplay}>
            <div className="flex flex-col gap-3 w-full">
              {enablePlexButton && (
                <PlaybackControl
                  ratingKey={finalWinner.ratingKey}
                  title={finalWinner.title}
                />
              )}
              <Button
                onClick={handleNewSession}
                variant="outline"
                className="w-full h-12 text-base font-semibold border-secondary text-foreground hover:bg-secondary"
              >
                <Home size={18} className="mr-2" />
                New Session
              </Button>
            </div>
          </MatchCelebration>
        </div>
      </div>
    );
  }

  const itemsToShow = getVotingItems(matches, topLiked);
  const isMatchMode = matches.length > 0;

  // A timed+target session can end either way, so report what actually happened.
  const targetWasReached =
    isMatchTargetSession && matchTarget > 0 && matches.length >= matchTarget;
  const endReasonHeading = isTimedSession && !targetWasReached
    ? "Time's Up! 🎉"
    : isMatchTargetSession
      ? "Target Reached! 🎯"
      : "Time's Up! 🎉";

  if (itemsToShow.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6">
        <Logo size="md" className="mb-8" />
        <h1 className="text-xl font-bold text-foreground mb-2">No Results</h1>
        <p className="text-muted-foreground text-center mb-6">
          No one liked any items during this session. Try again with different preferences!
        </p>
        <Button onClick={handleNewSession} className="w-full max-w-xs">
          <Home size={18} className="mr-2" />
          Start New Session
        </Button>
      </div>
    );
  }

  return (
    <div className="h-dvh flex flex-col relative overflow-hidden">
      <div className="fixed inset-0 bg-background">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
      </div>

      <div className="relative z-10 flex items-center justify-between px-6 pt-4">
        <Logo size="sm" />
        <div
          className={cn(
            "flex items-center gap-1.5 text-sm",
            hasVoted ? "text-primary" : "text-muted-foreground"
          )}
          title={hasVoted ? "You voted" : undefined}
        >
          {hasVoted ? <Check size={16} /> : <Users size={16} />}
          <span>{votingStatus.voted} / {votingStatus.total} voted</span>
        </div>
      </div>

      <div className="relative z-10 flex-1 min-h-0">
        {/* Only this middle part scrolls; the edges fade so further rows read as scrollable */}
        <div
          ref={scrollAreaRef}
          className="h-full overflow-y-auto overscroll-contain px-6 [mask-image:linear-gradient(to_bottom,transparent,black_8px,black_calc(100%_-_24px),transparent)]"
        >
          <div ref={scrollContentRef}>
            {/* -mx-2 widens the line so subtitle + hint fit side by side on most phones */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center pt-2 mb-4 -mx-2"
            >
              <h1 className="text-xl font-bold text-foreground mb-1">
                {isMatchMode ? endReasonHeading : "Session Complete"}
              </h1>
              <p className="text-xs text-muted-foreground">
                {isMatchMode
                  ? `${matches.length} match${matches.length !== 1 ? 'es' : ''} found! Vote for your favorite.`
                  : "No perfect matches, but here are the most liked items."}{" "}
                {/* Wraps as a whole onto its own line when the row is too narrow */}
                <span className="whitespace-nowrap text-muted-foreground/70">Double tap for info</span>
              </p>
            </motion.div>

            <div className="grid grid-cols-2 gap-3 pb-6 max-w-sm mx-auto w-full">
              {itemsToShow.map((item, index) => (
                <FlippableCard
                  key={item.ratingKey}
                  item={item}
                  isSelected={selectedItem === item.ratingKey}
                  isDisabled={hasVoted}
                  onSelect={handleSelectItem}
                  animationDelay={index * 0.05}
                  ratingDisplay={ratingDisplay}
                  enableTrailers={enableTrailers}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Outside the masked scroller, which would fade it out; never intercepts poster taps */}
        <AnimatePresence>
          {canScrollDown && (
            <motion.div
              key="scroll-hint"
              data-scroll-hint
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center"
              aria-hidden="true"
            >
              <motion.div
                animate={{ y: [0, 4, 0] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                className="rounded-full p-1 bg-primary text-primary-foreground shadow-lg"
              >
                <ChevronDown size={18} />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Pinned vote controls - always on screen however many rows of posters there are */}
      <div className="relative z-10 px-6 pt-3 pb-4">
        <div className="max-w-sm mx-auto w-full space-y-3">
          {/* Blank vote - selected like a poster, confirmed with the same Cast Vote button */}
          <button
            type="button"
            onClick={() => {
              if (hasVoted) return;
              haptics.selection();
              handleSelectItem(ABSTAIN_ITEM_KEY);
            }}
            disabled={hasVoted}
            className={cn(
              "w-full flex items-center justify-center gap-2 rounded-xl px-4 py-2.5",
              "glass-card text-sm font-medium text-muted-foreground transition-all duration-200",
              selectedItem === ABSTAIN_ITEM_KEY
                ? "ring-4 ring-primary ring-offset-2 ring-offset-background text-foreground"
                : "hover:text-foreground",
              hasVoted && selectedItem !== ABSTAIN_ITEM_KEY && "opacity-40"
            )}
          >
            {selectedItem === ABSTAIN_ITEM_KEY ? <Check size={16} /> : <CircleSlash size={16} />}
            No preference
          </button>

          {pageState === 'voting' && !hasVoted ? (
            <Button
              onClick={handleCastVote}
              disabled={!selectedItem}
              className="w-full h-12 text-base font-semibold bg-primary hover:bg-primary/90 text-primary-foreground flex"
            >
              Cast Vote
            </Button>
          ) : (
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 py-1 text-sm text-muted-foreground">
                <Loader2 className="animate-spin text-primary" size={16} />
                Waiting for others to vote...
              </div>
              {isHost && (
                <Button
                  onClick={handleContinueClick}
                  disabled={isFinishing}
                  variant="outline"
                  className="w-full mt-2 h-11 font-semibold border-secondary text-foreground hover:bg-secondary flex"
                >
                  {isFinishing ? (
                    <>
                      <Loader2 className="mr-2 animate-spin" size={18} />
                      Ending vote...
                    </>
                  ) : (
                    <>
                      <SkipForward size={18} className="mr-2" />
                      Continue
                    </>
                  )}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={showFinishConfirm} onOpenChange={setShowFinishConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Not everyone has voted yet</AlertDialogTitle>
            <AlertDialogDescription>
              {votingStatus.voted} of {votingStatus.total} have voted. Are you sure you want to continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No</AlertDialogCancel>
            <AlertDialogAction onClick={() => finishVoting()}>Yes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TimedResults;