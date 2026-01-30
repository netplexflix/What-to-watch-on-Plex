// File: src/pages/Results.tsx
import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Home, Loader2, Frown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MatchCelebration } from "@/components/MatchCelebration";
import { NoMatchFallback } from "@/components/NoMatchFallback";
import { PlaybackControl } from "@/components/PlaybackControl";
import { sessionsApi, adminApi } from "@/lib/api";
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
  const [enablePlexButton, setEnablePlexButton] = useState(false);
  
  // Use ref to track if we've already loaded
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    // Prevent multiple loads
    if (!code || hasLoadedRef.current) return;
    hasLoadedRef.current = true;

    const loadResults = async () => {
      try {
        // Load settings first
        const { data: settingsData } = await adminApi.getSessionSettings();
        if (settingsData?.settings?.enable_plex_button) {
          setEnablePlexButton(true);
        }

        const { data: sessionData, error: sessionError } = await sessionsApi.getByCode(code);

        if (sessionError || !sessionData?.session) {
          toast.error("Session not found");
          navigate("/");
          return;
        }

        const session = sessionData.session;

        if (session.status === "no_match") {
          setNoMatch(true);
          await loadTopVotedItems(session.id, session.media_type);
          setLoading(false);
          return;
        }

        if (!session.winner_item_key) {
          navigate(`/swipe/${code}`);
          return;
        }

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
  }, [code, navigate, haptics]);

  const loadTopVotedItems = async (sid: string, mediaType?: string) => {
    try {
      const { data: votesData } = await sessionsApi.getVotes(sid);
      
      if (!votesData?.votes) return;

      const voteCounts = new Map<string, number>();
      votesData.votes.forEach((vote: any) => {
        if (vote.vote) {
          voteCounts.set(vote.item_key, (voteCounts.get(vote.item_key) || 0) + 1);
        }
      });

      const { data: mediaData } = await sessionsApi.getCachedMedia(mediaType || 'both');
      
      if (!mediaData?.items) return;

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

            <div className="flex flex-col gap-3 mt-4">
              <Button
                onClick={handleNewSession}
                variant="outline"
                className="w-full h-12 text-base font-semibold border-secondary text-foreground hover:bg-secondary"
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

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 relative z-10">
        {winnerItem && (
          <MatchCelebration item={winnerItem}>
            <div className="flex flex-col gap-3 w-full">
              {enablePlexButton && (
                <PlaybackControl
                  ratingKey={winnerItem.ratingKey}
                  title={winnerItem.title}
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
        )}
      </div>
    </div>
  );
};

export default Results;