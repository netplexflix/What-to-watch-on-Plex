/**
 * Haptic feedback hook for vibration-enabled devices
 */
export const useHaptics = () => {
  const isSupported = typeof navigator !== "undefined" && "vibrate" in navigator;

  const light = () => {
    if (isSupported) {
      navigator.vibrate(10);
    }
  };

  const medium = () => {
    if (isSupported) {
      navigator.vibrate(25);
    }
  };

  const heavy = () => {
    if (isSupported) {
      navigator.vibrate(50);
    }
  };

  const success = () => {
    if (isSupported) {
      navigator.vibrate([25, 50, 25]);
    }
  };

  const error = () => {
    if (isSupported) {
      navigator.vibrate([50, 50, 50]);
    }
  };

  const selection = () => {
    if (isSupported) {
      navigator.vibrate(5);
    }
  };

  return {
    isSupported,
    light,
    medium,
    heavy,
    success,
    error,
    selection,
  };
};
