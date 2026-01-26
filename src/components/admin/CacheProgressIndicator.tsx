// File: src/components/admin/CacheProgressIndicator.tsx
import { motion } from "framer-motion";
import { Database, Film, Tv, Languages, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";

interface CacheProgressIndicatorProps {
  phase: "movies" | "shows" | "languages" | "collections" | "complete" | "error" | "idle" | "starting";
  moviesProcessed?: number;
  moviesTotal?: number;
  showsProcessed?: number;
  showsTotal?: number;
  languagesFound?: number;
  collectionsProcessed?: number;
  error?: string;
  className?: string;
}

export const CacheProgressIndicator = ({
  phase,
  moviesProcessed = 0,
  moviesTotal = 0,
  showsProcessed = 0,
  showsTotal = 0,
  languagesFound = 0,
  collectionsProcessed = 0,
  error,
  className,
}: CacheProgressIndicatorProps) => {
  const steps = [
    { 
      key: "movies", 
      label: "Movies", 
      icon: Film, 
      processed: moviesProcessed, 
      total: moviesTotal,
      showProgress: true,
    },
    { 
      key: "shows", 
      label: "TV Shows", 
      icon: Tv, 
      processed: showsProcessed, 
      total: showsTotal,
      showProgress: true,
    },
    { 
      key: "languages", 
      label: "Languages", 
      icon: Languages, 
      processed: languagesFound,
      total: 0,
      showProgress: false,
    },
    { 
      key: "collections", 
      label: "Collections", 
      icon: FolderOpen, 
      processed: collectionsProcessed,
      total: 0,
      showProgress: false,
    },
  ];

  const currentIndex = steps.findIndex((s) => s.key === phase);
  const isComplete = phase === "complete";
  const isError = phase === "error";
  const isStarting = phase === "starting" || phase === "idle";

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Database size={16} className={cn(
          "text-primary",
          !isComplete && !isError && "animate-pulse"
        )} />
        {isComplete ? "Cache Complete!" : isError ? "Cache Error" : isStarting ? "Starting..." : "Scanning Library..."}
      </div>

      {isError && error && (
        <div className="p-2 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {steps.map((step, idx) => {
          const Icon = step.icon;
          const isActive = step.key === phase;
          const isDone = isComplete || idx < currentIndex;
          const hasProgress = step.showProgress && step.total > 0;
          const progressPercent = hasProgress ? Math.round((step.processed / step.total) * 100) : 0;

          return (
            <motion.div
              key={step.key}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.1 }}
              className={cn(
                "flex flex-col gap-1 p-2 rounded-lg transition-all",
                isActive && "bg-primary/10 border border-primary/30",
                isDone && "bg-accent/10",
                !isActive && !isDone && "opacity-50"
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon
                    size={16}
                    className={cn(
                      isActive && "text-primary animate-pulse",
                      isDone && "text-accent"
                    )}
                  />
                  <span className="text-sm text-foreground">{step.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  {(isActive || isDone) && step.processed > 0 && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="text-xs font-medium text-primary"
                    >
                      {step.processed.toLocaleString()}
                      {hasProgress && !isDone && (
                        <span className="text-muted-foreground">
                          {" / "}{step.total.toLocaleString()}
                        </span>
                      )}
                      {step.key === "languages" ? " found" : step.key === "collections" ? " cached" : ""}
                    </motion.span>
                  )}
                  {isActive && (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full"
                    />
                  )}
                  {isDone && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="w-4 h-4 bg-accent rounded-full flex items-center justify-center"
                    >
                      <svg
                        className="w-3 h-3 text-accent-foreground"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </motion.div>
                  )}
                </div>
              </div>
              
              {/* Progress bar for movies and shows */}
              {isActive && hasProgress && (
                <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-primary"
                    initial={{ width: 0 }}
                    animate={{ width: `${progressPercent}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {isComplete && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center text-sm text-muted-foreground"
        >
          Total: {(moviesProcessed + showsProcessed).toLocaleString()} media items
        </motion.div>
      )}
    </div>
  );
};