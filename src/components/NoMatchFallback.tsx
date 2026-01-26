import { motion } from "framer-motion";
import { ThumbsUp, Play, RotateCcw, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PlexItem } from "@/types/session";

interface TopVotedItem {
  item: PlexItem;
  yesVotes: number;
  totalVotes: number;
  percentage: number;
}

interface NoMatchFallbackProps {
  topItems: TopVotedItem[];
  onSelectItem: (item: PlexItem) => void;
  onPlayAgain: () => void;
}

export const NoMatchFallback = ({ topItems, onSelectItem, onPlayAgain }: NoMatchFallbackProps) => {
  if (topItems.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-6">
            <ThumbsUp size={40} className="text-muted-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">No Agreement</h1>
          <p className="text-muted-foreground text-center mb-8 max-w-sm">
            Looks like everyone has different tastes tonight! Try a new session with different preferences.
          </p>
          <Button onClick={onPlayAgain} className="bg-primary text-primary-foreground">
            <RotateCcw size={18} className="mr-2" />
            Start New Session
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col px-6 py-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <h1 className="text-2xl font-bold text-foreground mb-2">Close Calls!</h1>
        <p className="text-muted-foreground">
          No unanimous match, but here are the top picks
        </p>
      </motion.div>

      <div className="flex-1 space-y-4 max-w-md mx-auto w-full">
        {topItems.map((topItem, index) => (
          <motion.div
            key={topItem.item.ratingKey}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className="glass-card rounded-xl overflow-hidden"
          >
            <div className="flex">
              <div className="w-24 h-36 flex-shrink-0">
                <img
                  src={topItem.item.thumb}
                  alt={topItem.item.title}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "/placeholder.svg";
                  }}
                />
              </div>
              <div className="flex-1 p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    {index === 0 && (
                      <span className="bg-primary/20 text-primary text-xs px-2 py-0.5 rounded-full font-medium">
                        Top Pick
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {topItem.item.year}
                    </span>
                  </div>
                  <h3 className="font-semibold text-foreground line-clamp-1">
                    {topItem.item.title}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex items-center gap-1">
                      <ThumbsUp size={14} className="text-primary" />
                      <span className="text-sm text-muted-foreground">
                        {topItem.percentage}% approval
                      </span>
                    </div>
                    {topItem.item.rating && (
                      <div className="flex items-center gap-1">
                        <Star size={14} className="text-accent" />
                        <span className="text-sm text-muted-foreground">
                          {topItem.item.rating.toFixed(1)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => onSelectItem(topItem.item)}
                  className="mt-2 bg-primary text-primary-foreground"
                >
                  <Play size={14} className="mr-1" />
                  Watch This
                </Button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-8 text-center"
      >
        <Button variant="outline" onClick={onPlayAgain}>
          <RotateCcw size={18} className="mr-2" />
          Start New Session
        </Button>
      </motion.div>
    </div>
  );
};
