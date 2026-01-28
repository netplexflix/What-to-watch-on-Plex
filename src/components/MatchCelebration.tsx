// File: src/components/MatchCelebration.tsx
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { PartyPopper, Play, Popcorn, Clock, User, Film, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useHaptics } from "@/hooks/useHaptics";
import type { PlexItem } from "@/types/session";

interface MatchCelebrationProps {
  item: PlexItem;
  onWatchNow?: () => void;
  onPlayAgain?: () => void;
  className?: string;
}

// Format duration to hours and minutes
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
  onPlayAgain,
  className 
}: MatchCelebrationProps) => {
  const [confetti, setConfetti] = useState<{ id: number; color: string; left: number; delay: number }[]>([]);
  const haptics = useHaptics();

  useEffect(() => {
    // Trigger success haptic on match celebration
    haptics.success();
    
    const pieces = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      left: Math.random() * 100,
      delay: Math.random() * 0.5,
    }));
    setConfetti(pieces);
  }, []);

  return (
    <div className={cn("relative min-h-screen flex flex-col items-center justify-center p-6 overflow-hidden", className)}>
      {/* Confetti */}
      {confetti.map((piece) => (
        <motion.div
          key={piece.id}
          className="absolute top-0 w-3 h-3 rounded-full"
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

      {/* Content */}
      <motion.div
        className="relative z-10 text-center max-w-md mx-auto"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ 
          type: "spring", 
          stiffness: 200, 
          damping: 15,
          delay: 0.2 
        }}
      >
        <motion.div
          className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-accent/20 mb-6"
          initial={{ rotate: -180 }}
          animate={{ rotate: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 10 }}
        >
          <Popcorn className="w-10 h-10 text-accent" />
        </motion.div>

        <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">
          It's a Match!
        </h1>
        <p className="text-muted-foreground mb-8">
          We have a winner! <PartyPopper className="inline w-5 h-5" />
        </p>

        {/* Matched item card - full poster */}
        <motion.div
          className="relative rounded-2xl overflow-hidden card-shadow mb-6 max-w-[200px] mx-auto"
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <img
            src={item.thumb}
            alt={item.title}
            className="w-full aspect-[2/3] object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).src = "/placeholder.svg";
            }}
          />
        </motion.div>

        {/* Title and metadata below poster */}
        <motion.div
          className="text-center mb-4"
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.45 }}
        >
          <h2 className="text-2xl font-bold text-foreground">{item.title}</h2>
          <p className="text-muted-foreground">
            {item.year} • {item.genres.slice(0, 2).join(", ")}
          </p>
        </motion.div>

        {/* Media details */}
        <motion.div
          className="w-full text-left space-y-4 mb-6"
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          {/* Runtime & Rating */}
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            {item.duration > 0 && (
              <span className="flex items-center gap-1">
                <Clock size={14} />
                {formatDuration(item.duration)}
              </span>
            )}
            {item.rating && (
              <span className="flex items-center gap-1">
                ⭐ {item.rating.toFixed(1)}
              </span>
            )}
            {item.contentRating && (
              <span className="px-2 py-0.5 bg-secondary rounded text-xs">
                {item.contentRating}
              </span>
            )}
          </div>

          {/* Language */}
          {item.languages && item.languages.length > 0 && (
            <div className="flex items-start gap-2 text-sm">
              <Globe size={14} className="text-muted-foreground mt-0.5 shrink-0" />
              <span className="text-muted-foreground">
                <span className="text-foreground font-medium">Language:</span>{" "}
                {item.languages.join(", ")}
              </span>
            </div>
          )}

          {/* Director */}
          {item.directors && item.directors.length > 0 && (
            <div className="flex items-start gap-2 text-sm">
              <Film size={14} className="text-muted-foreground mt-0.5 shrink-0" />
              <span className="text-muted-foreground">
                <span className="text-foreground font-medium">Director:</span>{" "}
                {item.directors.slice(0, 2).join(", ")}
              </span>
            </div>
          )}

          {/* Actors */}
          {item.actors && item.actors.length > 0 && (
            <div className="flex items-start gap-2 text-sm">
              <User size={14} className="text-muted-foreground mt-0.5 shrink-0" />
              <span className="text-muted-foreground">
                <span className="text-foreground font-medium">Cast:</span>{" "}
                {item.actors.slice(0, 3).join(", ")}
              </span>
            </div>
          )}

          {/* Summary */}
          {item.summary && (
            <p className="text-sm text-muted-foreground line-clamp-3">
              {item.summary}
            </p>
          )}
        </motion.div>

        {/* Good watch message */}
        <motion.p
          className="text-lg font-medium text-primary mb-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
        >
          🎬 Enjoy your watch session!
        </motion.p>

        {/* Action buttons */}
        <div className="flex flex-col gap-3">
          {onWatchNow && (
            <Button
              onClick={onWatchNow}
              className="w-full h-12 text-base font-semibold bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              <Play className="mr-2" size={20} />
              Watch Now
            </Button>
          )}
          {onPlayAgain && (
            <Button
              onClick={onPlayAgain}
              variant="outline"
              className="w-full h-12 text-base font-semibold border-secondary text-foreground hover:bg-secondary"
            >
              Play Again
            </Button>
          )}
        </div>
      </motion.div>
    </div>
  );
};