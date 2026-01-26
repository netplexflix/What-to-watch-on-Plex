// File: src/pages/TimedResults.tsx
import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Loader2, Check, Users, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { RouletteWinner } from "@/components/RouletteWinner";
import { MatchCelebration } from "@/components/MatchCelebration";
import { sessionsApi } from "@/lib/api";
import { wsClient } from "@/lib/websocket";
import { getLocalSession, clearLocalSession } from "@/lib/sessionStore";
import { toast } from "sonner";
import { useHaptics } from "@/hooks/useHaptics";
import { cn } from "@/lib/utils";
import type { PlexItem } from "@/types/session";

// Helper to transform raw item to PlexItem
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
  
  const mediaMapRef = useRef<Map<string, any>>(new Map());
  const hasHandledResultRef = useRef(false);
  const matchesRef = useRef<PlexItem[]>([]);
  const topLikedRef = useRef<{ item: PlexItem; likeCount: number }[]>([]);
  const initStartedRef = useRef(false);
  const isVotingRef = useRef(false); // Track if we're in the middle of casting a vote

  // Keep refs in sync
  useEffect(() => {
    matchesRef.current = matches;
  }, [matches]);

  useEffect(() => {
    topLikedRef.current = topLiked;
  }, [topLiked]);

  // Find item by key from all available sources
  const findItemByKey = useCallback((key: string): PlexItem | null => {
    const fromMatches = matchesRef.current.find(m => m.ratingKey === key);
    if (fromMatches) return fromMatches;
    
    const fromTopLiked = topLikedRef.current.find(t => t.item.ratingKey === key);
    if (fromTopLiked) return fromTopLiked.item;
    
    const fromMedia = mediaMapRef.current.get(key);
    if (fromMedia) return transformToPlexItem(fromMedia);
    
    return null;
  }, []);

  // Handle voting complete result
  const handleVotingResult = useCallback((data: { winner: string; wasTie: boolean; tiedItems?: string[] }) => {
    if (hasHandledResultRef.current) {
      console.log('[TimedResults] Already handled result, skipping');
      return;
    }
    
    console.log('[TimedResults] Handling voting result:', data);
    hasHandledResultRef.current = true; // Set this FIRST to prevent race conditions
    
    if (data.wasTie && data.tiedItems && data.tiedItems.length > 1) {
      const tiedPlexItems = data.tiedItems
        .map(key => findItemByKey(key))
        .filter((item): item is PlexItem => item !== null);
      
      if (tiedPlexItems.length > 1) {
        console.log('[TimedResults] Starting roulette with', tiedPlexItems.length, 'items:', tiedPlexItems.map(i => i.title));
        setRouletteItems(tiedPlexItems);
        setRouletteWinner(data.winner);
        setPageState('roulette');
        return;
      } else {
        console.log('[TimedResults] Not enough items for roulette, showing direct winner');
      }
    }
    
    const winner = findItemByKey(data.winner);
    if (winner) {
      console.log('[TimedResults] Direct winner:', winner.title);
      setFinalWinner(winner);
      setPageState('winner');
    } else {
      console.error('[TimedResults] Could not find winner item:', data.winner);
      hasHandledResultRef.current = false; // Reset so we can try again
    }
  }, [findItemByKey]);

  // Initialize page
  useEffect(() => {
    if (initStartedRef.current) {
      console.log('[TimedResults] Init already started, skipping');
      return;
    }
    
    if (!code) {
      console.log('[TimedResults] No code provided');
      navigate("/");
      return;
    }

    const currentLocalSession = getLocalSession();
    setLocalSession(currentLocalSession);
    
    if (!currentLocalSession) {
      console.log('[TimedResults] No local session found');
      toast.error("Session expired. Please rejoin.");
      navigate("/");
      return;
    }

    initStartedRef.current = true;
    console.log('[TimedResults] Starting initialization...', { code, participantId: currentLocalSession.participantId });
    
    let mounted = true;
    
    const init = async () => {
      try {
        console.log('[TimedResults] Step 1: Fetching session...');
        const sessionResult = await sessionsApi.getByCode(code);
        console.log('[TimedResults] Session result:', sessionResult);
        
        if (sessionResult.error) {
          throw new Error(`Session error: ${sessionResult.error}`);
        }
        
        if (!sessionResult.data?.session) {
          throw new Error('Session not found');
        }

        if (!mounted) return;

        const session = sessionResult.data.session;
        console.log('[TimedResults] Session loaded:', { 
          id: session.id, 
          status: session.status, 
          winner: session.winner_item_key,
          mediaType: session.media_type 
        });
        
        setSessionId(session.id);
        setIsHost(currentLocalSession.isHost || session.host_user_id === currentLocalSession.participantId);

        console.log('[TimedResults] Step 2: Fetching cached media...');
        const mediaResult = await sessionsApi.getCachedMedia(session.media_type || 'both');
        console.log('[TimedResults] Media result:', { 
          error: mediaResult.error, 
          itemCount: mediaResult.data?.items?.length 
        });
        
        if (mediaResult.data?.items) {
          mediaResult.data.items.forEach((item: any) => {
            mediaMapRef.current.set(item.ratingKey, item);
          });
          console.log('[TimedResults] Media map populated with', mediaMapRef.current.size, 'items');
        }

        if (!mounted) return;

        if (session.winner_item_key && session.status === 'completed') {
          console.log('[TimedResults] Session already completed with winner:', session.winner_item_key);
          const winner = mediaMapRef.current.get(session.winner_item_key);
          if (winner) {
            hasHandledResultRef.current = true;
            setFinalWinner(transformToPlexItem(winner));
            setPageState('winner');
            return;
          }
        }

        console.log('[TimedResults] Step 4: Connecting WebSocket...');
        try {
          await wsClient.connect();
          await wsClient.subscribe(session.id, currentLocalSession.participantId);
          console.log('[TimedResults] WebSocket connected and subscribed');
        } catch (wsError) {
          console.warn('[TimedResults] WebSocket connection failed, continuing without realtime updates:', wsError);
        }

        console.log('[TimedResults] Step 5: Fetching matches...');
        const matchesResult = await sessionsApi.getMatches(session.id);
        console.log('[TimedResults] Matches result:', matchesResult);

        if (!mounted) return;

        let loadedMatches: PlexItem[] = [];
        let loadedTopLiked: { item: PlexItem; likeCount: number }[] = [];

        if (matchesResult.data?.matches && matchesResult.data.matches.length > 0) {
          console.log('[TimedResults] Processing', matchesResult.data.matches.length, 'matches');
          loadedMatches = matchesResult.data.matches
            .map(key => {
              const item = mediaMapRef.current.get(key);
              if (!item) {
                console.warn('[TimedResults] Match item not found in media map:', key);
              }
              return item;
            })
            .filter(Boolean)
            .map(transformToPlexItem);
          setMatches(loadedMatches);
          matchesRef.current = loadedMatches;
          console.log('[TimedResults] Loaded', loadedMatches.length, 'match items');
        }

        if (matchesResult.data?.topLiked && matchesResult.data.topLiked.length > 0) {
          console.log('[TimedResults] Processing', matchesResult.data.topLiked.length, 'top liked items');
          loadedTopLiked = matchesResult.data.topLiked
            .map(({ itemKey, likeCount }) => {
              const item = mediaMapRef.current.get(itemKey);
              if (!item) {
                console.warn('[TimedResults] Top liked item not found in media map:', itemKey);
                return null;
              }
              return { item: transformToPlexItem(item), likeCount };
            })
            .filter((x): x is { item: PlexItem; likeCount: number } => x !== null);
          setTopLiked(loadedTopLiked);
          topLikedRef.current = loadedTopLiked;
          console.log('[TimedResults] Loaded', loadedTopLiked.length, 'top liked items');
        }

        console.log('[TimedResults] Step 6: Checking voting status...');
        const votesResult = await sessionsApi.getFinalVotes(session.id);
        console.log('[TimedResults] Votes result:', votesResult);

        if (!mounted) return;

        let userHasVoted = false;
        
        if (votesResult.data) {
          setVotingStatus({ 
            voted: votesResult.data.votedCount || 0, 
            total: votesResult.data.totalCount || 0 
          });
          
          const myVote = votesResult.data.finalVotes?.find(
            (v: any) => v.participant_id === currentLocalSession.participantId
          );
          
          if (myVote) {
            console.log('[TimedResults] User already voted for:', myVote.item_key);
            userHasVoted = true;
            setHasVoted(true);
            setSelectedItem(myVote.item_key);
          }
          
          if (votesResult.data.allVoted && !hasHandledResultRef.current) {
            console.log('[TimedResults] All users have voted, fetching final result...');
            const updatedSessionResult = await sessionsApi.getById(session.id);
            if (updatedSessionResult.data?.session?.winner_item_key && mounted) {
              const winner = mediaMapRef.current.get(updatedSessionResult.data.session.winner_item_key);
              if (winner) {
                hasHandledResultRef.current = true;
                setFinalWinner(transformToPlexItem(winner));
                setPageState('winner');
                return;
              }
            }
          }
        }

        if (mounted && !hasHandledResultRef.current) {
          const finalState = userHasVoted ? 'waiting' : 'voting';
          console.log('[TimedResults] Initialization complete. Setting page state to:', finalState);
          console.log('[TimedResults] Items to show:', {
            matches: loadedMatches.length,
            topLiked: loadedTopLiked.length
          });
          setPageState(finalState);
        }
        
      } catch (error) {
        console.error("[TimedResults] Initialization error:", error);
        if (mounted) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          setErrorMessage(message);
          setPageState('error');
        }
      }
    };

    init();

    return () => {
      mounted = false;
    };
  }, [code, navigate]);

  // WebSocket listeners
  useEffect(() => {
    if (!sessionId || !localSession) return;

    console.log('[TimedResults] Setting up WebSocket listeners for session:', sessionId);

    const unsubFinalVote = wsClient.on('final_vote_cast', async (data) => {
      console.log('[TimedResults] final_vote_cast event:', data);
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
      console.log('[TimedResults] voting_complete event:', data);
      handleVotingResult(data);
    });

    const unsubSessionUpdated = wsClient.on('session_updated', (data) => {
      console.log('[TimedResults] session_updated event:', data);
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
      console.log('[TimedResults] Cleaning up WebSocket listeners');
      unsubFinalVote();
      unsubVotingComplete();
      unsubSessionUpdated();
    };
  }, [sessionId, localSession, handleVotingResult, findItemByKey]);

  const handleSelectItem = (itemKey: string) => {
    if (hasVoted) return;
    haptics.selection();
    setSelectedItem(itemKey);
  };

  const handleCastVote = async () => {
    if (!selectedItem || !sessionId || !localSession) return;
    if (isVotingRef.current) return; // Prevent double-voting
    
    isVotingRef.current = true;
    haptics.medium();
    setHasVoted(true);
    setPageState('waiting');
    
    try {
      console.log('[TimedResults] Casting vote for:', selectedItem);
      const { data, error } = await sessionsApi.castFinalVote(
        sessionId,
        localSession.participantId,
        selectedItem
      );

      if (error) throw new Error(error);

      console.log('[TimedResults] Vote cast response:', data);
      haptics.success();
      toast.success("Vote cast!");

      // Only handle result if not already handled by WebSocket
      if (data?.allVoted && data.winner && !hasHandledResultRef.current) {
        console.log('[TimedResults] Handling result from vote response');
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
      // Revert state on error
      setHasVoted(false);
      setPageState('voting');
    } finally {
      isVotingRef.current = false;
    }
  };

  const handleRouletteComplete = useCallback(() => {
    console.log('[TimedResults] Roulette complete, winner:', rouletteWinner);
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

  const handlePlayAgain = async () => {
    if (!sessionId) return;
    
    haptics.medium();
    
    try {
      await sessionsApi.update(sessionId, { 
        status: "questions",
        winner_item_key: null,
      });
      
      const { data: participantsData } = await sessionsApi.getParticipants(sessionId);
      if (participantsData?.participants) {
        for (const p of participantsData.participants) {
          await sessionsApi.updateParticipant(p.id, { questions_completed: false });
        }
      }
      
      navigate(`/questions/${code}`);
    } catch (error) {
      console.error("[TimedResults] Error restarting session:", error);
      haptics.error();
      toast.error("Failed to restart session");
    }
  };

  const handleRetry = () => {
    initStartedRef.current = false;
    hasHandledResultRef.current = false;
    setPageState('loading');
    setErrorMessage('');
    window.location.reload();
  };

  // Loading state
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

  // Error state
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

  // Roulette state
  if (pageState === 'roulette' && rouletteItems.length > 0 && rouletteWinner) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <div className="flex justify-center pt-6 pb-2">
          <Logo size="sm" />
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-4">
          <p className="text-muted-foreground mb-2 text-sm">It's a tie! Let fate decide...</p>
          <RouletteWinner
            key={`roulette-${rouletteWinner}`}
            items={rouletteItems}
            winnerId={rouletteWinner}
            onComplete={handleRouletteComplete}
          />
        </div>
      </div>
    );
  }

  // Winner state
  if (pageState === 'winner' && finalWinner) {
    return (
      <div className="min-h-screen flex flex-col relative overflow-hidden">
        <div className="fixed inset-0 bg-background">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
        </div>
        <div className="flex-1 relative z-10">
          <MatchCelebration 
            item={finalWinner} 
            onPlayAgain={isHost ? handlePlayAgain : undefined}
          />
          <div className="px-6 pb-8">
            <Button
              onClick={handleNewSession}
              variant="outline"
              className="w-full max-w-md mx-auto h-12 flex"
            >
              <Home size={18} className="mr-2" />
              New Session
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Voting / Waiting state
  const itemsToShow = matches.length > 0 ? matches : topLiked.map(t => t.item);
  const isMatchMode = matches.length > 0;

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
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      <div className="fixed inset-0 bg-background">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
      </div>

      <div className="flex-1 flex flex-col px-6 py-6 relative z-10">
        <div className="flex justify-center mb-4">
          <Logo size="sm" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-4"
        >
          <h1 className="text-xl font-bold text-foreground mb-1">
            {isMatchMode ? "Time's Up! 🎉" : "Session Complete"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isMatchMode 
              ? `${matches.length} match${matches.length !== 1 ? 'es' : ''} found! Vote for your favorite.`
              : "No perfect matches, but here are the most liked items."}
          </p>
        </motion.div>

        <div className="glass-card rounded-xl p-3 mb-4 flex items-center justify-center gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users size={16} />
            <span>{votingStatus.voted} / {votingStatus.total} voted</span>
          </div>
          {hasVoted && (
            <div className="flex items-center gap-1 text-sm text-primary">
              <Check size={16} />
              <span>You voted</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4 max-w-sm mx-auto w-full flex-1 content-start">
          {itemsToShow.slice(0, 6).map((item, index) => (
            <motion.button
              key={item.ratingKey}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => handleSelectItem(item.ratingKey)}
              disabled={hasVoted}
              className={cn(
                "relative rounded-xl overflow-hidden aspect-[2/3] transition-all duration-200",
                selectedItem === item.ratingKey 
                  ? "ring-4 ring-primary ring-offset-2 ring-offset-background scale-[1.02]" 
                  : "hover:scale-[1.01]",
                hasVoted && selectedItem !== item.ratingKey && "opacity-40"
              )}
            >
              <img
                src={item.thumb}
                alt={item.title}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "/placeholder.svg";
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-2">
                <p className="font-medium text-foreground text-xs truncate">{item.title}</p>
                <p className="text-[10px] text-muted-foreground">{item.year}</p>
              </div>
              {selectedItem === item.ratingKey && (
                <motion.div 
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute top-2 right-2 w-7 h-7 bg-primary rounded-full flex items-center justify-center"
                >
                  <Check size={16} className="text-primary-foreground" />
                </motion.div>
              )}
            </motion.button>
          ))}
        </div>

        <div className="mt-auto">
          {pageState === 'voting' && !hasVoted ? (
            <Button
              onClick={handleCastVote}
              disabled={!selectedItem}
              className="w-full max-w-sm mx-auto h-12 text-base font-semibold bg-primary hover:bg-primary/90 text-primary-foreground flex"
            >
              Cast Vote
            </Button>
          ) : (
            <div className="text-center py-4">
              <Loader2 className="animate-spin text-primary mx-auto mb-2" size={24} />
              <p className="text-sm text-muted-foreground">
                Waiting for others to vote...
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TimedResults;