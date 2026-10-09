import { describe, expect, it, vi } from "vitest";
import { MemoryStore, type LiveStore } from "@/lib/blood-live/store";

const broken: LiveStore = {
  kind: "supabase",
  create: async () => {},
  commit: async () => true,
  load: async () => {
    throw new Error("session_load_failed");
  },
  events: async () => [],
};

vi.mock("@/lib/blood-live/store", async (orig) => {
  const real = await orig<typeof import("@/lib/blood-live/store")>();
  return { ...real, getStore: async (id?: string) => (id && real.memoryStore().has(id) ? real.memoryStore() : broken) };
});

describe("blood live: broken Supabase falls back to server memory", () => {
  it("creates the session in memory and later requests find it there", async () => {
    const { createSession, snapshot } = await import("@/lib/blood-live/service");
    const s = await createSession();
    const snap = await snapshot(s.sessionId, null);
    expect(snap.session.transport).toBe("local");
    expect(new MemoryStore()).toBeTruthy();
  });
});
