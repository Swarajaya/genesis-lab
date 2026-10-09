"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createCoalescer } from "@/lib/blood-live/coalesce";
import { postJson } from "@/lib/client";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import type { FullSnapshot } from "@/lib/blood-live/service";
import type { LiveAction } from "@/lib/engines/blood/liveTypes";

export type Link = "connecting" | "live" | "reconnecting" | "ended";
export type ClientAction = LiveAction | { type: "end" };

interface ActResult {
  snapshot: FullSnapshot;
  participantToken?: string;
  participantId?: string;
}

/**
 * One live session: authoritative snapshot + realtime notifications.
 * Transport = Supabase Realtime Broadcast when configured, otherwise a local SSE stream (single server process).
 * Realtime messages carry no data, they only say "something changed"; the snapshot is always refetched from the server.
 */
export function useLiveSession(sessionId: string, token: string | null, opts: { leaveOnHide?: boolean } = {}) {
  const [snap, setSnap] = useState<FullSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<Link>("connecting");
  const [transport, setTransport] = useState<"supabase" | "local" | null>(null);
  /** Token the current snapshot was fetched with, so callers can tell "token unknown" from "token not sent yet". */
  const [snapToken, setSnapToken] = useState<string | null>(null);
  const coalescerRef = useRef<ReturnType<typeof createCoalescer> | null>(null);
  const seqRef = useRef(-1);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const apply = useCallback((s: FullSnapshot, usedToken: string | null) => {
    if (s.seq < seqRef.current) return; // stale response that lost a race
    seqRef.current = s.seq;
    setSnapToken(usedToken);
    setSnap(s);
    setError(null);
    // A successful authoritative fetch IS a working connection, whatever the realtime channel is doing.
    setLink(s.session.status !== "active" ? "ended" : "live");
  }, []);

  const fetchSnap = useCallback(async () => {
    try {
      const used = tokenRef.current;
      const res = await fetch(`/api/blood/live/${sessionId}`, { headers: used ? { "x-live-token": used } : {}, cache: "no-store" });
      const json = await res.json();
      // The token changed while this request was in flight (e.g. we just joined): this snapshot lacks our `me` view.
      if (tokenRef.current !== used) {
        coalescerRef.current?.trigger();
        return;
      }
      if (!res.ok || !json?.ok) {
        setError(json?.error?.message ?? "Could not load the session.");
        return;
      }
      apply(json.data as FullSnapshot, used);
    } catch {
      setError("Connection lost. Reconnecting…");
      setLink((l) => (l === "ended" ? l : "reconnecting"));
    }
  }, [sessionId, apply]);

  useEffect(() => {
    const co = createCoalescer(fetchSnap);
    coalescerRef.current = co;
    co.trigger();
    const onVisible = () => {
      if (document.visibilityState === "visible") co.trigger();
    };
    const onOnline = () => co.trigger();
    // Safety net: realtime can be blocked (corporate/venue Wi-Fi, serverless hosts, proxies). Polling always works.
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") co.trigger();
    }, 2500);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      coalescerRef.current = null;
    };
  }, [sessionId, fetchSnap]);

  // Transport follows what the SERVER actually uses: Supabase Realtime only when the session lives in Supabase,
  // otherwise the local stream. Chosen once the first snapshot reports it.
  const serverTransport = snap?.session.transport ?? null;
  useEffect(() => {
    const co = coalescerRef.current;
    if (!serverTransport || !co) return;
    let cleanup = () => {};
    const sb = serverTransport === "supabase" ? getBrowserSupabase() : null;
    if (sb) {
      setTransport("supabase");
      const channel = sb
        .channel(`blood-live:${sessionId}`, { config: { broadcast: { self: false } } })
        .on("broadcast", { event: "tick" }, () => co.trigger())
        .subscribe((status) => {
          if (status === "SUBSCRIBED") co.trigger(); // catch anything missed while (re)connecting
        });
      cleanup = () => void sb.removeChannel(channel);
    } else {
      setTransport("local");
      const es = new EventSource(`/api/blood/live/${sessionId}/stream`);
      es.onopen = () => co.trigger();
      es.addEventListener("tick", () => co.trigger());
      es.onerror = () => {}; // EventSource retries by itself; polling keeps the screen current meanwhile
      cleanup = () => es.close();
    }
    return cleanup;
  }, [sessionId, serverTransport]);

  // A token that arrives after mount (restored from storage) needs a fresh snapshot to get the caller's own `me` view.
  useEffect(() => {
    coalescerRef.current?.trigger();
  }, [token]);

  // Phones report when the screen goes away / comes back so the desktop can show DEVICE DISCONNECTED / CONNECTED.
  useEffect(() => {
    if (!opts.leaveOnHide || !token) return;
    const send = (type: "leave" | "rejoin") => {
      const body = JSON.stringify({ token, action: { type } });
      if (type === "leave" && navigator.sendBeacon) navigator.sendBeacon(`/api/blood/live/${sessionId}`, new Blob([body], { type: "text/plain" }));
      else void fetch(`/api/blood/live/${sessionId}`, { method: "POST", body, keepalive: true }).catch(() => {});
    };
    const onVis = () => send(document.visibilityState === "hidden" ? "leave" : "rejoin");
    const onHide = () => send("leave");
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onHide);
    };
  }, [opts.leaveOnHide, token, sessionId]);

  const act = useCallback(
    async (action: ClientAction, withToken: string | null = tokenRef.current): Promise<ActResult> => {
      const r = await postJson<ActResult>(`/api/blood/live/${sessionId}`, { token: withToken ?? undefined, action });
      // Adopt a freshly issued participant token immediately, before any in-flight refetch can overwrite `me`.
      if (r.participantToken) tokenRef.current = r.participantToken;
      apply(r.snapshot, r.participantToken ?? withToken);
      return r;
    },
    [sessionId, apply],
  );

  return { snap, snapToken, error, link, transport, act, refresh: () => coalescerRef.current?.trigger() };
}

export const storageGet = (k: string, local = false): string | null => {
  try {
    return (local ? localStorage : sessionStorage).getItem(k);
  } catch {
    return null;
  }
};
export const storageSet = (k: string, v: string, local = false) => {
  try {
    (local ? localStorage : sessionStorage).setItem(k, v);
  } catch {
    /* private mode: the page still works for this visit */
  }
};
