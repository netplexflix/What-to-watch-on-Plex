// file: src/hooks/useUnsavedChanges.ts
// Dirty-state registry behind the admin page's "You have unsaved changes" bar.
//
// Each settings section (the Settings tab's session settings and PWA names, the Connection
// tab's Plex config and allowed domains) keeps its state and its saved snapshot where they
// already live, and registers `{ isDirty, save, discard }` here. The Admin shell reads the
// registry to show the bar for the active tab, to guard tab switches and the back arrow,
// and to warn before the page unloads.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

export type AdminTab = "connection" | "settings" | "history" | "stats";

export interface UnsavedSection {
  id: string;
  /** The tab the section renders in; the bar only shows sections of the active tab. */
  tab: AdminTab;
  isDirty: boolean;
  /** The section's existing save handler. It must move the section's snapshot on success. */
  save: () => void | Promise<void>;
  /** Revert the section's state to its snapshot. */
  discard: () => void;
}

export interface UnsavedChangesRegistry {
  register: (section: UnsavedSection) => void;
  unregister: (id: string) => void;
  dirtySections: (tab: AdminTab) => UnsavedSection[];
  isAnyDirty: boolean;
  /** Save every dirty section on a tab, one after another. */
  saveTab: (tab: AdminTab) => Promise<void>;
  discardTab: (tab: AdminTab) => void;
}

export const UnsavedChangesContext = createContext<UnsavedChangesRegistry | null>(null);

/** Provider-side state. Rendered once, by UnsavedChangesProvider around the Admin page. */
export function useUnsavedChangesRegistry(): UnsavedChangesRegistry {
  const [sections, setSections] = useState<Record<string, UnsavedSection>>({});

  // Both must keep a stable identity: every registered section lists them as effect deps,
  // so a fresh function per render would re-register everything on every render.
  const register = useCallback((section: UnsavedSection) => {
    setSections((prev) => ({ ...prev, [section.id]: section }));
  }, []);
  const unregister = useCallback((id: string) => {
    setSections((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  return useMemo(() => {
    const all = Object.values(sections);
    const dirtySections = (tab: AdminTab) => all.filter((s) => s.tab === tab && s.isDirty);
    return {
      register,
      unregister,
      dirtySections,
      isAnyDirty: all.some((s) => s.isDirty),
      saveTab: async (tab: AdminTab) => {
        for (const section of dirtySections(tab)) {
          await section.save();
        }
      },
      discardTab: (tab: AdminTab) => {
        dirtySections(tab).forEach((section) => section.discard());
      },
    };
  }, [sections, register, unregister]);
}

export function useUnsavedChangesContext(): UnsavedChangesRegistry {
  const registry = useContext(UnsavedChangesContext);
  if (!registry) {
    throw new Error("useUnsavedChangesContext must be used inside an UnsavedChangesProvider");
  }
  return registry;
}

/** Register one dirty-trackable section for the lifetime of the calling component. */
export function useUnsavedChanges({ id, tab, isDirty, save, discard }: UnsavedSection): void {
  const { register, unregister } = useUnsavedChangesContext();

  // The handlers close over the section's current state, so they are new functions every
  // render. The registry holds stable wrappers that read the newest pair at call time;
  // otherwise the bar's Save would post whatever the state was when isDirty last flipped.
  const latest = useRef({ save, discard });
  useEffect(() => {
    latest.current = { save, discard };
  });

  // Deliberately not keyed on save/discard: re-registering every render would set provider
  // state, re-render this component with new closures, and loop forever.
  useEffect(() => {
    register({
      id,
      tab,
      isDirty,
      save: () => latest.current.save(),
      discard: () => latest.current.discard(),
    });
  }, [id, tab, isDirty, register]);

  useEffect(() => () => unregister(id), [id, unregister]);
}
