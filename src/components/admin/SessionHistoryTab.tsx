// File: src/components/admin/SessionHistoryTab.tsx
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { History, Loader2, Trash2, Users, Trophy, Clock, Film, Tv } from "lucide-react";
import { Button } from "@/components/ui/button";
import { adminApi } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useHaptics } from "@/hooks/useHaptics";

interface SessionHistoryItem {
  id: string;
  session_code: string;
  participants: string[];
  winner_item_key: string | null;
  winner_title: string | null;
  winner_thumb: string | null;
  media_type: string | null;
  was_timed: boolean;
  completed_at: string;
}

export const SessionHistoryTab = () => {
  const haptics = useHaptics();
  const [history, setHistory] = useState<SessionHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [isClearing, setIsClearing] = useState(false);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const { data, error } = await adminApi.getSessionHistory(50, 0);
      
      if (error) throw new Error(error);
      
      if (data) {
        setHistory(data.history);
        setTotal(data.total);
      }
    } catch (err) {
      console.error("Error loading session history:", err);
      toast.error("Failed to load session history");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearHistory = async () => {
    if (!confirm("Are you sure you want to clear all session history? This cannot be undone.")) {
      return;
    }

    setIsClearing(true);
    haptics.medium();

    try {
      const { error } = await adminApi.clearSessionHistory();
      
      if (error) throw new Error(error);
      
      setHistory([]);
      setTotal(0);
      haptics.success();
      toast.success("Session history cleared");
    } catch (err) {
      haptics.error();
      console.error("Error clearing history:", err);
      toast.error("Failed to clear history");
    } finally {
      setIsClearing(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' at ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <History size={20} className="text-primary" />
          <h2 className="font-semibold text-foreground">Session History</h2>
          <span className="text-sm text-muted-foreground">({total} sessions)</span>
        </div>
        
        {history.length > 0 && (
          <Button
            onClick={handleClearHistory}
            disabled={isClearing}
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            {isClearing ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <>
                <Trash2 size={16} className="mr-1" />
                Clear
              </>
            )}
          </Button>
        )}
      </motion.div>

      {/* History List */}
      {history.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-12"
        >
          <History size={48} className="mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No session history yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Completed sessions will appear here
          </p>
        </motion.div>
      ) : (
        <div className="space-y-3">
          {history.map((item, index) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="glass-card rounded-xl p-4"
            >
              <div className="flex gap-4">
                {/* Winner Thumbnail */}
                <div className="flex-shrink-0">
                  {item.winner_thumb ? (
                    <img
                      src={item.winner_thumb}
                      alt={item.winner_title || "Winner"}
                      className="w-16 h-24 object-cover rounded-lg"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = "/placeholder.svg";
                      }}
                    />
                  ) : (
                    <div className="w-16 h-24 bg-secondary rounded-lg flex items-center justify-center">
                      <Trophy size={24} className="text-muted-foreground" />
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  {/* Winner Title */}
                  <div className="flex items-center gap-2 mb-1">
                    <Trophy size={14} className="text-accent flex-shrink-0" />
                    <p className="font-medium text-foreground truncate">
                      {item.winner_title || "No winner"}
                    </p>
                  </div>

                  {/* Session Code & Type */}
                  <div className="flex items-center gap-3 text-sm text-muted-foreground mb-2">
                    <span className="font-mono bg-secondary px-2 py-0.5 rounded">
                      {item.session_code}
                    </span>
                    {item.media_type && (
                      <span className="flex items-center gap-1">
                        {item.media_type === 'movies' ? (
                          <Film size={12} />
                        ) : item.media_type === 'shows' ? (
                          <Tv size={12} />
                        ) : (
                          <>
                            <Film size={12} />
                            <Tv size={12} />
                          </>
                        )}
                        {item.media_type}
                      </span>
                    )}
                    {item.was_timed && (
                      <span className="flex items-center gap-1 text-primary">
                        <Clock size={12} />
                        Timed
                      </span>
                    )}
                  </div>

                  {/* Participants */}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                    <Users size={14} />
                    <span className="truncate">
                      {item.participants.join(", ")}
                    </span>
                  </div>

                  {/* Date */}
                  <p className="text-xs text-muted-foreground">
                    {formatDate(item.completed_at)}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};