//file: src/pages/Index.tsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, Users, Settings, Sparkles, LogIn, LogOut, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/Logo";
import { adminApi, plexApi } from "@/lib/api";
import { clearUserIdentity, saveUserIdentity } from "@/lib/userStore";
import { useAccessGate } from "@/hooks/useAccessGate";
import { usePlexOAuth } from "@/hooks/usePlexOAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const Index = () => {
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState("");
  const [showJoinInput, setShowJoinInput] = useState(false);
  const [customLogo, setCustomLogo] = useState<string | null>(null);
  const [logoLoading, setLogoLoading] = useState(true);

  const { gated, verifying, hasAccess, refresh: refreshGate } = useAccessGate();
  const [accessError, setAccessError] = useState<string | null>(null);
  const [verifyingAccess, setVerifyingAccess] = useState(false);

  const {
    isLoading: plexLoading,
    isWaitingForAuth,
    initiateLogin: startPlexLogin,
    cancel: cancelPlexLogin,
    openAuthAgain,
  } = usePlexOAuth({
    onSuccess: async (token, user) => {
      // Save identity first so refreshGate() can pick up the token.
      saveUserIdentity({
        type: "plex",
        displayName: user.username || "",
        plexToken: token,
        plexUser: user,
      });

      setVerifyingAccess(true);
      try {
        const { data } = await plexApi.verifyAccess(token);
        if (data?.hasAccess) {
          setAccessError(null);
          toast.success(`Signed in as ${user.username}!`);
          await refreshGate();
        } else {
          clearUserIdentity();
          setAccessError(
            "This Plex account does not have access to the host's Plex server."
          );
        }
      } catch (err) {
        clearUserIdentity();
        setAccessError("Could not verify Plex access. Please try again.");
      } finally {
        setVerifyingAccess(false);
      }
    },
    onError: (error) => {
      toast.error(error);
    },
  });

  useEffect(() => {
    loadCustomLogo();
  }, []);

  const loadCustomLogo = async () => {
    try {
      const { data, error } = await adminApi.getLogo();
      if (!error && data?.logo?.path) {
        setCustomLogo(`${data.logo.path}?t=${Date.now()}`);
      }
    } catch (err) {
      console.error("Error loading custom logo:", err);
    } finally {
      setLogoLoading(false);
    }
  };

  const handleCreateSession = () => {
    navigate("/create");
  };

  const handleJoinSession = () => {
    if (joinCode.length === 6) {
      navigate(`/join/${joinCode.toUpperCase()}`);
    }
  };

  const handleSignOut = () => {
    clearUserIdentity();
    setAccessError(null);
    refreshGate();
  };

  const showWall = gated && !hasAccess;

  const adminGear = (
    <div className="absolute top-4 right-4 z-20">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => navigate("/admin")}
        className="text-muted-foreground hover:text-foreground"
      >
        <Settings size={20} />
      </Button>
    </div>
  );

  const logoBlock = (
    <motion.div
      initial={{ scale: 0.9 }}
      animate={{ scale: 1 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className="flex justify-center mb-6 min-h-[80px]"
    >
      {!logoLoading && customLogo ? (
        <img
          src={customLogo}
          alt="Logo"
          className="max-h-20 max-w-[280px] w-auto object-contain"
          onError={() => {
            console.error("Failed to load custom logo, falling back to default");
            setCustomLogo(null);
          }}
        />
      ) : !logoLoading ? (
        <Logo size="lg" />
      ) : (
        <div className="h-20 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </motion.div>
  );

  // Plex OAuth in-flight popup screen — reuse the same UX as CreateSession.
  if (isWaitingForAuth) {
    return (
      <div className="min-h-screen flex flex-col relative overflow-hidden">
        <div className="fixed inset-0 bg-background">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
        </div>
        {adminGear}
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
              <Button variant="outline" onClick={openAuthAgain} className="w-full">
                Open Login Page Again
              </Button>
              <Button
                variant="ghost"
                onClick={cancelPlexLogin}
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
        <div className="absolute top-1/4 -left-1/4 w-1/2 h-1/2 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-1/4 w-1/2 h-1/2 bg-accent/10 rounded-full blur-3xl" />
      </div>

      {adminGear}

      <div className="flex-1 flex flex-col items-center justify-center px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-md w-full"
        >
          {logoBlock}

          {showWall ? (
            <>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-base text-muted-foreground mb-8"
              >
                Sign in with Plex to continue.
                <br />
                <span className="text-xs">
                  Access is limited to users of the host's Plex server.
                </span>
              </motion.p>

              {accessError && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-4 p-3 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-sm flex items-start gap-2 text-left"
                >
                  <ShieldAlert size={18} className="mt-0.5 shrink-0" />
                  <span>{accessError}</span>
                </motion.div>
              )}

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="space-y-3"
              >
                <Button
                  onClick={() => {
                    setAccessError(null);
                    startPlexLogin();
                  }}
                  disabled={plexLoading || verifying || verifyingAccess}
                  className="w-full h-14 text-lg font-semibold bg-primary hover:bg-primary/90 text-primary-foreground glow-primary"
                >
                  {plexLoading || verifyingAccess ? (
                    <Loader2 className="mr-2 animate-spin" size={22} />
                  ) : (
                    <LogIn className="mr-2" size={22} />
                  )}
                  {verifyingAccess ? "Verifying…" : "Sign in with Plex"}
                </Button>

                {accessError && (
                  <Button
                    onClick={handleSignOut}
                    variant="outline"
                    className="w-full h-12 border-secondary"
                  >
                    <LogOut className="mr-2" size={18} />
                    Use a different Plex account
                  </Button>
                )}
              </motion.div>
            </>
          ) : (
            <>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-lg text-muted-foreground mb-12"
              >
                Swipe together. Watch together.
                <Sparkles className="inline ml-2 w-5 h-5 text-accent" />
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="space-y-4"
              >
                <Button
                  onClick={handleCreateSession}
                  disabled={verifying}
                  className="w-full h-14 text-lg font-semibold bg-primary hover:bg-primary/90 text-primary-foreground glow-primary"
                >
                  <Plus className="mr-2" size={22} />
                  Create Session
                </Button>

                {!showJoinInput ? (
                  <Button
                    onClick={() => setShowJoinInput(true)}
                    disabled={verifying}
                    variant="outline"
                    className="w-full h-14 text-lg font-semibold border-secondary bg-secondary/50 text-foreground hover:bg-secondary"
                  >
                    <Users className="mr-2" size={22} />
                    Join Session
                  </Button>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="space-y-3"
                  >
                    <Input
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
                      placeholder="Enter 6-digit code"
                      className="h-14 text-center text-xl font-mono tracking-widest bg-secondary border-secondary text-foreground placeholder:text-muted-foreground"
                      maxLength={6}
                    />
                    <div className="flex gap-3">
                      <Button
                        onClick={() => setShowJoinInput(false)}
                        variant="outline"
                        className="flex-1 h-12 border-secondary text-muted-foreground hover:bg-secondary"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleJoinSession}
                        disabled={joinCode.length !== 6}
                        className={cn(
                          "flex-1 h-12 bg-primary hover:bg-primary/90 text-primary-foreground"
                        )}
                      >
                        Join
                      </Button>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            </>
          )}
        </motion.div>
      </div>

      <div className="relative z-10 py-4 text-center">
        <p className="text-xs text-muted-foreground">Powered by your Plex library</p>
      </div>
    </div>
  );
};

export default Index;
