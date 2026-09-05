// file: src/test/useUnsavedChanges.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { UnsavedChangesProvider } from "@/components/admin/UnsavedChangesProvider";
import { UnsavedChangesBar } from "@/components/admin/UnsavedChangesBar";
import { useUnsavedChanges, useUnsavedChangesContext, type AdminTab } from "@/hooks/useUnsavedChanges";

// Stand-in for a settings section: it owns no UI and only reports its dirty state.
const Section = ({
  dirty,
  save = vi.fn(),
  discard = vi.fn(),
}: {
  dirty: boolean;
  save?: () => void | Promise<void>;
  discard?: () => void;
}) => {
  useUnsavedChanges({ id: "section", tab: "settings", isDirty: dirty, save, discard });
  return null;
};

const DirtyCount = ({ tab }: { tab: AdminTab }) => {
  const unsaved = useUnsavedChangesContext();
  return <span data-testid="dirty-count">{unsaved.dirtySections(tab).length}</span>;
};

describe("unsaved changes registry and bar", () => {
  it("shows the bar only while a section on the active tab is dirty", () => {
    const dirtyOnActiveTab = render(
      <UnsavedChangesProvider>
        <Section dirty />
        <UnsavedChangesBar activeTab="settings" />
      </UnsavedChangesProvider>
    );
    expect(screen.queryByRole("status")).not.toBeNull();
    dirtyOnActiveTab.unmount();

    // Fresh renders rather than toggling props: AnimatePresence keeps an exiting node in
    // the DOM until its exit animation resolves, which does not settle inside a sync test.
    const clean = render(
      <UnsavedChangesProvider>
        <Section dirty={false} />
        <UnsavedChangesBar activeTab="settings" />
      </UnsavedChangesProvider>
    );
    expect(screen.queryByRole("status")).toBeNull();
    clean.unmount();

    render(
      <UnsavedChangesProvider>
        <Section dirty />
        <UnsavedChangesBar activeTab="history" />
      </UnsavedChangesProvider>
    );
    expect(screen.queryByRole("status")).toBeNull();
  });

  // Regression guard: a section registers once and only re-registers when isDirty flips,
  // but its save handler closes over state that changes on every render. Save must run the
  // newest handler, not the one captured when the section was registered.
  it("saves through the handler from the latest render", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const ui = (save: () => void) => (
      <UnsavedChangesProvider>
        <Section dirty save={save} />
        <UnsavedChangesBar activeTab="settings" />
      </UnsavedChangesProvider>
    );

    const { rerender } = render(ui(first));
    rerender(ui(second));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });

    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it("discards through the section's own handler", () => {
    const discard = vi.fn();
    render(
      <UnsavedChangesProvider>
        <Section dirty discard={discard} />
        <UnsavedChangesBar activeTab="settings" />
      </UnsavedChangesProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Discard" }));

    expect(discard).toHaveBeenCalledTimes(1);
  });

  it("forgets a section once its component unmounts", () => {
    const { rerender } = render(
      <UnsavedChangesProvider>
        <Section dirty />
        <DirtyCount tab="settings" />
      </UnsavedChangesProvider>
    );
    expect(screen.getByTestId("dirty-count").textContent).toBe("1");

    rerender(
      <UnsavedChangesProvider>
        <DirtyCount tab="settings" />
      </UnsavedChangesProvider>
    );
    expect(screen.getByTestId("dirty-count").textContent).toBe("0");
  });
});
