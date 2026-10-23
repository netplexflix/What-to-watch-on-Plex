// file: src/test/wsSubscription.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Lobby from "@/pages/Lobby";
import Questions from "@/pages/Questions";
import Swipe from "@/pages/Swipe";

const mocks = vi.hoisted(() => ({
  status: "waiting",
  ws: {
    connect: vi.fn(() => Promise.resolve()),
    subscribe: vi.fn((_sessionId: string, _participantId?: string) => Promise.resolve()),
    unsubscribe: vi.fn(),
    on: vi.fn(() => () => {}),
  },
}));

vi.mock("@/lib/websocket", () => ({ wsClient: mocks.ws }));

vi.mock("@/lib/api", () => {
  const session = () => ({
    id: "s1",
    code: "ABC123",
    status: mocks.status,
    host_user_id: "p1",
    media_type: "both",
    created_at: "2026-10-23 12:00:00",
    preferences: {},
  });
  // Nobody has finished the questions: Questions shows the questionnaire, Swipe waits on it.
  const participants = [
    { id: "p1", display_name: "Host", is_guest: true, questions_completed: false, preferences: {} },
    { id: "p2", display_name: "Guest", is_guest: true, questions_completed: false, preferences: {} },
  ];
  return {
    sessionsApi: {
      getByCode: vi.fn(async () => ({ data: { session: session() } })),
      getById: vi.fn(async () => ({ data: { session: session() } })),
      getParticipants: vi.fn(async () => ({ data: { participants } })),
      getConfig: vi.fn(async () => ({ data: { value: null } })),
    },
    adminApi: { getSessionSettings: vi.fn(async () => ({ data: { settings: null } })) },
    plexApi: { getLanguages: vi.fn(async () => ({ data: { languages: [] } })) },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.setItem(
    "wtw_session",
    JSON.stringify({ sessionId: "s1", sessionCode: "ABC123", participantId: "p1", isHost: true })
  );
});

// Regression guard for a real failure: these pages read the local session with a fresh
// JSON.parse on every render and listed it as an effect dependency. Every re-render tore the
// init effect down, and its one cleanup - wsClient.unsubscribe() - fired on the first re-render,
// right after the page had subscribed. The server dropped the participant from the session, so
// Questions and Swipe never received a live event and only moved on through their backup polls.
describe.each([
  { name: "Lobby", route: "/lobby/:code", status: "waiting", Page: Lobby, ready: "Waiting Room" },
  { name: "Questions", route: "/questions/:code", status: "questions", Page: Questions, ready: /pick some genres/i },
  { name: "Swipe", route: "/swipe/:code", status: "swiping", Page: Swipe, ready: "Almost Ready!" },
])("$name page", ({ route, status, Page, ready }) => {
  it("stays subscribed to the session until the page is left", async () => {
    mocks.status = status;

    const { unmount } = render(
      <MemoryRouter initialEntries={[route.replace(":code", "ABC123")]}>
        <Routes>
          <Route path={route} element={<Page />} />
        </Routes>
      </MemoryRouter>
    );

    // Fully loaded - several re-renders have happened by now
    await screen.findByText(ready);
    await waitFor(() => expect(mocks.ws.subscribe).toHaveBeenCalledWith("s1", "p1"));
    expect(mocks.ws.unsubscribe).not.toHaveBeenCalled();

    unmount();
    expect(mocks.ws.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
