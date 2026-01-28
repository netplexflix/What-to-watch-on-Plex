// File: src/pages/CreateSession.tsx
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, User, LogIn, Check, Loader2, Clock, Minus, Plus, Infinity, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/Logo";
import { MediaTypeSelector } from "@/components/MediaTypeSelector";
import { plexApi, sessionsApi } from "@/lib/api";
import { saveLocalSession } from "@/lib/sessionStore";
import { toast } from "sonner";
import { useHaptics } from "@/hooks/useHaptics";
import { cn } from "@/lib/utils";

interface PlexUser {
  username: string;
  email: string;
  thumb: string;
}

const CreateSession = () => {
  const navigate = useNavigate();
  const haptics = useHaptics();
  const [displayName, setDisplayName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [joinAsGuest, setJoinAsGuest] = useState(true);
  const [mediaType, setMediaType] = useState<"movies" | "shows" | "both">("both");
  const [sessionMode, setSessionMode] = useState<"classic" | "timed">("classic");
  const [timedMinutes, setTimedMinutes] = useState(5);
  
  // Plex OAuth state
  const [plexLoading, setPlexLoading] = useState(false);
  const [plexUser, setPlexUser] = useState<PlexUser | null>(null);
  const [plexToken, setPlexToken] = useState<string | null>(null);
  const pollIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  const handlePlexLogin = async () => {
    setPlexLoading(true);
    try {
      const redirectUri = window.location.origin + window.location.pathname;
      const { data, error } = await plexApi.createOAuthPin(redirectUri);

      if (error) throw new Error(error);
      if (!data) throw new Error("No data returned");

      // Open Plex auth in new window
      const authWindow = window.open(data.authUrl, "_blank", "width=600,height=700");

      // Start polling for auth completion
      pollIntervalRef.current = window.setInterval(async () => {
        try {
          const { data: checkData, error: checkError } = await plexApi.checkOAuthPin(data.pinId);

          if (checkError) {
            console.error("Error checking pin:", checkError);
            return;
          }

          if (checkData?.authenticated && checkData.authToken && checkData.user) {
            // Clear polling
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            
            // Update state
            setPlexUser(checkData.user);
            setPlexToken(checkData.authToken);
            setDisplayName(checkData.user.username || "");
            setJoinAsGuest(false);
            setPlexLoading(false);
            
            // Close auth window if still open
            if (authWindow && !authWindow.closed) {
              authWindow.close();
            }
            
            toast.success(`Signed in as ${checkData.user.username}!`);
          }
        } catch (err) {
          console.error("Error checking pin:", err);
        }
      }, 2000);

      // Stop polling after 5 minutes
      setTimeout(() => {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
          setPlexLoading(false);
          // Reset to guest if auth didn't complete
          if (!plexUser) {
            setJoinAsGuest(true);
          }
        }
      }, 300000);

    } catch (err) {
      console.error("Error starting Plex login:", err);
      toast.error("Failed to start Plex login");
      setPlexLoading(false);
      setJoinAsGuest(true);
    }
  };

  const handleCreate = async () => {
    if (!displayName.trim()) {
      haptics.error();
      toast.error("Please enter your name");
      return;
    }

    haptics.medium();
    setIsCreating(true);
    try {
      const createData: {
        mediaType: string;
        displayName: string;
        isGuest: boolean;
        plexToken?: string;
        timedDuration?: number;
      } = {
        mediaType,
        displayName: displayName.trim(),
        isGuest: joinAsGuest,
      };

      // Only add plexToken if it exists
      if (plexToken) {
        createData.plexToken = plexToken;
      }

      // Only add timedDuration if timed session mode is selected
      if (sessionMode === "timed") {
        createData.timedDuration = timedMinutes;
      }

      const { data, error } = await sessionsApi.create(createData);

      if (error) throw new Error(error);
      if (!data) throw new Error("No data returned");

      // Save to local storage
      saveLocalSession({
        sessionId: data.session.id,
        sessionCode: data.session.code,
        participantId: data.participant.id,
        isHost: true,
      });

      haptics.success();
      navigate(`/lobby/${data.session.code}`);
    } catch (error) {
      console.error("Error creating session:", error);
      haptics.error();
      toast.error("Failed to create session. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleGuestSelect = () => {
    haptics.selection();
    setJoinAsGuest(true);
    setPlexUser(null);
    setPlexToken(null);
    // Clear any ongoing polling
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setPlexLoading(false);
  };

  const handlePlexSelect = () => {
    haptics.selection();
    // Only start OAuth if not already authenticated
    if (!plexUser && !plexLoading) {
      handlePlexLogin();
    } else if (plexUser) {
      // Already authenticated, just select it
      setJoinAsGuest(false);
    }
  };

  const handleSessionModeChange = (mode: "classic" | "timed") => {
    haptics.selection();
    setSessionMode(mode);
  };

  const handleMinutesChange = (delta: number) => {
    haptics.selection();
    setTimedMinutes(prev => Math.max(1, Math.min(60, prev + delta)));
  };

  // Determine the visual state of the Plex button
  const isPlexSelected = !joinAsGuest || plexLoading;
  const isPlexAuthenticated = !joinAsGuest && plexUser !== null;

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      {/* Background */}
      <div className="fixed inset-0 bg-background">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
      </div>

      {/* Header */}
      <div className="relative z-10 p-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/")}
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={24} />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center px-6 relative z-10 pb-8 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <div className="flex justify-center mb-6">
            <Logo size="md" />
          </div>

          <h1 className="text-2xl font-bold text-foreground text-center mb-2">
            Create a Session
          </h1>
          <p className="text-muted-foreground text-center mb-6">
            Start a watch party and invite your friends
          </p>

          <div className="space-y-5">
            {/* Name input */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Your Display Name
              </label>
              <div className="relative">
                <User
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  size={20}
                />
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Enter your name"
                  className="h-12 pl-10 bg-secondary border-secondary text-foreground placeholder:text-muted-foreground"
                />
              </div>
            </div>

            {/* Join type selection */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-foreground">
                How do you want to join?
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleGuestSelect}
                  className={cn(
                    "relative p-4 rounded-xl transition-all duration-200",
                    joinAsGuest && !plexLoading
                      ? "glass-card border-2 border-primary glow-primary"
                      : "glass-card border-2 border-transparent hover:border-muted-foreground/30"
                  )}
                >
                  {joinAsGuest && !plexLoading && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                      <Check size={12} className="text-primary-foreground" />
                    </div>
                  )}
                  <User
                    className={cn(
                      "mx-auto mb-2",
                      joinAsGuest && !plexLoading ? "text-primary" : "text-muted-foreground"
                    )}
                    size={24}
                  />
                  <p className="font-medium text-foreground">Guest</p>
                  <p className="text-xs text-muted-foreground">See all items</p>
                </button>
                <button
                  onClick={handlePlexSelect}
                  disabled={plexLoading}
                  className={cn(
                    "relative p-4 rounded-xl transition-all duration-200",
                    isPlexSelected
                      ? "glass-card border-2 border-primary glow-primary"
                      : "glass-card border-2 border-transparent hover:border-muted-foreground/30"
                  )}
                >
                  {isPlexAuthenticated && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                      <Check size={12} className="text-primary-foreground" />
                    </div>
                  )}
                  {plexLoading ? (
                    <Loader2 className="mx-auto mb-2 animate-spin text-primary" size={24} />
                  ) : (
                    <LogIn
                      className={cn(
                        "mx-auto mb-2",
                        isPlexSelected ? "text-primary" : "text-muted-foreground"
                      )}
                      size={24}
                    />
                  )}
                  <p className="font-medium text-foreground">
                    {plexUser ? plexUser.username : "Plex Login"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {plexLoading ? "Waiting for login..." : plexUser ? "Signed in ✓" : "Filter watched"}
                  </p>
                </button>
              </div>
            </div>

            {/* Media type selection */}
            <MediaTypeSelector value={mediaType} onChange={setMediaType} />

            {/* Session Mode Selection - Classic vs Timed */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-foreground">
                Session Mode
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleSessionModeChange("classic")}
                  className={cn(
                    "relative p-4 rounded-xl transition-all duration-200",
                    sessionMode === "classic"
                      ? "glass-card border-2 border-primary glow-primary"
                      : "glass-card border-2 border-transparent hover:border-muted-foreground/30"
                  )}
                >
                  {sessionMode === "classic" && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                      <Check size={12} className="text-primary-foreground" />
                    </div>
                  )}
                  <Infinity
                    className={cn(
                      "mx-auto mb-2",
                      sessionMode === "classic" ? "text-primary" : "text-muted-foreground"
                    )}
                    size={24}
                  />
                  <p className="font-medium text-foreground">Classic</p>
                  <p className="text-xs text-muted-foreground text-center">Swipe until you find a match</p>
                </button>
                <button
                  onClick={() => handleSessionModeChange("timed")}
                  className={cn(
                    "relative p-4 rounded-xl transition-all duration-200",
                    sessionMode === "timed"
                      ? "glass-card border-2 border-primary glow-primary"
                      : "glass-card border-2 border-transparent hover:border-muted-foreground/30"
                  )}
                >
                  {sessionMode === "timed" && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                      <Check size={12} className="text-primary-foreground" />
                    </div>
                  )}
                  <Timer
                    className={cn(
                      "mx-auto mb-2",
                      sessionMode === "timed" ? "text-primary" : "text-muted-foreground"
                    )}
                    size={24}
                  />
                  <p className="font-medium text-foreground">Timed</p>
                  <p className="text-xs text-muted-foreground text-center">Collect all matches and vote</p>
                </button>
              </div>
            </div>

            {/* Duration selector - only show when timed mode is selected */}
            {sessionMode === "timed" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="glass-card rounded-xl p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock size={18} className="text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Duration</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => handleMinutesChange(-1)}
                      disabled={timedMinutes <= 1}
                      className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center transition-all",
                        timedMinutes <= 1
                          ? "bg-secondary text-muted-foreground cursor-not-allowed"
                          : "bg-secondary hover:bg-secondary/80 text-foreground active:scale-95"
                      )}
                    >
                      <Minus size={20} />
                    </button>
                    <div className="w-20 text-center">
                      <span className="text-2xl font-bold text-foreground">{timedMinutes}</span>
                      <span className="text-sm text-muted-foreground ml-1">min</span>
                    </div>
                    <button
                      onClick={() => handleMinutesChange(1)}
                      disabled={timedMinutes >= 60}
                      className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center transition-all",
                        timedMinutes >= 60
                          ? "bg-secondary text-muted-foreground cursor-not-allowed"
                          : "bg-secondary hover:bg-secondary/80 text-foreground active:scale-95"
                      )}
                    >
                      <Plus size={20} />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Create button */}
            <Button
              onClick={handleCreate}
              disabled={!displayName.trim() || isCreating || plexLoading}
              className="w-full h-14 text-lg font-semibold bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 animate-spin" size={20} />
                  Creating...
                </>
              ) : (
                "Create Session"
              )}
            </Button>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default CreateSession;