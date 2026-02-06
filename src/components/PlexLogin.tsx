import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Loader2, ExternalLink, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { plexApi } from "@/lib/api";

interface PlexUser {
  username: string;
  email: string;
  thumb: string;
}

interface PlexLoginProps {
  onLogin: (token: string, user: PlexUser) => void;
  onSkip: () => void;
}

export const PlexLogin = ({ onLogin, onSkip }: PlexLoginProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [pinId, setPinId] = useState<number | null>(null);
  const pollIntervalRef = useRef<number | null>(null);

  // returning from OAuth redirect on mount?
  useEffect(() => {
    const checkRedirectReturn = async () => {
      const storedPinId = sessionStorage.getItem('plexOAuthPinId');
      if (storedPinId) {
        sessionStorage.removeItem('plexOAuthPinId');
        setIsLoading(true);
        
        try {
          const { data: checkData, error: checkError } = await plexApi.checkOAuthPin(parseInt(storedPinId));
          
          if (checkError) {
            console.error("Error checking pin on return:", checkError);
            setIsLoading(false);
            return;
          }

          if (checkData?.authenticated && checkData.authToken && checkData.user) {
            onLogin(checkData.authToken, checkData.user);
          } else {
            // Not authenticated yet, start polling
            setPinId(parseInt(storedPinId));
            startPolling(parseInt(storedPinId));
          }
        } catch (err) {
          console.error("Error processing OAuth return:", err);
          setIsLoading(false);
        }
      }
    };

    checkRedirectReturn();

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  const startPolling = (pinIdToCheck: number) => {
    // Clear any existing interval
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    // poll for auth completion
    pollIntervalRef.current = window.setInterval(async () => {
      try {
        const { data: checkData, error: checkError } = await plexApi.checkOAuthPin(pinIdToCheck);

        if (checkError) {
          console.error("Error checking pin:", checkError);
          return;
        }

        if (checkData?.authenticated && checkData.authToken && checkData.user) {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
          }
          onLogin(checkData.authToken, checkData.user);
        }
      } catch (err) {
        console.error("Error checking pin:", err);
      }
    }, 2000);

    // Stop polling after 5 min
    setTimeout(() => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        setIsLoading(false);
        setAuthUrl(null);
        setPinId(null);
      }
    }, 300000);
  };

  const handlePlexLogin = async () => {
    setIsLoading(true);
    try {
      const redirectUri = window.location.origin + window.location.pathname;
      const { data, error } = await plexApi.createOAuthPin(redirectUri);

      if (error) throw new Error(error);
      if (!data) throw new Error("No data returned");

      setPinId(data.pinId);
      setAuthUrl(data.authUrl);

      // Try to open popup
      const popup = window.open(data.authUrl, "_blank", "width=600,height=700");

      // Check if popup was blocked
      setTimeout(() => {
        if (!popup || popup.closed || typeof popup.closed === 'undefined') {
          console.warn("Popup was blocked or closed, using redirect method");
          // Store pinId for when we return from redirect
          sessionStorage.setItem('plexOAuthPinId', data.pinId.toString());
          // Redirect to Plex auth
          window.location.href = data.authUrl;
        } else {
          // Popup opened successfully, start polling
          startPolling(data.pinId);
        }
      }, 100);

    } catch (err) {
      console.error("Error starting Plex login:", err);
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }
    setIsLoading(false);
    setAuthUrl(null);
    setPinId(null);
  };

  const handleOpenAgain = () => {
    if (!authUrl) return;
    
    const popup = window.open(authUrl, "_blank", "width=600,height=700");
    
    // offer redirect
    setTimeout(() => {
      if (!popup || popup.closed || typeof popup.closed === 'undefined') {
        // Store pinId and redirect
        if (pinId) {
          sessionStorage.setItem('plexOAuthPinId', pinId.toString());
          window.location.href = authUrl;
        }
      }
    }, 100);
  };

  if (authUrl) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-6"
      >
        <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto">
          <Loader2 className="animate-spin text-primary" size={32} />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-2">Complete Login in Browser</h3>
          <p className="text-muted-foreground text-sm">
            A new window should have opened. Complete the login there.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <Button variant="outline" onClick={handleOpenAgain} className="w-full">
            <ExternalLink size={18} className="mr-2" />
            Open Login Page Again
          </Button>
          <Button variant="ghost" onClick={handleCancel} className="w-full text-muted-foreground">
            Cancel
          </Button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-center space-y-6"
    >
      <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto">
        <User size={32} className="text-primary" />
      </div>
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-2">Sign in with Plex</h3>
        <p className="text-muted-foreground text-sm">
          Sign in to filter out content you've already watched
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <Button
          onClick={handlePlexLogin}
          disabled={isLoading}
          className="w-full bg-[#e5a00d] hover:bg-[#cc8f0c] text-black font-semibold"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 animate-spin" size={18} />
              Connecting...
            </>
          ) : (
            "Sign in with Plex"
          )}
        </Button>
        <Button variant="ghost" onClick={onSkip} className="w-full text-muted-foreground">
          Continue as Guest
        </Button>
      </div>
    </motion.div>
  );
};
