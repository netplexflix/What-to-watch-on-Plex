// file: src/components/SwipeCard.tsx
import { useState, useRef, useEffect, useCallback } from "react";
import { motion, useMotionValue, useTransform, PanInfo } from "framer-motion";
import { X, Heart, RotateCcw, Star, Calendar, Clock, Users, ImageOff, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconButton } from "@/components/ui/IconButton";
import { useHaptics } from "@/hooks/useHaptics";
import type { PlexItem } from "@/types/session";

interface SwipeCardProps {
  item: PlexItem;
  onSwipe: (direction: "left" | "right") => void;
  onUndo?: () => void;
  className?: string;
}

export const SwipeCard = ({ item, onSwipe, onUndo, className }: SwipeCardProps) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [exitDirection, setExitDirection] = useState<"left" | "right" | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const constraintsRef = useRef(null);
  const haptics = useHaptics();
  const cardKey = useRef(item.ratingKey);
  
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-15, 15]);
  const opacity = useTransform(x, [-200, -100, 0, 100, 200], [0.5, 1, 1, 1, 0.5]);
  
  const leftIndicatorOpacity = useTransform(x, [-100, 0], [1, 0]);
  const rightIndicatorOpacity = useTransform(x, [0, 100], [0, 1]);

  // Reset state when item changes
  useEffect(() => {
    if (cardKey.current !== item.ratingKey) {
      cardKey.current = item.ratingKey;
      setIsFlipped(false);
      setExitDirection(null);
      setImageLoaded(false);
      setImageError(false);
      x.set(0);
    }
  }, [item.ratingKey, x]);

  // Preload image
  useEffect(() => {
    if (!item.thumb || item.thumb === "/placeholder.svg") {
      setImageError(true);
      return;
    }

    setImageLoaded(false);
    setImageError(false);

    const img = new Image();
    img.onload = () => {
      setImageLoaded(true);
      setImageError(false);
    };
    img.onerror = () => {
      setImageError(true);
      setImageLoaded(false);
    };
    img.src = item.thumb;

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [item.thumb]);

  const handleDragStart = useCallback(() => {
    setIsDragging(true);
  }, []);

  const handleDragEnd = useCallback((_: any, info: PanInfo) => {
    setIsDragging(false);
    const threshold = 100;
    if (info.offset.x > threshold) {
      setExitDirection("right");
      onSwipe("right");
    } else if (info.offset.x < -threshold) {
      setExitDirection("left");
      onSwipe("left");
    }
  }, [onSwipe]);

  const handleButtonSwipe = useCallback((direction: "left" | "right") => {
    setExitDirection(direction);
    onSwipe(direction);
  }, [onSwipe]);

  const handleUndoClick = useCallback(() => {
    haptics.light();
    onUndo?.();
  }, [haptics, onUndo]);

  const handleCardClick = useCallback((e: React.MouseEvent) => {
    // Only flip if not dragging and click is on the card itself
    if (!isDragging) {
      e.stopPropagation();
      haptics.selection();
      setIsFlipped(prev => !prev);
    }
  }, [isDragging, haptics]);

  const formatDuration = (ms: number) => {
    if (!ms || ms === 0) return "N/A";
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  return (
    <div className={cn("relative w-full max-w-[340px] sm:max-w-[400px] md:max-w-[450px] mx-auto", className)}>
      <div ref={constraintsRef} className="relative perspective-1000">
        <motion.div
          className={cn(
            "relative w-full cursor-grab active:cursor-grabbing swipe-card",
            exitDirection === "left" && "animate-swipe-left",
            exitDirection === "right" && "animate-swipe-right"
          )}
          style={{ 
            x, 
            rotate, 
            opacity,
            aspectRatio: "2/3",
            minHeight: "480px",
          }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.7}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          whileTap={{ scale: 0.98 }}
        >
          {/* Swipe indicators */}
          <motion.div
            className="absolute top-4 left-4 z-30 px-4 py-2 bg-destructive rounded-lg font-bold text-destructive-foreground"
            style={{ opacity: leftIndicatorOpacity }}
          >
            NOPE
          </motion.div>
          <motion.div
            className="absolute top-4 right-4 z-30 px-4 py-2 bg-primary rounded-lg font-bold text-primary-foreground"
            style={{ opacity: rightIndicatorOpacity }}
          >
            LIKE
          </motion.div>

          {/* Card container with flip */}
          <div
            onClick={handleCardClick}
            className={cn(
              "relative w-full h-full transition-transform duration-500",
              isFlipped && "[transform:rotateY(180deg)]"
            )}
            style={{ transformStyle: "preserve-3d" }}
          >
            {/* Front - Poster */}
            <div
              className="absolute inset-0 rounded-2xl overflow-hidden shadow-2xl bg-card"
              style={{ backfaceVisibility: "hidden" }}
            >
              {/* Loading skeleton */}
              {!imageLoaded && !imageError && (
                <div className="absolute inset-0 bg-gradient-to-br from-secondary to-muted animate-pulse flex items-center justify-center">
                  <div className="w-16 h-16 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                </div>
              )}
              
              {/* Actual image */}
              {item.thumb && !imageError && (
                <img
                  src={item.thumb}
                  alt={item.title}
                  className={cn(
                    "w-full h-full object-cover transition-opacity duration-300",
                    imageLoaded ? "opacity-100" : "opacity-0"
                  )}
                  onLoad={() => setImageLoaded(true)}
                  onError={() => setImageError(true)}
                />
              )}
              
              {/* Fallback placeholder */}
              {(imageError || !item.thumb) && (
                <div className="absolute inset-0 bg-gradient-to-br from-secondary to-muted flex flex-col items-center justify-center gap-4">
                  <ImageOff size={48} className="text-muted-foreground" />
                  <span className="text-4xl font-bold text-muted-foreground">
                    {item.title.charAt(0)}
                  </span>
                </div>
              )}
              
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
                  {item.rating && (
                    <div className="flex items-center gap-2 text-accent">
                      <Star size={14} fill="currentColor" />
                      <span>{item.rating.toFixed(1)}</span>
                    </div>
                  )}
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
        </motion.div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-center gap-6 mt-6">
        <IconButton
          variant="swipe-no"
          size="lg"
          onClick={() => handleButtonSwipe("left")}
          aria-label="Dislike"
        >
          <X size={28} />
        </IconButton>
        
        {onUndo && (
          <IconButton
            variant="default"
            size="md"
            onClick={handleUndoClick}
            aria-label="Undo"
          >
            <RotateCcw size={20} />
          </IconButton>
        )}
        
        <IconButton
          variant="swipe-yes"
          size="lg"
          onClick={() => handleButtonSwipe("right")}
          aria-label="Like"
        >
          <Heart size={28} />
        </IconButton>
      </div>
    </div>
  );
};