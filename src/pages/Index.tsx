//file: src/pages/Index.tsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, Users, Settings, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/Logo";
import { adminApi } from "@/lib/api";
import { cn } from "@/lib/utils";

const Index = () => {
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState("");
  const [showJoinInput, setShowJoinInput] = useState(false);
  const [customLogo, setCustomLogo] = useState<string | null>(null);
  const [logoLoading, setLogoLoading] = useState(true);

  useEffect(() => {
    loadCustomLogo();
  }, []);

  const loadCustomLogo = async () => {
    try {
      const { data, error } = await adminApi.getLogo();
      if (!error && data?.logo?.path) {
        // Add cache buster to ensure fresh load
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

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      {/* Background gradient */}
      <div className="fixed inset-0 bg-background">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
        <div className="absolute top-1/4 -left-1/4 w-1/2 h-1/2 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-1/4 w-1/2 h-1/2 bg-accent/10 rounded-full blur-3xl" />
      </div>

      {/* Admin button */}
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

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-md w-full"
        >
          {/* Custom Logo or Default Logo */}
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
                onError={(e) => {
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

          {/* Tagline */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-lg text-muted-foreground mb-12"
          >
            Swipe together. Watch together.
            <Sparkles className="inline ml-2 w-5 h-5 text-accent" />
          </motion.p>

          {/* Action buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="space-y-4"
          >
            <Button
              onClick={handleCreateSession}
              className="w-full h-14 text-lg font-semibold bg-primary hover:bg-primary/90 text-primary-foreground glow-primary"
            >
              <Plus className="mr-2" size={22} />
              Create Session
            </Button>

            {!showJoinInput ? (
              <Button
                onClick={() => setShowJoinInput(true)}
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
                    className="flex-1 h-12 bg-primary hover:bg-primary/90 text-primary-foreground"
                  >
                    Join
                  </Button>
                </div>
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      </div>

      {/* Footer */}
      <div className="relative z-10 py-4 text-center">
        <p className="text-xs text-muted-foreground">Powered by your Plex library</p>
      </div>
    </div>
  );
};

export default Index;