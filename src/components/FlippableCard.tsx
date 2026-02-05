// File: src/components/FlippableCard.tsx
import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { Check, Star, Calendar, Clock, Users, ImageOff, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { useHaptics } from "@/hooks/useHaptics";
import type { PlexItem } from "@/types/session";

interface FlippableCardProps {
  item: PlexItem;
  isSelected?: boolean;
  isDisabled?: boolean;
  onSelect?: (itemKey: string) => void;
  showSelectedIndicator?: boolean;
  animationDelay?: number;
  ratingDisplay?: 'critic' | 'audience' | 'both';
  className?: string;
}

export const FlippableCard = ({
  item,
  isSelected = false,
  isDisabled = false,
  onSelect,
  showSelectedIndicator = true,
  animationDelay = 0,
  ratingDisplay = 'critic',
  className,
}: FlippableCardProps) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const haptics = useHaptics();
  
  // Double tap detection
  const lastTapRef = useRef<number>(0);
  const tapTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const DOUBLE_TAP_DELAY = 300; // ms

  // Reset flip state when item changes
  useEffect(() => {
    setIsFlipped(false);
    setImageLoaded(false);
    setImageError(false);
  }, [item.ratingKey]);

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

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current);
      }
    };
  }, []);

  const handleTap = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const now = Date.now();
    const timeSinceLastTap = now - lastTapRef.current;
    
    if (timeSinceLastTap < DOUBLE_TAP_DELAY && timeSinceLastTap > 0) {
      // Double tap detected - flip the card
      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current);
        tapTimeoutRef.current = null;
      }
      haptics.selection();
      setIsFlipped(prev => !prev);
      lastTapRef.current = 0; // Reset to prevent triple tap issues
    } else {
      // First tap - wait to see if it's a double tap
      lastTapRef.current = now;
      
      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current);
      }
      
      tapTimeoutRef.current = setTimeout(() => {
        // Single tap confirmed - select the item
        if (!isDisabled && onSelect) {
          haptics.selection();
          onSelect(item.ratingKey);
        }
        tapTimeoutRef.current = null;
      }, DOUBLE_TAP_DELAY);
    }
  }, [isDisabled, onSelect, item.ratingKey, haptics]);

  const formatDuration = (ms: number) => {
    if (!ms || ms === 0) return "N/A";
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const renderRating = () => {
    const showCritic = ratingDisplay === 'critic' || ratingDisplay === 'both';
    const showAudience = ratingDisplay === 'audience' || ratingDisplay === 'both';
    
    const ratings = [];
    
    if (showCritic && item.rating) {
      ratings.push(
        <div key="critic" className="flex items-center gap-1 text-accent">
          <Star size={12} fill="currentColor" />
          <span className="text-xs">{item.rating.toFixed(1)}</span>
          {ratingDisplay === 'both' && <span className="text-[10px] text-muted-foreground">(C)</span>}
        </div>
      );
    }
    
    if (showAudience && item.audienceRating) {
      ratings.push(
        <div key="audience" className="flex items-center gap-1 text-primary">
          <Star size={12} fill="currentColor" />
          <span className="text-xs">{item.audienceRating.toFixed(1)}</span>
          {ratingDisplay === 'both' && <span className="text-[10px] text-muted-foreground">(A)</span>}
        </div>
      );
    }
    
    // Fallback if no ratings available for selected display mode
    if (ratings.length === 0) {
      if (item.rating) {
        ratings.push(
          <div key="fallback-critic" className="flex items-center gap-1 text-accent">
            <Star size={12} fill="currentColor" />
            <span className="text-xs">{item.rating.toFixed(1)}</span>
          </div>
        );
      } else if (item.audienceRating) {
        ratings.push(
          <div key="fallback-audience" className="flex items-center gap-1 text-primary">
            <Star size={12} fill="currentColor" />
            <span className="text-xs">{item.audienceRating.toFixed(1)}</span>
          </div>
        );
      }
    }
    
    return ratings;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: animationDelay }}
      onClick={handleTap}
      className={cn(
        "relative rounded-xl overflow-hidden aspect-[2/3] transition-all duration-200 cursor-pointer select-none",
        isSelected 
          ? "ring-4 ring-primary ring-offset-2 ring-offset-background scale-[1.02]" 
          : "hover:scale-[1.01]",
        isDisabled && !isSelected && "opacity-40",
        className
      )}
      style={{ perspective: "1000px" }}
    >
      {/* Card container with flip */}
      <div
        className={cn(
          "relative w-full h-full transition-transform duration-500",
          isFlipped && "[transform:rotateY(180deg)]"
        )}
        style={{ transformStyle: "preserve-3d" }}
      >
        {/* Front - Poster */}
        <div
          className="absolute inset-0 rounded-xl overflow-hidden bg-card"
          style={{ backfaceVisibility: "hidden" }}
        >
          {/* Loading skeleton */}
          {!imageLoaded && !imageError && (
            <div className="absolute inset-0 bg-gradient-to-br from-secondary to-muted animate-pulse flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
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
              draggable={false}
            />
          )}
          
          {/* Fallback placeholder */}
          {(imageError || !item.thumb) && (
            <div className="absolute inset-0 bg-gradient-to-br from-secondary to-muted flex flex-col items-center justify-center gap-2">
              <ImageOff size={24} className="text-muted-foreground" />
              <span className="text-2xl font-bold text-muted-foreground">
                {item.title.charAt(0)}
              </span>
            </div>
          )}
          
          <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-2">
            <p className="font-medium text-foreground text-xs truncate">{item.title}</p>
            <p className="text-[10px] text-muted-foreground">{item.year}</p>
          </div>
          
          {/* Selected indicator */}
          {showSelectedIndicator && isSelected && (
            <motion.div 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute top-2 right-2 w-7 h-7 bg-primary rounded-full flex items-center justify-center"
            >
              <Check size={16} className="text-primary-foreground" />
            </motion.div>
          )}
        </div>

        {/* Back - Details */}
        <div
          className="absolute inset-0 rounded-xl overflow-hidden bg-card [transform:rotateY(180deg)]"
          style={{ backfaceVisibility: "hidden" }}
        >
          <div className="h-full overflow-y-auto p-3 space-y-2 scrollbar-thin">
            <div>
              <h3 className="text-sm font-bold text-foreground leading-tight">{item.title}</h3>
              <div className="flex flex-wrap gap-1 mt-1">
                {item.genres.slice(0, 2).map((genre) => (
                  <span
                    key={genre}
                    className="px-1.5 py-0.5 text-[10px] bg-secondary rounded-full text-secondary-foreground"
                  >
                    {genre}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5 text-xs">
              <div className="flex items-center gap-1 text-muted-foreground">
                <Calendar size={10} />
                <span>{item.year}</span>
              </div>
              <div className="flex items-center gap-1 text-muted-foreground">
                <Clock size={10} />
                <span>{formatDuration(item.duration)}</span>
              </div>
              {renderRating()}
              {item.contentRating && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Users size={10} />
                  <span>{item.contentRating}</span>
                </div>
              )}
            </div>

            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">
                Summary
              </p>
              <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-4">
                {item.summary || "No summary available."}
              </p>
            </div>

            {item.directors && item.directors.length > 0 && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">
                  Director
                </p>
                <p className="text-[11px] text-foreground">{item.directors.slice(0, 2).join(", ")}</p>
              </div>
            )}

            {item.actors && item.actors.length > 0 && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">
                  Cast
                </p>
                <p className="text-[11px] text-foreground">{item.actors.slice(0, 3).join(", ")}</p>
              </div>
            )}

            {item.languages && item.languages.length > 0 && (
              <div className="flex items-center gap-1">
                <Globe size={10} className="text-muted-foreground" />
                <p className="text-[11px] text-foreground">{item.languages.slice(0, 2).join(", ")}</p>
              </div>
            )}

            <p className="text-[9px] text-center text-muted-foreground pt-1">
              Double tap to flip back
            </p>
          </div>
          
          {/* Selected indicator on back too */}
          {showSelectedIndicator && isSelected && (
            <motion.div 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute top-2 right-2 w-6 h-6 bg-primary rounded-full flex items-center justify-center"
            >
              <Check size={14} className="text-primary-foreground" />
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
};