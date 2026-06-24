// File: src/components/TrailerModal.tsx
import { useState, useRef, useEffect } from "react";
import { Loader2, VideoOff } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

interface TrailerModalProps {
  /** Plex Part key of the trailer to play (resolved by the card). */
  partKey: string;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Modal that streams a Plex trailer through the server proxy (/api/plex/trailer).
 */
export const TrailerModal = ({ partKey, title, open, onOpenChange }: TrailerModalProps) => {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const videoRef = useRef<HTMLVideoElement>(null);

  const src = `/api/plex/trailer?path=${encodeURIComponent(partKey)}`;

  // Reset to loading whenever the modal opens for a (possibly new) trailer.
  useEffect(() => {
    if (open) setStatus("loading");
  }, [open, partKey]);

  // Pause and release the video when the modal closes.
  useEffect(() => {
    if (!open && videoRef.current) {
      videoRef.current.pause();
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[95vw] p-0 overflow-hidden bg-black border-border">
        <DialogTitle className="sr-only">{title} — Trailer</DialogTitle>
        <div className="relative w-full aspect-video bg-black">
          {status === "loading" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
            </div>
          )}

          {status === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <VideoOff size={40} />
              <p className="text-sm">Trailer unavailable</p>
            </div>
          )}

          {status !== "error" && (
            <video
              ref={videoRef}
              src={src}
              controls
              autoPlay
              playsInline
              className="w-full h-full"
              onCanPlay={() => setStatus("ready")}
              onError={() => setStatus("error")}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
