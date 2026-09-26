// file: src/components/admin/UnsavedChangesProvider.tsx
import type { ReactNode } from "react";
import { UnsavedChangesContext, useUnsavedChangesRegistry } from "@/hooks/useUnsavedChanges";

export const UnsavedChangesProvider = ({ children }: { children: ReactNode }) => {
  const registry = useUnsavedChangesRegistry();
  return <UnsavedChangesContext.Provider value={registry}>{children}</UnsavedChangesContext.Provider>;
};
