// File: src/pages/Results.tsx
import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Home, RotateCcw, Loader2, Frown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { MatchCelebration } from "@/components/MatchCelebration";
import { NoMatchFallback } from "@/components/NoMatchFallback";
import { sessionsApi } from "@/lib/api";
import { getLocalSession, clearLocalSession } from "@/lib/sessionStore";
import { toast } from "sonner";
import { useHaptics } from "@/hooks/useHaptics";
import type { PlexItem } from "@/types/session";

const Results = () => {
  const navigate = useNavigate();
  const { code } = useParams<{ code: string }>();
  const localSession = getLocalSession();
  const haptics = useHaptics();
  const [loading, setLoading] = useState(true);
  const [winnerItem, setWinnerItem] = useState<PlexItem | null>(null);
  const [noMatch, setNoMatch] = useState(false);
  const [topItems, setTopItems] = useState<{ item: PlexItem; votes: number }[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);

  useEffect(() => {
    if (!code) return;

    const loadResults = async () => {
      try {
        // Get session
        const { data: sessionData, error: sessionError } = await sessionsApi.getByCode(code);

        if (sessionError || !sessionData?.session) {
          toast.error("Session not found");
          navigate("/");
          return;
        }

        const session = sessionData.session;
        setSessionId(session.id);
        setIsHost(localSession?.isHost || session.host_user_id === localSession?.participantId);

        // Check session status
        if (session.status === "no_match") {
          setNoMatch(true);
          await loadTopVotedItems(session.id);
          setLoading(false);
          return;
        }

        if (!session.winner_item_key) {
          // No winner yet, redirect back
          navigate(`/swipe/${code}`);
          return;
        }

        // Get cached media to find winner details
        const { data: mediaData } = await sessionsApi.getCachedMedia(session.media_type || 'both');
        
        if (mediaData?.items) {
          const winner = mediaData.items.find((item: any) => item.ratingKey === session.winner_item_key);
          
          if (winner) {
            setWinnerItem({
              ratingKey: winner.ratingKey,
              title: winner.title,
              year: winner.year || 0,
              summary: winner.summary || "",
              thumb: winner.thumb || "/placeholder.svg",
              art: winner.art,
              duration: winner.duration || 0,
              rating: winner.rating || winner.audienceRating,
              contentRating: winner.contentRating,
              genres: winner.genres || winner.Genre?.map((g: any) => g.tag) || [],
              directors: winner.directors || winner.Director?.map((d: any) => d.tag) || [],
              actors: winner.actors || winner.Role?.map((r: any) => r.tag) || [],
              type: winner.type === "show" ? "show" : "movie",
              studio: winner.studio,
              audienceRating: winner.audienceRating,
              languages: winner.languages || [],
            });
            haptics.success();
          }
        }

        setLoading(false);
      } catch (error) {
        console.error("Error loading results:", error);
        toast.error("Failed to load results");
        setLoading(false);
      }
    };

    loadResults();
  }, [code, navigate, localSession, haptics]);

  const loadTopVotedItems = async (sid: string) => {
    try {
      // Get all votes
      const { data: votesData } = await sessionsApi.getVotes(sid);
      
      if (!votesData?.votes) return;

      // Count yes votes per item
      const voteCounts = new Map<string, number>();
      votesData.votes.forEach((vote: any) => {
        if (vote.vote) {
          voteCounts.set(vote.item_key, (voteCounts.get(vote.item_key) || 0) + 1);
        }
      });

      // Get session for media type
      const { data: sessionData } = await sessionsApi.getById(sid);
      
      // Get cached media
      const { data: mediaData } = await sessionsApi.getCachedMedia(sessionData?.session?.media_type || 'both');
      
      if (!mediaData?.items) return;

      // Sort by vote count and get top 3
      const sortedItems = Array.from(voteCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([itemKey, votes]) => {
          const item = mediaData.items.find((i: any) => i.ratingKey === itemKey);
          if (!item) return null;
          
          return {
            item: {
              ratingKey: item.ratingKey,
              title: item.title,
              year: item.year || 0,
              summary: item.summary || "",
              thumb: item.thumb || "/placeholder.svg",
              art: item.art,
              duration: item.duration || 0,
              rating: item.rating || item.audienceRating,
              contentRating: item.contentRating,
              genres: item.genres || item.Genre?.map((g: any) => g.tag) || [],
              directors: item.directors || item.Director?.map((d: any) => d.tag) || [],
              actors: item.actors || item.Role?.map((r: any) => r.tag) || [],
              type: item.type === "show" ? "show" : "movie",
              studio: item.studio,
              audienceRating: item.audienceRating,
              languages: item.languages || [],
            } as PlexItem,
            votes,
          };
        })
        .filter(Boolean) as { item: PlexItem; votes: number }[];

      setTopItems(sortedItems);
    } catch (error) {
      console.error("Error loading top items:", error);
    }
  };

  const handleNewSession = () => {
    clearLocalSession();
    haptics.medium();
    navigate("/");
  };

  const handlePlayAgain = async () => {
    if (!sessionId) return;
    
    haptics.medium();
    
    try {
      // Reset session for another round
      await sessionsApi.update(sessionId, { 
        status: "questions",
        winner_item_key: null,
      });
      
      // Get participants and reset their questions_completed
      const { data: participantsData } = await sessionsApi.getParticipants(sessionId);
      if (participantsData?.participants) {
        for (const p of participantsData.participants) {
          await sessionsApi.updateParticipant(p.id, { questions_completed: false });
        }
      }
      
      navigate(`/questions/${code}`);
    } catch (error) {
      console.error("Error restarting session:", error);
      haptics.error();
      toast.error("Failed to restart session");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="animate-spin text-primary" size={48} />
      </div>
    );
  }

  if (noMatch) {
    return (
      <div className="min-h-screen flex flex-col relative overflow-hidden">
        <div className="fixed inset-0 bg-background">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-6 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-md text-center"
          >
            <div className="flex justify-center mb-6">
              <Logo size="md" />
            </div>

            <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-6">
              <Frown size={40} className="text-muted-foreground" />
            </div>

            <h1 className="text-2xl font-bold text-foreground mb-2">
              No Perfect Match
            </h1>
            <p className="text-muted-foreground mb-8">
              The group couldn't agree on one title, but here are the closest options:
            </p>

            <NoMatchFallback items={topItems} />

            <div className="flex flex-col gap-3 mt-8">
              {isHost && (
                <Button
                  onClick={handlePlayAgain}
                  className="w-full h-12 bg-primary text-primary-foreground"
                >
                  <RotateCcw size={18} className="mr-2" />
                  Try Again
                </Button>
              )}
              <Button
                onClick={handleNewSession}
                variant="outline"
                className="w-full h-12"
              >
                <Home size={18} className="mr-2" />
                New Session
              </Button>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      <div className="fixed inset-0 bg-background">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md text-center"
        >
          <div className="flex justify-center mb-6">
            <Logo size="md" />
          </div>

          {winnerItem && <MatchCelebration item={winnerItem} />}

          <div className="flex flex-col gap-3 mt-8">
            {isHost && (
              <Button
                onClick={handlePlayAgain}
                className="w-full h-12 bg-primary text-primary-foreground"
              >
                <RotateCcw size={18} className="mr-2" />
                Play Again
              </Button>
            )}
            <Button
              onClick={handleNewSession}
              variant="outline"
              className="w-full h-12"
            >
              <Home size={18} className="mr-2" />
              New Session
            </Button>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Results;