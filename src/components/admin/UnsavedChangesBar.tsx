// file: src/components/admin/UnsavedChangesBar.tsx
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUnsavedChangesContext, type AdminTab } from "@/hooks/useUnsavedChanges";

interface UnsavedChangesBarProps {
  activeTab: AdminTab;
}

// Sticky strip shown while the active admin tab has edits that differ from what was last
// loaded or saved. Save runs each dirty section's own save handler; Discard reverts them.
export const UnsavedChangesBar = ({ activeTab }: UnsavedChangesBarProps) => {
  const unsaved = useUnsavedChangesContext();
  const [isSaving, setIsSaving] = useState(false);
  const visible = unsaved.dirtySections(activeTab).length > 0;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await unsaved.saveTab(activeTab);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {visible && (
        // The outer layer is opaque so scrolled content never shows through the amber tint
        // once the bar is pinned to the top of the viewport.
        <motion.div
          key="unsaved-changes-bar"
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.15 }}
          className="sticky top-0 z-40 bg-background"
        >
          <div className="flex items-center justify-between gap-3 px-4 py-2 sm:px-6 bg-accent/10 border-b border-accent/30 text-sm text-foreground">
            <span className="flex min-w-0 items-center gap-2">
              <AlertTriangle size={16} className="shrink-0 text-accent" />
              <span className="truncate">
                <span className="hidden min-[400px]:inline">You have unsaved changes</span>
                <span className="min-[400px]:hidden">Unsaved changes</span>
              </span>
            </span>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" className="h-8" onClick={handleSave} disabled={isSaving}>
                {isSaving ? <Loader2 className="animate-spin" size={14} /> : "Save"}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="h-8"
                onClick={() => unsaved.discardTab(activeTab)}
                disabled={isSaving}
              >
                Discard
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
