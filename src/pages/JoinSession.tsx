// File: src/pages/JoinSession.tsx
import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, User, LogIn, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/Logo";
import { plexApi, sessionsApi } from "@/lib/api";
import { saveLocalSession } from "@/lib/sessionStore";
import { toast } from "sonner";
import { useHaptics } from "@/hooks/useHaptics";

interface PlexUser {
  username: string;
  email: string;
  thumb: string;
}

const JoinSession = () => {
  const navigate = useNavigate();
  const { code } = useParams<{ code: string }>();
  const haptics = useHaptics();
  const [displayName, setDisplayName] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionExists, setSessionExists] = useState(false);
  const [joinAsGuest, setJoinAsGuest] = useState(true);
  
  // Plex OAuth state
  const [plexLoading, setPlexLoading] = useState(false);
  const [plexUser, setPlexUser] = useState<PlexUser | null>(null);
  const [plexToken, setPlexToken] = useState<string | null>(null);
  const pollIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (code) {
      checkSession();
    }
    
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [code]);

  const checkSession = async () => {
    try {
      const { data, error } = await sessionsApi.getByCode(code!);
      
      if (error || !data?.session) {
        toast.error("Session not found");
        navigate("/");
        return;
      }

      if (data.session.status !== "waiting") {
        toast.error("This session has already started");
        navigate("/");
        return;
      }

      setSessionExists(true);
    } catch (error) {
      console.error("Error checking session:", error);
      toast.error("Failed to find session");
      navigate("/");
    } finally {
      setIsLoading(false);
    }
  };

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

  const handleJoin = async () => {
    if (!displayName.trim()) {
      haptics.error();
      toast.error("Please enter your name");
      return;
    }

    haptics.medium();
    setIsJoining(true);
    try {
      // Get session first
      const { data: sessionData, error: sessionError } = await sessionsApi.getByCode(code!);
      
      if (sessionError || !sessionData?.session) {
        throw new Error("Session not found");
      }

      // Join the session
      const { data, error } = await sessionsApi.join(sessionData.session.id, {
        displayName: displayName.trim(),
        isGuest: joinAsGuest,
        plexToken: plexToken || undefined,
      });

      if (error) throw new Error(error);
      if (!data) throw new Error("No data returned");

      // Save to local storage
      saveLocalSession({
        sessionId: sessionData.session.id,
        sessionCode: sessionData.session.code,
        participantId: data.participant.id,
        isHost: false,
      });

      haptics.success();
      navigate(`/lobby/${code}`);
    } catch (error) {
      console.error("Error joining session:", error);
      haptics.error();
      toast.error("Failed to join session. Please try again.");
    } finally {
      setIsJoining(false);
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

  // Determine the visual state of the Plex button
  const isPlexSelected = !joinAsGuest || plexLoading;
  const isPlexAuthenticated = !joinAsGuest && plexUser !== null;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="animate-spin text-primary" size={48} />
      </div>
    );
  }

  if (!sessionExists) {
    return null;
  }

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
      <div className="flex-1 flex flex-col items-center justify-center px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <div className="flex justify-center mb-8">
            <Logo size="md" />
          </div>

          <h1 className="text-2xl font-bold text-foreground text-center mb-2">
            Join Session
          </h1>
          <p className="text-muted-foreground text-center mb-2">
            You're joining session
          </p>
          <p className="text-2xl font-mono font-bold text-primary text-center mb-8">
            {code?.toUpperCase()}
          </p>

          <div className="space-y-6">
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
                  className={`relative p-4 rounded-xl transition-all duration-200 ${
                    joinAsGuest && !plexLoading
                      ? "glass-card border-2 border-primary glow-primary"
                      : "glass-card border-2 border-transparent hover:border-muted-foreground/30"
                  }`}
                >
                  {joinAsGuest && !plexLoading && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                      <Check size={12} className="text-primary-foreground" />
                    </div>
                  )}
                  <User
                    className={`mx-auto mb-2 ${
                      joinAsGuest && !plexLoading ? "text-primary" : "text-muted-foreground"
                    }`}
                    size={24}
                  />
                  <p className="font-medium text-foreground">Guest</p>
                  <p className="text-xs text-muted-foreground">See all items</p>
                </button>
                <button
                  onClick={handlePlexSelect}
                  disabled={plexLoading}
                  className={`relative p-4 rounded-xl transition-all duration-200 ${
                    isPlexSelected
                      ? "glass-card border-2 border-primary glow-primary"
                      : "glass-card border-2 border-transparent hover:border-muted-foreground/30"
                  }`}
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
                      className={`mx-auto mb-2 ${
                        isPlexSelected ? "text-primary" : "text-muted-foreground"
                      }`}
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

            {/* Join button */}
            <Button
              onClick={handleJoin}
              disabled={!displayName.trim() || isJoining || plexLoading}
              className="w-full h-14 text-lg font-semibold bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {isJoining ? "Joining..." : "Join Session"}
            </Button>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default JoinSession;