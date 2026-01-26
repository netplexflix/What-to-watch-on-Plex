import { User, Crown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Participant } from "@/types/session";

interface ParticipantsListProps {
  participants: Participant[];
  hostId?: string;
  showStatus?: boolean;
  className?: string;
}

export const ParticipantsList = ({ 
  participants, 
  hostId, 
  showStatus = false,
  className 
}: ParticipantsListProps) => {
  return (
    <div className={cn("space-y-2", className)}>
      {participants.map((participant) => (
        <div
          key={participant.id}
          className="flex items-center gap-3 p-3 glass-card rounded-lg animate-fade-in"
        >
          <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
            {participant.id === hostId ? (
              <Crown size={20} className="text-accent" />
            ) : (
              <User size={20} className="text-muted-foreground" />
            )}
          </div>
          <div className="flex-1">
            <p className="font-medium text-foreground">
              {participant.display_name}
              {participant.id === hostId && (
                <span className="ml-2 text-xs text-accent">(Host)</span>
              )}
            </p>
            <p className="text-sm text-muted-foreground">
              {participant.is_guest ? "Guest" : "Plex User"}
            </p>
          </div>
          {showStatus && participant.questions_completed && (
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
              <Check size={16} className="text-primary" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
