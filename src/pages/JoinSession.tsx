// File: src/pages/JoinSession.tsx
import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, User, LogIn, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/Logo";
import { sessionsApi } from "@/lib/api";
import { saveLocalSession } from "@/lib/sessionStore";
import { toast } from "sonner";
import { useHaptics } from "@/hooks/useHaptics";
import { usePlexOAuth } from "@/hooks/usePlexOAuth";
import { cn } from "@/lib/utils";

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

  const [plexUser, setPlexUser] = useState<PlexUser | null>(null);
  const [plexToken, setPlexToken] = useState<string | null>(null);

  const {
    isLoading: plexLoading,
    isWaitingForAuth,
    initiateLogin: startPlexLogin,
    cancel: cancelPlexLogin,
    openAuthAgain,
  } = usePlexOAuth({
    onSuccess: (token, user) => {
      setPlexUser(user);
      setPlexToken(token);
      setDisplayName(user.username || "");
      setJoinAsGuest(false);
      toast.success(`Signed in as ${user.username}!`);
    },
    onError: (error) => {
      toast.error(error);
      setJoinAsGuest(true);
    },
  });

  useEffect(() => {
    if (code) {
      checkSession();
    }
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

  const handleJoin = async () => {
    if (!displayName.trim()) {
      haptics.error();
      toast.error("Please enter your name");
      return;
    }

    haptics.medium();
    setIsJoining(true);
    try {
      const { data: sessionData, error: sessionError } =
        await sessionsApi.getByCode(code!);

      if (sessionError || !sessionData?.session) {
        throw new Error("Session not found");
      }

      const { data, error } = await sessionsApi.join(sessionData.session.id, {
        displayName: displayName.trim(),
        isGuest: joinAsGuest,
        plexToken: plexToken || undefined,
      });

      if (error) throw new Error(error);
      if (!data) throw new Error("No data returned");

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
    cancelPlexLogin();
  };

  const handlePlexSelect = () => {
    haptics.selection();
    if (!plexUser && !plexLoading) {
      startPlexLogin();
    } else if (plexUser) {
      setJoinAsGuest(false);
    }
  };

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

  if (isWaitingForAuth) {
    return (
      <div className="min-h-screen flex flex-col relative overflow-hidden">
        <div className="fixed inset-0 bg-background">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
        </div>

        <div className="relative z-10 p-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              cancelPlexLogin();
              setJoinAsGuest(true);
            }}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={24} />
          </Button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-6 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-md text-center space-y-6"
          >
            <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto">
              <Loader2 className="animate-spin text-primary" size={32} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Complete Login in Browser
              </h3>
              <p className="text-muted-foreground text-sm">
                A new window should have opened. Complete the login there.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <Button
                variant="outline"
                onClick={openAuthAgain}
                className="w-full"
              >
                Open Login Page Again
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  cancelPlexLogin();
                  setJoinAsGuest(true);
                }}
                className="w-full text-muted-foreground"
              >
                Cancel
              </Button>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      <div className="fixed inset-0 bg-background">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
      </div>

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
                      joinAsGuest && !plexLoading
                        ? "text-primary"
                        : "text-muted-foreground"
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
                    <Loader2
                      className="mx-auto mb-2 animate-spin text-primary"
                      size={24}
                    />
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
                    {plexLoading
                      ? "Connecting..."
                      : plexUser
                        ? "Signed in ✓"
                        : "Filter watched"}
                  </p>
                </button>
              </div>
            </div>

            <Button
              onClick={handleJoin}
              disabled={!displayName.trim() || isJoining || plexLoading}
              className="w-full h-14 text-lg font-semibold bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {isJoining ? (
                <>
                  <Loader2 className="mr-2 animate-spin" size={20} />
                  Joining...
                </>
              ) : (
                "Join Session"
              )}
            </Button>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default JoinSession;