// file: src/test/useHaptics.test.tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useEffect, useState } from "react";
import { useHaptics } from "@/hooks/useHaptics";

afterEach(() => {
  vi.useRealTimers();
});

describe("useHaptics", () => {
  it("returns the same object across re-renders", () => {
    const { result, rerender } = renderHook(() => useHaptics());
    const first = result.current;

    rerender();
    rerender();

    expect(result.current).toBe(first);
  });

  // Regression guard for a real failure: in a timed session the countdown re-rendered the
  // swipe page every second, and the "did the session move to voting?" poll lived in an
  // effect keyed on `haptics`. A fresh haptics object per render cleared and recreated the
  // 2s interval every 1s, so it never fired and a participant who had finished their deck
  // was stranded on "All Done!" until they reloaded.
  it("does not starve a longer interval owned by an effect that depends on it", () => {
    vi.useFakeTimers();
    const poll = vi.fn();

    const useSwipeLikeComponent = () => {
      const haptics = useHaptics();
      const [, setSecondsElapsed] = useState(0);

      // The countdown timer: re-renders once a second.
      useEffect(() => {
        const id = setInterval(() => setSecondsElapsed((s) => s + 1), 1000);
        return () => clearInterval(id);
      }, []);

      // The backup poll: must survive those re-renders to ever fire.
      useEffect(() => {
        const id = setInterval(poll, 2000);
        return () => clearInterval(id);
      }, [haptics]);
    };

    renderHook(() => useSwipeLikeComponent());

    // Advance a second at a time so React commits the countdown re-render between ticks,
    // the way it does in the browser. Advancing 5s in one step would let the poll fire
    // before any re-render happened, and the starvation would go unnoticed.
    for (let i = 0; i < 6; i++) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
    }

    expect(poll).toHaveBeenCalled();
  });
});
