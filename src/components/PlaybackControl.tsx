// File: src/components/PlaybackControl.tsx
import { useState, useEffect } from "react";
import { ExternalLink, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { plexApi } from "@/lib/api";
import { toast } from "sonner";
import { useHaptics } from "@/hooks/useHaptics";
import { cn } from "@/lib/utils";

interface PlaybackControlProps {
  ratingKey: string;
  title: string;
  className?: string;
}

interface ServerInfo {
  machineIdentifier: string;
  friendlyName: string;
}

export const PlaybackControl = ({
  ratingKey,
  title,
  className,
}: PlaybackControlProps) => {
  const haptics = useHaptics();
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [copied, setCopied] = useState(false);

  // Fetch server info on mount (for deep links)
  useEffect(() => {
    const fetchServerInfo = async () => {
      try {
        const { data } = await plexApi.getServerInfo();
        if (data) {
          setServerInfo(data);
        }
      } catch (e) {
        console.error('[PlaybackControl] Error fetching server info:', e);
      }
    };
    fetchServerInfo();
  }, []);

  const getPlexWebUrl = (): string => {
    const machineId = serverInfo?.machineIdentifier;
    
    if (machineId) {
      // Direct link to the item on the specific server
      return `https://app.plex.tv/desktop#!/server/${machineId}/details?key=${encodeURIComponent(`/library/metadata/${ratingKey}`)}`;
    }
    // Fallback to search
    return `https://app.plex.tv/desktop#!/search?query=${encodeURIComponent(title)}`;
  };

  const openInPlexWeb = () => {
    haptics.medium();
    window.open(getPlexWebUrl(), '_blank');
    toast.success('Opened in Plex', {
      description: 'Use the cast button in Plex to play on your TV',
    });
  };

  const copyLink = async () => {
    haptics.selection();
    try {
      await navigator.clipboard.writeText(getPlexWebUrl());
      setCopied(true);
      toast.success('Link copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      toast.error('Failed to copy link');
    }
  };

  return (
    <div className={cn("flex gap-2", className)}>
      <Button
        onClick={openInPlexWeb}
        className="flex-1 h-12 text-base font-semibold bg-[#e5a00d] hover:bg-[#cc8f0c] text-black"
      >
        <ExternalLink size={18} className="mr-2" />
        Open in Plex
      </Button>
      
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="h-12 w-12 border-secondary"
          >
            {copied ? <Check size={18} /> : <Copy size={18} />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={copyLink}>
            <Copy size={16} className="mr-2" />
            Copy Plex Link
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};