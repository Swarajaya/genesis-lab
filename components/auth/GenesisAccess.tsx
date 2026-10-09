"use client";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type FormEvent } from "react";
import { Logo } from "@/components/ui/SiteHeader";
import { useGenesisAuth, type AuthCore, type AuthStatus } from "./useGenesisAuth";
import s from "./GenesisAccess.module.css";

function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Deterministic data-particle layout (same on server and client, so no hydration mismatch). */
const DUST = (() => {
  let seed = 11;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  return Array.from({ length: 16 }, () => ({ x: 4 + rand() * 92, t: 16 + rand() * 18, d: -rand() * 30 }));
})();

const STATUS_TEXT: Record<AuthStatus, string> = { ready: "READY", verifying: "VERIFYING", authenticated: "AUTHENTICATED", failed: "FAILED" };
const STATUS_TONE: Record<AuthStatus, string> = { ready: "signal", verifying: "warn", authenticated: "ok", failed: "bad" };
const SERVICE_TEXT: Record<AuthCore, string> = { checking: "CONNECTING TO AUTH SERVICE", online: "AUTH SERVICE ONLINE", unreachable: "AUTH SERVICE UNREACHABLE", offline: "AUTH NOT CONFIGURED" };
const SERVICE_TONE: Record<AuthCore, string> = { checking: "warn", online: "signal", unreachable: "bad", offline: "warn" };

