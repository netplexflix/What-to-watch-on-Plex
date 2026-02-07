// File: src/hooks/usePlexOAuth.ts
import { useState, useRef, useEffect, useCallback } from "react";
import { plexApi } from "@/lib/api";
import { isIOS } from "@/lib/utils";

interface PlexUser {
  username: string;
  email: string;
  thumb: string;
}

interface UsePlexOAuthOptions {
  onSuccess: (token: string, user: PlexUser) => void;
  onError?: (error: string) => void;
}

export const usePlexOAuth = ({ onSuccess, onError }: UsePlexOAuthOptions) => {
  const [isLoading, setIsLoading] = useState(false);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [pinId, setPinId] = useState<number | null>(null);
  const pollIntervalRef = useRef<number | null>(null);
  const popupRef = useRef<Window | null>(null);
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
    onErrorRef.current = onError;
  }, [onSuccess, onError]);

  const cleanup = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.close();
      popupRef.current = null;
    }
  }, []);

  const startPolling = useCallback(
    (pinIdToCheck: number) => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }

      pollIntervalRef.current = window.setInterval(async () => {
        try {
          const { data, error } = await plexApi.checkOAuthPin(pinIdToCheck);

          if (error) {
            console.error("Error checking pin:", error);
            return;
          }

          if (data?.authenticated && data.authToken && data.user) {
            cleanup();
            setIsLoading(false);
            setAuthUrl(null);
            setPinId(null);
            onSuccessRef.current(data.authToken, data.user);
          }
        } catch (err) {
          console.error("Error checking pin:", err);
        }
      }, 2000);

      // Stop polling after 5 minutes
      setTimeout(() => {
        if (pollIntervalRef.current) {
          cleanup();
          setIsLoading(false);
          setAuthUrl(null);
          setPinId(null);
        }
      }, 300000);
    },
    [cleanup]
  );

  // Check for redirect return on mount
  useEffect(() => {
    const checkRedirectReturn = async () => {
      const storedPinId = sessionStorage.getItem("plexOAuthPinId");
      if (storedPinId) {
        sessionStorage.removeItem("plexOAuthPinId");
        setIsLoading(true);

        try {
          const { data, error } = await plexApi.checkOAuthPin(
            parseInt(storedPinId)
          );

          if (error) {
            console.error("Error checking pin on return:", error);
            setIsLoading(false);
            onErrorRef.current?.("Failed to complete authentication");
            return;
          }

          if (data?.authenticated && data.authToken && data.user) {
            setIsLoading(false);
            onSuccessRef.current(data.authToken, data.user);
          } else {
            // Not authenticated yet, start polling
            setPinId(parseInt(storedPinId));
            startPolling(parseInt(storedPinId));
          }
        } catch (err) {
          console.error("Error processing OAuth return:", err);
          setIsLoading(false);
          onErrorRef.current?.("Failed to process authentication");
        }
      }
    };

    checkRedirectReturn();

    return () => {
      cleanup();
    };
  }, [cleanup, startPolling]);

  const initiateLogin = useCallback(async () => {
    setIsLoading(true);

    try {
      const redirectUri = window.location.origin + window.location.pathname;
      const { data, error } = await plexApi.createOAuthPin(redirectUri);

      if (error) throw new Error(error);
      if (!data) throw new Error("No data returned");

      setPinId(data.pinId);
      setAuthUrl(data.authUrl);

      // On iOS, always use redirect flow
      if (isIOS()) {
        sessionStorage.setItem("plexOAuthPinId", data.pinId.toString());
        await new Promise((resolve) => setTimeout(resolve, 50));
        window.location.href = data.authUrl;
        return;
      }

      // On other platforms, try popup first
      const popup = window.open(
        data.authUrl,
        "plexAuth",
        "width=600,height=700,scrollbars=yes,resizable=yes"
      );

      popupRef.current = popup;

      if (popup && !popup.closed) {
        startPolling(data.pinId);
      } else {
        // Popup was blocked, fall back to redirect
        console.warn("Popup blocked, using redirect flow");
        sessionStorage.setItem("plexOAuthPinId", data.pinId.toString());
        window.location.href = data.authUrl;
      }
    } catch (err) {
      console.error("Error starting Plex login:", err);
      setIsLoading(false);
      setAuthUrl(null);
      setPinId(null);
      onErrorRef.current?.("Failed to start Plex login");
    }
  }, [startPolling]);

  const cancel = useCallback(() => {
    cleanup();
    setIsLoading(false);
    setAuthUrl(null);
    setPinId(null);
  }, [cleanup]);

  const openAuthAgain = useCallback(() => {
    if (!authUrl || !pinId) return;

    if (isIOS()) {
      sessionStorage.setItem("plexOAuthPinId", pinId.toString());
      window.location.href = authUrl;
      return;
    }

    const popup = window.open(
      authUrl,
      "plexAuth",
      "width=600,height=700,scrollbars=yes,resizable=yes"
    );

    if (!popup || popup.closed) {
      sessionStorage.setItem("plexOAuthPinId", pinId.toString());
      window.location.href = authUrl;
    } else {
      popupRef.current = popup;
    }
  }, [authUrl, pinId]);

  return {
    isLoading,
    authUrl,
    pinId,
    initiateLogin,
    cancel,
    openAuthAgain,
    isWaitingForAuth: !!authUrl && !isIOS(),
  };
};