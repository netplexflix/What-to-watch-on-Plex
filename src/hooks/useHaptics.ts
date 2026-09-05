/**
 * Haptic feedback hook for vibration-enabled devices
 */
import { useMemo } from "react";

export const useHaptics = () => {
  // Memoized so the returned object keeps a stable identity. Callers put `haptics` in
  // effect dependency arrays; a fresh object per render would tear down and recreate
  // those effects every render, which silently kills any interval longer than the
  // render cadence (e.g. the 2s poll in Swipe.tsx against the 1s countdown timer).
  return useMemo(() => {
    const isSupported = typeof navigator !== "undefined" && "vibrate" in navigator;

    const vibrate = (pattern: number | number[]) => {
      if (isSupported) {
        navigator.vibrate(pattern);
      }
    };

    return {
      isSupported,
      light: () => vibrate(10),
      medium: () => vibrate(25),
      heavy: () => vibrate(50),
      success: () => vibrate([25, 50, 25]),
      error: () => vibrate([50, 50, 50]),
      selection: () => vibrate(5),
    };
  }, []);
};
