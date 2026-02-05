// File: src/components/MatchCelebration.tsx
import { useEffect, useState, useRef, ReactNode } from "react";
import { motion } from "framer-motion";
import { PartyPopper, Play, Clock, Star, Calendar, Users, Popcorn, Globe, ListPlus, ListCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useHaptics } from "@/hooks/useHaptics";
import { plexApi, sessionsApi } from "@/lib/api";
import { getLocalSession } from "@/lib/sessionStore";
import { toast } from "sonner";
import type { PlexItem } from "@/types/session";

interface MatchCelebrationProps {
  item: PlexItem;
  onWatchNow?: () => void;
  className?: string;
  children?: ReactNode;
  ratingDisplay?: 'critic' | 'audience' | 'both';
}

const formatDuration = (ms: number): string => {
  if (!ms) return "";
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
};

const CONFETTI_COLORS = ["#2DD4BF", "#FBBF24", "#F87171", "#A78BFA", "#60A5FA"];

export const MatchCelebration = ({ 
  item, 
  onWatchNow,
  className,
  children,
  ratingDisplay = 'critic',
}: MatchCelebrationProps) => {
  const [confetti, setConfetti] = useState<{ id: number; color: string; left: number; delay: number }[]>([]);
  const [isFlipped, setIsFlipped] = useState(false);
  const [inWatchlist, setInWatchlist] = useState(false);
  const [isAddingToWatchlist, setIsAddingToWatchlist] = useState(false);
  const [isCheckingWatchlist, setIsCheckingWatchlist] = useState(false);
  const [plexToken, setPlexToken] = useState<string | null>(null);
  const [hasCheckedToken, setHasCheckedToken] = useState(false);
  const haptics = useHaptics();
  const hasTriggeredHaptic = useRef(false);
  const localSession = getLocalSession();

  // Get the participant's plex token
  useEffect(() => {
    const checkPlexToken = async () => {
      if (!localSession?.sessionId || !localSession?.participantId) {
        setHasCheckedToken(true);
        return;
      }
      
      try {
        const { data, error } = await sessionsApi.getParticipants(localSession.sessionId);
        if (error) {
          console.error('[MatchCelebration] Error getting participants:', error);
          setHasCheckedToken(true);
          return;
        }
        
        if (data?.participants) {
          const currentParticipant = data.participants.find(
            (p: any) => p.id === localSession.participantId
          );
          if (currentParticipant?.plex_token) {
            console.log('[MatchCelebration] Found plex token for participant');
            setPlexToken(currentParticipant.plex_token);
          } else {
            console.log('[MatchCelebration] No plex token for participant (guest user)');
          }
        }
      } catch (err) {
        console.error('[MatchCelebration] Error getting participant info:', err);
      } finally {
        setHasCheckedToken(true);
      }
    };
    
    checkPlexToken();
  }, [localSession?.sessionId, localSession?.participantId]);

  useEffect(() => {
    if (!hasTriggeredHaptic.current) {
      hasTriggeredHaptic.current = true;
      haptics.success();
    }
    
    const pieces = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      left: Math.random() * 100,
      delay: Math.random() * 0.5,
    }));
    setConfetti(pieces);

    return () => {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate(0);
      }
    };
  }, [haptics]);

  // Check if item is in watchlist when we have a plex token
  useEffect(() => {
    if (plexToken && item.ratingKey && hasCheckedToken) {
      checkWatchlistStatus();
    }
  }, [plexToken, item.ratingKey, hasCheckedToken]);

  const checkWatchlistStatus = async () => {
    if (!plexToken) return;
    
    setIsCheckingWatchlist(true);
    try {
      const { data, error } = await plexApi.checkWatchlist(plexToken, item.ratingKey);
      if (error) {
        console.error('[MatchCelebration] Error checking watchlist:', error);
      } else if (data) {
        setInWatchlist(data.inWatchlist);
        console.log('[MatchCelebration] Watchlist status:', data.inWatchlist);
      }
    } catch (err) {
      console.error('[MatchCelebration] Error checking watchlist:', err);
    } finally {
      setIsCheckingWatchlist(false);
    }
  };

  const handleAddToWatchlist = async () => {
    if (!plexToken || inWatchlist || isAddingToWatchlist) return;
    
    setIsAddingToWatchlist(true);
    haptics.medium();
    
    try {
      const { error } = await plexApi.addToWatchlist(plexToken, item.ratingKey);
      if (error) throw new Error(error);
      
      setInWatchlist(true);
      haptics.success();
      toast.success('Added to watchlist!');
    } catch (err) {
      haptics.error();
      console.error('[MatchCelebration] Error adding to watchlist:', err);
      toast.error('Failed to add to watchlist');
    } finally {
      setIsAddingToWatchlist(false);
    }
  };

  const handleCardClick = () => {
    haptics.selection();
    setIsFlipped(prev => !prev);
  };

  const renderRating = () => {
    const showCritic = ratingDisplay === 'critic' || ratingDisplay === 'both';
    const showAudience = ratingDisplay === 'audience' || ratingDisplay === 'both';
    
    const ratings = [];
    
    if (showCritic && item.rating) {
      ratings.push(
        <div key="critic" className="flex items-center gap-2 text-accent">
          <Star size={14} fill="currentColor" />
          <span>{item.rating.toFixed(1)}</span>
          {ratingDisplay === 'both' && <span className="text-xs text-muted-foreground">(Critic)</span>}
        </div>
      );
    }
    
    if (showAudience && item.audienceRating) {
      ratings.push(
        <div key="audience" className="flex items-center gap-2 text-primary">
          <Star size={14} fill="currentColor" />
          <span>{item.audienceRating.toFixed(1)}</span>
          {ratingDisplay === 'both' && <span className="text-xs text-muted-foreground">(Audience)</span>}
        </div>
      );
    }
    
    if (ratings.length === 0) {
      if (item.rating) {
        ratings.push(
          <div key="fallback-critic" className="flex items-center gap-2 text-accent">
            <Star size={14} fill="currentColor" />
            <span>{item.rating.toFixed(1)}</span>
          </div>
        );
      } else if (item.audienceRating) {
        ratings.push(
          <div key="fallback-audience" className="flex items-center gap-2 text-primary">
            <Star size={14} fill="currentColor" />
            <span>{item.audienceRating.toFixed(1)}</span>
          </div>
        );
      }
    }
    
    return ratings;
  };

  // Show watchlist button for Plex users (after we've checked for token)
  const showWatchlistButton = hasCheckedToken && plexToken !== null;

  return (
    <div className={cn("relative flex flex-col items-center pt-4 pb-8 px-6 overflow-hidden", className)}>
      <motion.div
        className="relative z-10 text-center max-w-md mx-auto w-full"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ 
          type: "spring", 
          stiffness: 200, 
          damping: 15,
          delay: 0.2 
        }}
      >
        <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-1">
          It's a Match!
        </h1>
        <p className="text-muted-foreground mb-4">
          We have a winner! <PartyPopper className="inline w-4 h-4" />
        </p>

        {/* Card - matching SwipeCard structure exactly */}
        <motion.div
          className="relative w-full max-w-[340px] sm:max-w-[400px] md:max-w-[450px] mx-auto mb-4"
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <div className="relative perspective-1000">
            <div
              style={{ 
                aspectRatio: "2/3",
                minHeight: "480px",
              }}
            >
              {/* Card container with flip - click handler here like SwipeCard */}
              <div
                onClick={handleCardClick}
                className={cn(
                  "relative w-full h-full transition-transform duration-500 cursor-pointer",
                  isFlipped && "[transform:rotateY(180deg)]"
                )}
                style={{ transformStyle: "preserve-3d" }}
              >
                {/* Front - Poster */}
                <div
                  className="absolute inset-0 rounded-2xl overflow-hidden shadow-2xl bg-card"
                  style={{ backfaceVisibility: "hidden" }}
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
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <h3 className="text-xl font-bold text-foreground">{item.title}</h3>
                    <p className="text-muted-foreground">{item.year}</p>
                  </div>
                  <div className="absolute top-4 left-4">
                    <span className="px-2 py-1 text-xs font-medium bg-secondary/80 backdrop-blur rounded-full text-secondary-foreground">
                      {item.type === "movie" ? "Movie" : "TV Show"}
                    </span>
                  </div>
                  
                  {/* Watchlist button - only show for Plex users */}
                  {showWatchlistButton && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!inWatchlist && !isAddingToWatchlist && !isCheckingWatchlist) {
                          handleAddToWatchlist();
                        }
                      }}
                      disabled={isAddingToWatchlist || isCheckingWatchlist || inWatchlist}
                      className={cn(
                        "absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center transition-all",
                        inWatchlist 
                          ? "bg-primary text-primary-foreground" 
                          : "bg-secondary/80 backdrop-blur text-secondary-foreground hover:bg-secondary"
                      )}
                      title={inWatchlist ? "In your watchlist" : "Add to watchlist"}
                    >
                      {isAddingToWatchlist || isCheckingWatchlist ? (
                        <Loader2 size={20} className="animate-spin" />
                      ) : inWatchlist ? (
                        <ListCheck size={20} />
                      ) : (
                        <ListPlus size={20} />
                      )}
                    </button>
                  )}
                  
                  {/* Tap hint */}
                  <div className="absolute bottom-16 left-0 right-0 text-center">
                    <span className="text-xs text-muted-foreground/70">Tap for details</span>
                  </div>
                </div>

                {/* Back - Details */}
                <div
                  className="absolute inset-0 rounded-2xl overflow-hidden shadow-2xl bg-card [transform:rotateY(180deg)]"
                  style={{ backfaceVisibility: "hidden" }}
                >
                  <div className="h-full overflow-y-auto p-5 space-y-3 scrollbar-thin">
                    <div>
                      <h3 className="text-xl font-bold text-foreground">{item.title}</h3>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {item.genres.slice(0, 3).map((genre) => (
                          <span
                            key={genre}
                            className="px-2 py-1 text-xs bg-secondary rounded-full text-secondary-foreground"
                          >
                            {genre}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar size={14} />
                        <span>{item.year}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock size={14} />
                        <span>{formatDuration(item.duration)}</span>
                      </div>
                      {renderRating()}
                      {item.contentRating && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Users size={14} />
                          <span>{item.contentRating}</span>
                        </div>
                      )}
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                        Summary
                      </p>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {item.summary || "No summary available."}
                      </p>
                    </div>

                    {item.directors && item.directors.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                          Director
                        </p>
                        <p className="text-sm text-foreground">{item.directors.join(", ")}</p>
                      </div>
                    )}

                    {item.actors && item.actors.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                          Cast
                        </p>
                        <p className="text-sm text-foreground">{item.actors.slice(0, 4).join(", ")}</p>
                      </div>
                    )}

                    {item.languages && item.languages.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                          Language
                        </p>
                        <div className="flex items-center gap-2">
                          <Globe size={14} className="text-muted-foreground" />
                          <p className="text-sm text-foreground">{item.languages.join(", ")}</p>
                        </div>
                      </div>
                    )}

                    <p className="text-xs text-center text-muted-foreground pt-2">
                      Tap to flip back
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.p
          className="text-lg font-medium text-foreground mb-4 flex items-center justify-center gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
        >
          <Popcorn size={24} className="text-primary" />
          Enjoy your watch session!
        </motion.p>

        <motion.div
          className="flex flex-col gap-3 w-full"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
        >
          {onWatchNow && (
            <Button
              onClick={onWatchNow}
              className="w-full h-12 text-base font-semibold bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              <Play className="mr-2" size={20} />
              Watch Now
            </Button>
          )}
          {children}
        </motion.div>
      </motion.div>

      {confetti.map((piece) => (
        <motion.div
          key={piece.id}
          className="absolute top-0 w-3 h-3 rounded-full z-20 pointer-events-none"
          style={{
            left: `${piece.left}%`,
            backgroundColor: piece.color,
          }}
          initial={{ y: -20, opacity: 1, rotate: 0 }}
          animate={{ 
            y: "100vh", 
            opacity: 0, 
            rotate: 720,
          }}
          transition={{ 
            duration: 3, 
            delay: piece.delay,
            ease: "easeOut"
          }}
        />
      ))}
    </div>
  );
};