/** Google "G" mark, unmodified brand colours. */
function GoogleMark() {
  return (
    <svg className={s.googleMark} viewBox="0 0 48 48" aria-hidden focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export default function GenesisAccess() {
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const a = useGenesisAuth(reduced);
  const [show, setShow] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  // Focus the first field on larger screens only, so phones don't pop the keyboard on arrival.
  useEffect(() => {
    if (window.matchMedia("(min-width: 641px)").matches) emailRef.current?.focus({ preventScroll: true });
  }, []);

  const leaving = a.stage === "authenticated";
  const signup = a.mode === "signup";
  const statusText = a.configured ? STATUS_TEXT[a.status] : "OFFLINE";
  const statusTone = a.configured ? STATUS_TONE[a.status] : "warn";
  const googleBlocked = a.google === "disabled";
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void a.submit();
  };
  const submitLabel = a.stage === "verifying" ? "VERIFYING" : signup ? "CREATE ACCESS" : "AUTHENTICATE";

  return (
    <main id="main" className={s.stage} data-leaving={leaving}>
      {/* environment: glass planes, haze, rulers, scan line, data particles. Decorative only. */}
      <div className={s.scene} aria-hidden>
        <span className={`${s.haze} ${s.hazeA}`} />
        <span className={`${s.haze} ${s.hazeB}`} />
        <div className={s.dust}>
          {DUST.map((p, i) => (
            <i key={i} style={{ left: `${p.x}%`, "--t": `${p.t}s`, "--d": `${p.d}s` } as CSSProperties} />
          ))}
        </div>
        <span className={`${s.plane} ${s.frost} ${s.p1}`} />
        <span className={`${s.plane} ${s.p2}`} />
        <span className={`${s.plane} ${s.p3}`} />
        <span className={`${s.plane} ${s.p4}`} />
        <span className={`${s.plane} ${s.frost} ${s.p5}`} />
        <span className={`${s.plane} ${s.p6}`} />
        <span className={`${s.ruler} ${s.rulerTop}`} />
        <span className={`${s.ruler} ${s.rulerBottom}`} />
        <span className={`${s.cross} ${s.c1}`} />
        <span className={`${s.cross} ${s.c2}`} />
        <span className={`${s.cross} ${s.c3}`} />
        <span className={`${s.cross} ${s.c4}`} />
        <span className={s.vtext}>GENESIS ACCESS // IDENTITY GATE</span>
        <span className={s.lines} />
        <span className={s.sweep} />
        <span className={s.vignette} />
      </div>

      <header className={`${s.chrome} absolute inset-x-0 top-0 z-20 flex items-center justify-between px-5 py-5 sm:px-8`}>
        <Link href="/" className="flex items-center gap-2.5" aria-label="Genesis Lab home">
          <Logo size={24} />
          <span className="text-sm font-medium tracking-[0.24em]">GENESIS LAB</span>
        </Link>
        <Link href="/" className="rounded-full px-3 py-1.5 text-xs text-dim transition hover:text-text">
          ← Back
        </Link>
      </header>

      <div className={s.layout}>
        <section className={`${s.intro} ${s.chrome}`} aria-labelledby="ga-title">
          <p className={s.eyebrow}>{"// IDENTITY GATE"}</p>
          <h1 id="ga-title" className={s.title}>
            <span>GENESIS</span>
            <span className={s.titleAccent}>ACCESS</span>
          </h1>
          <p className={s.lede}>Enter the laboratory.</p>
          <p className={s.service}>
            <span className={s.dot} data-tone={SERVICE_TONE[a.core]} aria-hidden />
            {SERVICE_TEXT[a.core]}
          </p>
        </section>

        <div className={s.panelWrap}>
          <span className={s.beamHaze} aria-hidden />
          <span className={s.beam} aria-hidden />
          <section className={s.panel} aria-label="Authentication">
            <span className={s.accent} aria-hidden />
            <div className={s.panelBody}>
              <div className={s.panelHead}>
                <h2 className={s.panelTitle}>AUTHENTICATION</h2>
                <p className={s.status} data-tone={statusTone} role="status" aria-live="polite">
                  <span className={s.dot} data-tone={statusTone} aria-hidden />
                  {statusText}
                </p>
              </div>

              {leaving ? (
                <div className={s.success} role="status">
                  <p className={s.successLine}>
                    <span className={s.dot} data-tone="ok" aria-hidden />
                    AUTHENTICATED
                  </p>
                  <p className={s.successLine}>SESSION ESTABLISHED</p>
                  <p className={s.successLine}>ENTERING GENESIS LAB</p>
                  <span className={s.progress} aria-hidden />
                </div>
              ) : !a.configured ? (
                <div className="mt-6" role="alert">
                  <div className={s.notice} data-tone="error">
                    <span className={s.noticeTitle}>AUTH NOT CONFIGURED</span>
                    <span className={s.noticeDetail}>Authentication is not configured on this deployment. Set the Supabase environment variables to enable access.</span>
                  </div>
                </div>
              ) : a.existing ? (
                <div className="mt-6 space-y-4">
                  <div>
                    <span className={s.fieldLabel}>SESSION ACTIVE</span>
                    <p className="truncate text-sm text-text">{a.existing.email}</p>
                  </div>
                  <button type="button" className={s.submit} data-busy={a.locked ? "true" : undefined} disabled={a.locked} onClick={() => void a.continueSession()}>
                    {a.locked ? "VERIFYING" : "CONTINUE TO THE LAB"}
                    {!a.locked && <ArrowRight className="h-4 w-4" aria-hidden />}
                  </button>
                  <div className="text-center">
                    <button type="button" className={s.linkBtn} disabled={a.locked} onClick={() => void a.switchAccount()}>
                      Use another account
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <form onSubmit={onSubmit} noValidate className="mt-5 space-y-4">
                    <div>
                      <label htmlFor="ga-email" className={s.fieldLabel}>
                        EMAIL
                      </label>
                      <input
                        ref={emailRef}
                        id="ga-email"
                        name="email"
                        type="email"
                        className={s.input}
                        autoComplete="email"
                        inputMode="email"
                        autoCapitalize="none"
                        spellCheck={false}
                        placeholder="researcher@lab.org"
                        value={a.email}
                        onChange={(e) => a.setEmail(e.target.value)}
                        readOnly={a.locked}
                        aria-describedby={a.notice ? "ga-notice" : undefined}
                      />
                    </div>
                    <div>
                      <label htmlFor="ga-password" className={s.fieldLabel}>
                        PASSWORD
                      </label>
                      <div className="relative">
                        <input
                          id="ga-password"
                          name="password"
                          type={show ? "text" : "password"}
                          className={`${s.input} ${s.inputWithEye}`}
                          autoComplete={signup ? "new-password" : "current-password"}
                          placeholder="••••••••"
                          value={a.password}
                          onChange={(e) => a.setPassword(e.target.value)}
                          readOnly={a.locked}
                          aria-describedby={a.notice ? "ga-notice" : undefined}
                        />
                        <button type="button" className={s.eye} onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}>
                          {show ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                        </button>
                      </div>
                    </div>

                    {a.notice && (
                      <div id="ga-notice" role={a.notice.tone === "error" ? "alert" : "status"} className={s.notice} data-tone={a.notice.tone}>
                        <span className={s.noticeTitle}>{a.notice.title}</span>
                        <span className={s.noticeDetail}>{a.notice.detail}</span>
                      </div>
                    )}

                    <button type="submit" className={s.submit} data-busy={a.locked ? "true" : undefined} disabled={!a.canSubmit}>
                      {submitLabel}
                      {!a.locked && <ArrowRight className="h-4 w-4" aria-hidden />}
                    </button>
                  </form>

                  <div className="mt-5">
                    <div className={s.divider}>OR</div>
                    <span className={`${s.dividerLabel} mt-3`}>CONTINUE WITH</span>
                    <button type="button" className={s.google} disabled={a.locked || googleBlocked} onClick={() => void a.signInWithGoogle()}>
                      <GoogleMark />
                      Continue with Google
                    </button>
                    {googleBlocked && <p className={s.hint}>Google sign-in is not enabled for this project yet.</p>}
                  </div>

                  {a.canSignUp && (
                    <div className="mt-5 text-center">
                      <button type="button" className={s.linkBtn} disabled={a.locked} onClick={() => a.setMode(signup ? "signin" : "signup")}>
                        {signup ? "Already have access? Authenticate →" : "Create access →"}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>
        </div>
      </div>

      <div className={s.veil} aria-hidden />
    </main>
  );
}
