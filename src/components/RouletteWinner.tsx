// File: src/components/RouletteWinner.tsx
import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Trophy, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useHaptics } from "@/hooks/useHaptics";
import { wsClient } from "@/lib/websocket";
import type { PlexItem } from "@/types/session";

interface RouletteWinnerProps {
  items: PlexItem[];
  winnerId: string;
  onComplete: () => void;
  isHost?: boolean;
  sessionId?: string;  // Add sessionId prop
  className?: string;
}

const ANIMATION_DURATION = 10000;
const ITEM_WIDTH = 100;
const ITEM_GAP = 8;
const VISIBLE_COUNT = 5;

export const RouletteWinner = ({ items, winnerId, onComplete, isHost = false, sessionId, className }: RouletteWinnerProps) => {
  const haptics = useHaptics();
  const [phase, setPhase] = useState<'waiting' | 'spinning' | 'winner'>('waiting');
  const [translateX, setTranslateX] = useState(0);
  
  const rafRef = useRef<number | null>(null);
  const hasCompletedRef = useRef(false);
  const hasStartedRef = useRef(false);
  const lastHapticIndexRef = useRef(-1);

  // Build strip data once
  const stripData = useRef<{ strip: PlexItem[]; winnerIndex: number; targetOffset: number } | null>(null);
  
  if (!stripData.current && items.length > 0) {
    const itemTotalWidth = ITEM_WIDTH + ITEM_GAP;
    const containerWidth = VISIBLE_COUNT * ITEM_WIDTH + (VISIBLE_COUNT - 1) * ITEM_GAP;
    const centerOffset = Math.floor(containerWidth / 2) - Math.floor(ITEM_WIDTH / 2);
    
    const seed = winnerId.split('').reduce((acc, char, i) => acc + char.charCodeAt(0) * (i + 1), 0);
    
    const stripItems: PlexItem[] = [];
    const minItems = 40;
    
    for (let i = 0; i < minItems; i++) {
      const itemIndex = (seed + i * 7) % items.length;
      stripItems.push(items[itemIndex]);
    }
    
    const winnerIdx = 35;
    const winner = items.find(item => item.ratingKey === winnerId);
    if (winner) {
      stripItems[winnerIdx] = winner;
    }
    
    const target = (winnerIdx * itemTotalWidth) - centerOffset;
    
    stripData.current = {
      strip: stripItems,
      winnerIndex: winnerIdx,
      targetOffset: Math.max(0, target),
    };
  }

  // The actual animation logic - extracted so it can be called from multiple places
  const runAnimation = () => {
    if (hasStartedRef.current) return;
    
    // Handle single item case
    if (items.length <= 1) {
      hasStartedRef.current = true;
      setPhase('winner');
      haptics.success();
      const timer = setTimeout(() => {
        if (!hasCompletedRef.current) {
          hasCompletedRef.current = true;
          onComplete();
        }
      }, 2000);
      return;
    }

    if (!stripData.current) return;

    hasStartedRef.current = true;
    setPhase('spinning');
    
    const { targetOffset } = stripData.current;
    const itemTotalWidth = ITEM_WIDTH + ITEM_GAP;
    
    console.log('[Roulette] Starting animation to target:', targetOffset);

    const startTime = performance.now();

    const easeOutCubic = (t: number): number => {
      return 1 - Math.pow(1 - t, 3);
    };

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / ANIMATION_DURATION, 1);
      const easedProgress = easeOutCubic(progress);
      const currentX = Math.round(easedProgress * targetOffset);
      
      setTranslateX(currentX);
      
      // Haptic feedback
      const currentItemIndex = Math.floor(currentX / itemTotalWidth);
      if (currentItemIndex > lastHapticIndexRef.current && progress < 0.9) {
        lastHapticIndexRef.current = currentItemIndex;
        haptics.light();
      }
      
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        // Animation complete
        console.log('[Roulette] Animation complete');
        setTranslateX(targetOffset);
        setPhase('winner');
        haptics.success();
        
        setTimeout(() => {
          if (!hasCompletedRef.current) {
            hasCompletedRef.current = true;
            console.log('[Roulette] Calling onComplete');
            onComplete();
          }
        }, 2500);
      }
    };

    // Start animation
    rafRef.current = requestAnimationFrame(animate);
  };

  // Host starts animation and broadcasts to others
  const startAnimation = () => {
    if (hasStartedRef.current) return;
    
    // Broadcast to other participants that roulette has started
    if (sessionId && isHost) {
      console.log('[Roulette] Host broadcasting roulette_started event');
      // Send via WebSocket - we need to trigger this on the server
      // For now, we'll use a workaround by sending a message that the server will broadcast
      fetch(`/api/sessions/${sessionId}/broadcast-roulette`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).catch(err => {
        console.error('[Roulette] Error broadcasting roulette start:', err);
      });
    }
    
    runAnimation();
  };

  // Listen for roulette_started event from WebSocket (for non-hosts)
  useEffect(() => {
    if (isHost) return; // Host doesn't need to listen, they trigger it
    
    const unsubscribe = wsClient.on('roulette_started', () => {
      console.log('[Roulette] Received roulette_started event, starting animation');
      runAnimation();
    });

    return () => {
      unsubscribe();
    };
  }, [isHost]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  // Single item case
  if (items.length <= 1) {
    const singleItem = items[0];
    return (
      <div className={cn("flex flex-col items-center justify-center p-6", className)}>
        <h2 className="text-xl font-bold text-foreground mb-6">🎉 Winner!</h2>
        {singleItem && (
          <div className="relative">
            <div className="rounded-2xl overflow-hidden shadow-2xl ring-4 ring-accent ring-offset-4 ring-offset-background">
              <img
                src={singleItem.thumb}
                alt={singleItem.title}
                className="w-40 h-60 object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "/placeholder.svg";
                }}
              />
            </div>
            <div className="absolute -bottom-4 left-1/2 -translate-x-1/2">
              <div className="w-10 h-10 bg-accent rounded-full flex items-center justify-center shadow-lg">
                <Trophy className="w-5 h-5 text-accent-foreground" />
              </div>
            </div>
          </div>
        )}
        <div className="mt-8 text-center">
          <h3 className="text-xl font-bold text-foreground">{singleItem?.title}</h3>
          <p className="text-muted-foreground">{singleItem?.year}</p>
        </div>
      </div>
    );
  }

  if (!stripData.current) {
    return null;
  }

  const { strip, winnerIndex } = stripData.current;
  const containerWidth = VISIBLE_COUNT * ITEM_WIDTH + (VISIBLE_COUNT - 1) * ITEM_GAP;

  return (
    <div className={cn("flex flex-col items-center justify-center p-4 w-full max-w-md mx-auto", className)}>
      <h2 className="text-lg font-bold text-foreground mb-4">
        {phase === 'winner' ? "🎉 Winner!" : phase === 'spinning' ? "🎰 Breaking the tie..." : "🎰 It's a tie!"}
      </h2>

      <div className="relative" style={{ width: containerWidth }}>
        {/* Center indicator */}
        <div 
          className="absolute top-0 bottom-0 left-1/2 z-20 pointer-events-none"
          style={{ 
            width: ITEM_WIDTH + 8,
            marginLeft: -(ITEM_WIDTH + 8) / 2,
          }}
        >
          <div className={cn(
            "absolute inset-0 border-4 rounded-lg transition-all duration-500",
            phase === 'winner' 
              ? "border-accent shadow-[0_0_20px_rgba(251,191,36,0.5)]" 
              : "border-primary/70"
          )} />
          <div 
            className={cn(
              "absolute -top-2 left-1/2 -translate-x-1/2 w-0 h-0",
              "border-l-[10px] border-r-[10px] border-t-[10px]",
              "border-l-transparent border-r-transparent",
              phase === 'winner' ? "border-t-accent" : "border-t-primary"
            )} 
          />
        </div>

        {/* Strip viewport */}
        <div 
          className="overflow-hidden rounded-lg bg-secondary/20"
          style={{ width: containerWidth }}
        >
          {/* Fade overlays */}
          <div 
            className="absolute inset-y-0 left-0 w-12 z-10 pointer-events-none"
            style={{ background: 'linear-gradient(to right, hsl(var(--background)), transparent)' }}
          />
          <div 
            className="absolute inset-y-0 right-0 w-12 z-10 pointer-events-none"
            style={{ background: 'linear-gradient(to left, hsl(var(--background)), transparent)' }}
          />
          
          {/* Scrolling strip */}
          <div
            className="flex py-3"
            style={{
              gap: ITEM_GAP,
              transform: `translateX(${-translateX}px)`,
            }}
          >
            {strip.map((item, index) => {
              const isWinner = index === winnerIndex && phase === 'winner';
              
              return (
                <div
                  key={`roulette-item-${index}`}
                  className={cn(
                    "flex-shrink-0 rounded-lg overflow-hidden transition-transform duration-300",
                    isWinner && "scale-105"
                  )}
                  style={{ width: ITEM_WIDTH }}
                >
                  <div className="relative" style={{ height: ITEM_WIDTH * 1.5 }}>
                    <img
                      src={item.thumb}
                      alt={item.title}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = "/placeholder.svg";
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-1.5">
                      <p className="text-[10px] font-medium text-white truncate leading-tight">
                        {item.title}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Winner trophy */}
        {phase === 'winner' && (
          <motion.div
            initial={{ scale: 0, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.3 }}
            className="absolute -bottom-5 left-1/2 -translate-x-1/2 z-30"
          >
            <div className="w-10 h-10 bg-accent rounded-full flex items-center justify-center shadow-lg">
              <Trophy className="w-5 h-5 text-accent-foreground" />
            </div>
          </motion.div>
        )}
      </div>

      {/* Start button for host - only show in waiting phase */}
      {phase === 'waiting' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6"
        >
          {isHost ? (
            <Button
              onClick={startAnimation}
              className="bg-primary text-primary-foreground px-8"
            >
              <Play size={18} className="mr-2" />
              Spin the Wheel
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              Waiting for host to start...
            </p>
          )}
        </motion.div>
      )}

      {/* Winner info */}
      {phase === 'winner' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-10 text-center"
        >
          {(() => {
            const winner = items.find(item => item.ratingKey === winnerId);
            return winner ? (
              <>
                <h3 className="text-xl font-bold text-foreground">{winner.title}</h3>
                <p className="text-muted-foreground">{winner.year}</p>
              </>
            ) : null;
          })()}
        </motion.div>
      )}
    </div>
  );
};