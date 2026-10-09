"use client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/browser";

/**
 * Real authentication state for the Genesis Access page.
 * Email/password and Google both go through the same Supabase Auth client (lib/supabase/browser.ts), so every
 * user is a normal Supabase auth user. Nothing is simulated: the status is derived from real requests and sessions.
 */

export type AuthStatus = "ready" | "verifying" | "authenticated" | "failed";
export type AuthCore = "checking" | "online" | "unreachable" | "offline";
export type AuthMode = "signin" | "signup";
/** unknown = the project's settings could not be read, so the button is left usable and Supabase decides. */
export type GoogleState = "unknown" | "enabled" | "disabled";
type Stage = "form" | "verifying" | "authenticated";
type Kind = "signin" | "signup" | "google";

export interface AuthNotice {
  tone: "error" | "info";
  title: string;
  detail: string;
}

const LAB_PATH = "/lab";
const LEAVE_MS = 900; // "authenticated" -> lab hand-off, within the requested 500-1000ms
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

interface AuthSettings {
  external?: Record<string, boolean>;
  disable_signup?: boolean;
}

const TITLES: Record<Kind, string> = {
  signin: "AUTHENTICATION FAILED",
  signup: "ACCESS REQUEST FAILED",
  google: "GOOGLE SIGN-IN FAILED",
};

function describe(err: unknown, kind: Kind): AuthNotice {
  const e = (err ?? {}) as { message?: string; code?: string; status?: number; name?: string };
  const msg = (e.message ?? "").toLowerCase();
  const code = e.code ?? "";
  let detail = kind === "google" ? "Google sign-in could not be completed. Try again." : "The authentication service could not complete the request. Try again.";
  if (code === "invalid_credentials" || msg.includes("invalid login credentials")) detail = "Invalid login credentials.";
  else if (code === "email_not_confirmed" || msg.includes("email not confirmed")) detail = "This account's email is not confirmed yet. Confirmation is still required on the server.";
  else if (code === "user_already_exists" || code === "email_exists" || msg.includes("already registered")) detail = "Account already exists for this email. Authenticate instead.";
  else if (code === "weak_password" || msg.includes("password should")) detail = "Password does not meet the minimum requirements.";
  else if (code === "signup_disabled") detail = "New access requests are currently disabled.";
  else if (code === "provider_disabled" || msg.includes("provider is not enabled") || msg.includes("unsupported provider")) detail = "Google sign-in is not enabled for this project.";
  else if (code.includes("rate_limit") || e.status === 429) detail = "Too many attempts. Wait a moment and try again.";
  else if (e.name === "AuthRetryableFetchError" || msg.includes("failed to fetch") || e.status === 0) detail = "Network error. Cannot reach the authentication service.";
  return { tone: "error", title: TITLES[kind], detail };
}

export function useGenesisAuth(reducedMotion: boolean) {
  const router = useRouter();
  // NEXT_PUBLIC_* values are inlined at build time on server and client, so this is hydration-safe.
  const configured = useMemo(() => Boolean(SUPABASE_URL && SUPABASE_ANON), []);

  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [stage, setStage] = useState<Stage>("form");
  const [notice, setNotice] = useState<AuthNotice | null>(null);
  const [core, setCore] = useState<AuthCore>(configured ? "checking" : "offline");
  const [google, setGoogle] = useState<GoogleState>("unknown");
  const [canSignUp, setCanSignUp] = useState(false);
  const [existing, setExisting] = useState<{ email: string } | null>(null);

  const alive = useRef(true);
  const busy = useRef(false);
  const timer = useRef<number | null>(null);
  const reducedRef = useRef(reducedMotion);
  const routerRef = useRef(router);

  useEffect(() => {
    reducedRef.current = reducedMotion;
    routerRef.current = router;
  }, [reducedMotion, router]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    router.prefetch(LAB_PATH);
  }, [router]);

  // Returning with the browser back button after the Google redirect can restore a stale "verifying" page.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      busy.current = false;
      setStage((s) => (s === "verifying" ? "form" : s));
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  // What this Supabase project actually has enabled (public settings endpoint): Google, and whether sign-up is open.
  useEffect(() => {
    if (!configured) return;
    const ctrl = new AbortController();
    fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_ANON }, signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<AuthSettings>) : Promise.reject(new Error(String(r.status)))))
      .then((s) => {
        const ext = s.external ?? {};
        setGoogle(ext.google === true ? "enabled" : "disabled");
        setCanSignUp(ext.email === true && !s.disable_signup);
        setCore("online");
      })
      .catch((e: unknown) => {
        if ((e as { name?: string })?.name === "AbortError") return;
        setCore("unreachable");
      });
    return () => ctrl.abort();
  }, [configured]);

  const fail = useCallback((err: unknown, kind: Kind) => {
    if (!alive.current) return;
    setStage("form");
    setNotice(describe(err, kind));
  }, []);

  /** Confirms a real session exists, then plays the short hand-off into the lab. */
  const finish = useCallback(
    async (sb: SupabaseClient, kind: Kind) => {
      if (!alive.current) return;
      setStage("verifying");
      const { data, error } = await sb.auth.getSession();
      if (!alive.current) return;
      if (error || !data.session) {
        fail(error ?? { message: "no session" }, kind);
        return;
      }
      setStage("authenticated");
      timer.current = window.setTimeout(() => routerRef.current.replace(LAB_PATH), reducedRef.current ? 150 : LEAVE_MS);
    },
    [fail],
  );

  // On arrival: surface Google errors, continue after a Google return, or offer an existing session.
  useEffect(() => {
    if (!configured) return;
    const returning = /access_token=|refresh_token=|[?&]code=/.test(window.location.hash + window.location.search);
    let cancelled = false;
    const arrive = async () => {
      const sb = getBrowserSupabase();
      if (!sb) return;
      const { data } = await sb.auth.getSession(); // also lets supabase-js finish parsing a returning URL
      if (cancelled) return;

      const q = new URLSearchParams(window.location.search);
      const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const failed = q.get("error") || h.get("error") || q.get("error_description") || h.get("error_description");
      if (failed) {
        const why = (q.get("error_description") ?? h.get("error_description") ?? "").trim().slice(0, 160);
        window.history.replaceState(null, "", window.location.pathname);
        setNotice({ tone: "error", title: TITLES.google, detail: `Google sign-in was not completed.${why ? ` ${why}` : ""}` });
        return;
      }
      if (!data.session) return;
      if (returning) {
        await finish(sb, "google");
        return;
      }
      const { data: u, error } = await sb.auth.getUser(); // validate with the server before offering it
      if (cancelled) return;
      if (error || !u.user) {
        // Drop the stored session only when the server rejected it; a network error must not sign anyone out.
        const status = (error as { status?: number } | null)?.status;
        if (status === 401 || status === 403) await sb.auth.signOut({ scope: "local" });
        return;
      }
      setExisting({ email: u.user.email ?? "current account" });
    };
    void arrive().catch(() => {
      /* arrival checks are best-effort: on any failure the normal sign-in form stays available */
    });
    return () => {
      cancelled = true;
    };
  }, [configured, finish]);

  const emailValid = EMAIL_RE.test(email.trim());
  const locked = stage !== "form";
  const canSubmit = configured && !locked && emailValid && password.length > 0;

  const status: AuthStatus = stage === "authenticated" ? "authenticated" : stage === "verifying" ? "verifying" : notice?.tone === "error" ? "failed" : "ready";

  const edit = useCallback((set: (v: string) => void) => (v: string) => {
    set(v);
    setNotice((n) => (n?.tone === "error" ? null : n));
  }, []);

  const submit = useCallback(async () => {
    if (busy.current) return;
    const sb = getBrowserSupabase();
    const addr = email.trim();
    if (!sb || !EMAIL_RE.test(addr) || !password) return;
    busy.current = true;
    setNotice(null);
    setStage("verifying");
    try {
      if (mode === "signin") {
        const { data, error } = await sb.auth.signInWithPassword({ email: addr, password });
        if (error || !data.session) return fail(error, "signin");
        await finish(sb, "signin");
      } else {
        const { data, error } = await sb.auth.signUp({ email: addr, password, options: { emailRedirectTo: `${window.location.origin}/auth` } });
        if (error) return fail(error, "signup");
        if (data.session) {
          // Normal path once "Confirm email" is off in Supabase: sign-up returns a live session right away.
          await finish(sb, "signup");
        } else if (alive.current) {
          // The project still requires email confirmation. The frontend cannot (and must not) bypass that.
          setStage("form");
          setNotice({ tone: "info", title: "CONFIRMATION STILL REQUIRED", detail: "Account created, but the server still requires email confirmation before sign-in." });
        }
      }
    } catch (e) {
      fail(e, mode);
    } finally {
      busy.current = false;
    }
  }, [email, password, mode, finish, fail]);

  const signInWithGoogle = useCallback(async () => {
    if (busy.current) return;
    const sb = getBrowserSupabase();
    if (!sb) return;
    busy.current = true;
    setNotice(null);
    setStage("verifying");
    try {
      const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/auth` } });
      if (error) fail(error, "google"); // on success the browser is redirected to Google
    } catch (e) {
      fail(e, "google");
    } finally {
      busy.current = false;
    }
  }, [fail]);

  const continueSession = useCallback(async () => {
    if (busy.current) return;
    const sb = getBrowserSupabase();
    if (!sb) return;
    busy.current = true;
    try {
      await finish(sb, "signin");
    } finally {
      busy.current = false;
    }
  }, [finish]);

  const switchAccount = useCallback(async () => {
    const sb = getBrowserSupabase();
    if (sb) await sb.auth.signOut({ scope: "local" });
    if (alive.current) setExisting(null);
  }, []);

  return {
    configured,
    core,
    google,
    canSignUp,
    existing,
    mode,
    setMode: (m: AuthMode) => {
      setMode(m);
      setNotice(null);
    },
    email,
    password,
    setEmail: edit(setEmail),
    setPassword: edit(setPassword),
    notice,
    stage,
    status,
    locked,
    canSubmit,
    submit,
    signInWithGoogle,
    continueSession,
    switchAccount,
  };
}
