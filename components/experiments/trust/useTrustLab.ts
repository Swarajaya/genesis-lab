"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UiError } from "@/components/ui/ErrorState";
import { ClientError, postJson, toUiError } from "@/lib/client";
import { alterClaim, breakSignature, invalidBundle, mutatePolicy, tamperBundle, type AttackId, ATTACKS } from "@/lib/engines/trust/attacks";
import type { HeldCredential } from "@/lib/engines/trust/credentials";
import { CRED_IDS, CREDS, DEFAULT_POLICY, VERIFIERS, compilePolicy, dayNumber, lifecycleOf, minimumDisclosure, todayIso, totalAttributeCount, zkClaimOf, type CredId, type Lifecycle, type PolicyNode, type RegistryStatus } from "@/lib/engines/trust/model";
import { sealPayload, type Sealed } from "@/lib/engines/trust/pq";
import { buildProof, ProveError } from "@/lib/engines/trust/prover";
import { canonicalBytes, type ChallengeInfo, type ProofBundle, type SecurityMode } from "@/lib/engines/trust/proof";
import type { VerifyReport } from "@/lib/engines/trust/verifier";

export interface EventItem {
  id: number;
  t: number;
  tone: "ok" | "info" | "warn" | "bad";
  text: string;
}
/** 0 idle · 1 private data locked · 2 commitment · 3 proving · 4 challenge / response · 5 result */
export type Phase = 0 | 1 | 2 | 3 | 4 | 5;

export interface Challenge {
  info: ChallengeInfo;
  token: string;
  kemPublicHex: string | null;
}
export interface Current {
  challenge: Challenge;
  bundle: ProofBundle;
  bytes: number;
  proveMs: number;
  /** number of secret openings (blinding factors) or private text values found in the transmitted payload */
  leaks: number;
  report: VerifyReport | null;
  verifyMs?: number;
  verifications: number;
}
export interface AttackRun {
  id: AttackId;
  report: VerifyReport;
  ms: number;
  note?: string;
}
export interface PqBench {
  rows: { operation: string; classical: { algorithm: string; ms: number; bytes: number; label: string }; postQuantum: { algorithm: string; ms: number; bytes: number; label: string } }[];
  runs: number;
  measuredOn: string;
}
export interface Explanation {
  summary: string;
  points: string[];
}
interface Config {
  issuers: { cred: CredId; name: string; classicalPublic: string; pqPublicBytes: number }[];
  proofTtlMs: number;
  persistence: boolean;
  ai: boolean;
}

const paint = () => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function defaultDraft(): Record<CredId, Record<string, number>> {
  const today = dayNumber(todayIso());
  return {
    ID: { dob: dayNumber("2001-04-12"), country: 1, expiry: today + 1400 },
    UNI: { student: 1, degree: 2, gpa: 352, expiry: today + 700 },
    CERT: { level: 2, expiry: today + 400 },
    CLR: { level: 3, expiry: today + 300 },
  };
}

export function useTrustLab() {
  const [config, setConfig] = useState<Config | null>(null);
  const [draft, setDraft] = useState(defaultDraft);
  const [text, setText] = useState({ fullName: "Asha Verma", universityName: "Northfield University" });
  const [vault, setVault] = useState<Partial<Record<CredId, HeldCredential>>>({});
  const [statuses, setStatuses] = useState<Record<string, RegistryStatus | null>>({});
  const [verifierId, setVerifierId] = useState("lab");
  const [policy, setPolicy] = useState<PolicyNode>(VERIFIERS[1].policy ?? DEFAULT_POLICY);
  const [mode, setMode] = useState<SecurityMode>("classical");
  const [current, setCurrent] = useState<Current | null>(null);
  const [phase, setPhase] = useState<Phase>(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<UiError | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [attack, setAttack] = useState<AttackRun | null>(null);
  const [attackHistory, setAttackHistory] = useState<AttackRun[]>([]);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [bench, setBench] = useState<PqBench | null>(null);
  const [explain, setExplain] = useState<{ key: string; explanation: Explanation | null; note: string | null } | null>(null);
  const [parseNote, setParseNote] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const seq = useRef(0);
  const vaultRef = useRef(vault);
  vaultRef.current = vault;
  const policyRef = useRef(policy);
  policyRef.current = policy;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const currentRef = useRef(current);
  currentRef.current = current;
  const verifierRef = useRef(verifierId);
  verifierRef.current = verifierId;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const log = useCallback((tone: EventItem["tone"], message: string) => {
    setEvents((e) => [{ id: ++seq.current, t: Date.now(), tone, text: message }, ...e].slice(0, 80));
  }, []);

  const guard = useCallback(
    async (label: string, fn: () => Promise<void>) => {
      setBusy(label);
      setError(null);
      try {
        await fn();
      } catch (e) {
        const ui = e instanceof ClientError ? e.ui : toUiError(e);
        setError(ui);
        log("bad", `${label} failed: ${ui.message}`);
      } finally {
        setBusy(null);
      }
    },
    [log],
  );

  useEffect(() => {
    postJson<Config>("/api/trust", { action: "config" })
      .then(setConfig)
      .catch(() => undefined);
  }, []);

  const today = dayNumber(todayIso(now));
  const compiled = useMemo(() => compilePolicy(policy, today), [policy, today]);

  // ------------------------------------------------------------------ vault
  const refreshStatuses = useCallback(
    async (v: Partial<Record<CredId, HeldCredential>> = vaultRef.current) => {
      const handles = CRED_IDS.map((c) => v[c]?.handle).filter((h): h is string => !!h);
      if (!handles.length) return;
      const r = await postJson<{ statuses: Record<string, RegistryStatus | null> }>("/api/trust", { action: "registry", op: "status", handles });
      setStatuses(r.statuses);
    },
    [],
  );

  const issueAll = useCallback(
    () =>
      guard("Credential issuance", async () => {
        const next: Partial<Record<CredId, HeldCredential>> = {};
        for (const c of CRED_IDS) {
          const r = await postJson<{ credential: HeldCredential; issuer: string }>("/api/trust", { action: "issue", cred: c, values: draft[c] });
          next[c] = r.credential;
          log("ok", `Credential issued: ${CREDS[c].label} (${r.issuer})`);
        }
        setVault(next);
        setCurrent(null);
        setAttack(null);
        setPhase(0);
        await refreshStatuses(next);
      }),
    [draft, guard, log, refreshStatuses],
  );

  const setStatus = useCallback(
    (cred: CredId, status: RegistryStatus) =>
      guard("Registry update", async () => {
        const h = vaultRef.current[cred]?.handle;
        if (!h) return;
        await postJson("/api/trust", { action: "registry", op: "set", handle: h, status });
        log(status === "active" ? "ok" : "warn", `Credential ${status === "active" ? "reinstated" : status}: ${CREDS[cred].label}`);
        await refreshStatuses();
      }),
    [guard, log, refreshStatuses],
  );

  const lifecycle = useCallback(
    (c: CredId): Lifecycle | null => {
      const h = vault[c];
      if (!h) return null;
      const st = statuses[h.handle] ?? "active";
      return lifecycleOf(h.attrs.expiry.v, today, st, dayNumber(todayIso(h.issuedAt)));
    },
    [vault, statuses, today],
  );

  // ------------------------------------------------------------------ proof flow
  const secretsIn = useCallback((json: string): number => {
    let n = 0;
    for (const c of CRED_IDS) {
      const h = vaultRef.current[c];
      if (!h) continue;
      for (const a of Object.values(h.attrs)) if (json.includes(a.r)) n++;
    }
    for (const s of [text.fullName, text.universityName]) if (s && json.includes(s)) n++;
    return n;
  }, [text]);

  const fetchChallenge = useCallback(async (p: PolicyNode, m: SecurityMode, vid: string): Promise<Challenge> => {
    const r = await postJson<{ info: ChallengeInfo; token: string; kemPublicHex: string | null }>("/api/trust", { action: "challenge", verifierId: vid, policy: p, mode: m });
    return { info: r.info, token: r.token, kemPublicHex: r.kemPublicHex };
  }, []);

  const submit = useCallback(async (ch: Challenge, bundle: unknown): Promise<{ report: VerifyReport; ms: number }> => {
    const t0 = performance.now();
    let sealed: Sealed | undefined;
    const body: Record<string, unknown> = { action: "verify", challengeToken: ch.token };
    if (ch.info.mode === "hybrid-pq" && ch.kemPublicHex) {
      sealed = await sealPayload(JSON.stringify(bundle), ch.kemPublicHex, ch.info.nonce);
      body.sealed = sealed;
    } else body.bundle = bundle;
    const r = await postJson<{ report: VerifyReport }>("/api/trust", body);
    return { report: r.report, ms: Math.round(performance.now() - t0) };
  }, []);

  const generate = useCallback(
    () =>
      guard("Proof generation", async () => {
        const v = vaultRef.current;
        if (!compiled.ok) throw new ClientError({ code: "invalid_policy", message: compiled.errors[0]?.message ?? "The policy is invalid." });
        setAttack(null);
        setExplain(null);
        setPhase(1);
        log("info", "Private credentials locked inside the holder boundary");
        await paint();
        const ch = await fetchChallenge(policyRef.current, modeRef.current, verifierRef.current);
        log("info", `Policy compiled: ${compiled.claims.length} claim${compiled.claims.length === 1 ? "" : "s"} · challenge ${ch.info.nonce.slice(0, 8)}…`);
        setPhase(2);
        await paint();
        setPhase(3);
        await paint();
        const t0 = performance.now();
        let bundle: ProofBundle;
        try {
          bundle = buildProof(v, ch.info);
        } catch (e) {
          setPhase(0);
          if (e instanceof ProveError) {
            log("warn", `Holder cannot prove: ${e.message}`);
            throw new ClientError({ code: e.code, message: e.message });
          }
          throw e;
        }
        const proveMs = Math.round(performance.now() - t0);
        const json = JSON.stringify(bundle);
        setCurrent({ challenge: ch, bundle, bytes: canonicalBytes(bundle), proveMs, leaks: secretsIn(json), report: null, verifications: 0 });
        log("ok", `Proof generated (${Object.keys(bundle.claims).length} claims, ${Math.round(canonicalBytes(bundle) / 1024)} KB, ${proveMs} ms)`);
        setPhase(3);
      }),
    [compiled, fetchChallenge, guard, log, secretsIn],
  );

  const verify = useCallback(
    () =>
      guard("Verification", async () => {
        const cur = currentRef.current;
        if (!cur) throw new ClientError({ code: "no_proof", message: "Generate a proof first." });
        setPhase(4);
        await paint();
        const { report, ms } = await submit(cur.challenge, cur.bundle);
        const first = cur.verifications === 0;
        setCurrent({ ...cur, report, verifyMs: ms, verifications: cur.verifications + 1 });
        setPhase(5);
        if (report.trust === "VERIFIED") log("ok", "Verification passed: policy satisfied");
        else if (report.replay) {
          log("warn", "Replay attempt detected");
          log("bad", "Replay rejected");
        } else log("bad", `Verification failed at ${report.failed.join(", ")}`);
        void first;
        await refreshStatuses();
      }),
    [guard, log, refreshStatuses, submit],
  );

  const proveAndVerify = useCallback(async () => {
    await generate();
    if (currentRef.current) await verify();
  }, [generate, verify]);

  // ------------------------------------------------------------------ attacks
  const record = useCallback(
    (id: AttackId, report: VerifyReport, ms: number, note?: string) => {
      const run = { id, report, ms, note };
      setAttack(run);
      setAttackHistory((h) => [run, ...h].slice(0, 12));
      setExplain(null);
      const def = ATTACKS.find((a) => a.id === id);
      log(report.trust === "REJECTED" ? "bad" : "warn", `Attack "${def?.label}": ${report.trust === "REJECTED" ? `rejected at ${report.failed.join(", ")}` : "accepted (attack had no effect on this policy)"}`);
    },
    [log],
  );

  const runAttack = useCallback(
    (id: AttackId) =>
      guard(`Attack: ${ATTACKS.find((a) => a.id === id)?.label}`, async () => {
        const v = vaultRef.current;
        const p = policyRef.current;
        const m = modeRef.current;
        const vid = verifierRef.current;
        if (!compiled.ok) throw new ClientError({ code: "invalid_policy", message: "Fix the policy before testing attacks." });
        if (id === "replay") {
          const cur = currentRef.current;
          if (!cur) throw new ClientError({ code: "no_proof", message: "Generate and verify a proof first, then replay it." });
          if (cur.verifications === 0) {
            await verify();
            log("info", "Proof submitted once; now replaying the identical proof");
          }
          const c2 = currentRef.current as Current;
          const r = await submit(c2.challenge, c2.bundle);
          record(id, r.report, r.ms);
          return;
        }
        if (id === "invalid") {
          const ch = await fetchChallenge(p, m, vid);
          const r = await submit(ch, invalidBundle());
          record(id, r.report, r.ms);
          return;
        }
        if (id === "policy") {
          const ch1 = await fetchChallenge(p, m, vid);
          const old = buildProof(v, ch1.info);
          const changed = mutatePolicy(p);
          const ch2 = await fetchChallenge(changed, m, vid);
          const r = await submit(ch2, old);
          record(id, r.report, r.ms, "Proof built for policy A was presented to a verifier now enforcing policy B (A AND an extra condition).");
          return;
        }
        if (id === "revoke") {
          const target = compiled.claims.find((c) => c.prim.kind === "active" || c.prim.kind === "notRevoked")?.prim.cred ?? compiled.claims[0]?.prim.cred;
          if (!target) throw new ClientError({ code: "no_target", message: "This policy presents no credential." });
          await setStatusDirect(target, "revoked");
          const ch = await fetchChallenge(p, m, vid);
          const b = buildProof(v, ch.info);
          const r = await submit(ch, b);
          record(id, r.report, r.ms, `${CREDS[target].label} is now revoked in the registry. Use the issuer console to reinstate it.`);
          return;
        }
        if (id === "expire") {
          const ch = await fetchChallenge(p, m, vid);
          const b = buildProof(v, ch.info);
          const wait = Math.max(0, ch.info.exp - Date.now()) + 400;
          log("info", `Holding a valid proof for ${Math.ceil(wait / 1000)}s until it expires`);
          const end = Date.now() + wait;
          while (Date.now() < end) {
            setCountdown(Math.ceil((end - Date.now()) / 1000));
            await sleep(250);
          }
          setCountdown(null);
          const r = await submit(ch, b);
          record(id, r.report, r.ms);
          return;
        }
        const ch = await fetchChallenge(p, m, vid);
        if (id === "nonce") {
          const b = buildProof(v, { ...ch.info, nonce: "f".repeat(32) });
          const r = await submit(ch, b);
          record(id, r.report, r.ms);
          return;
        }
        if (id === "modify") {
          const z = compiled.claims.map((c) => zkClaimOf(c.prim, ch.info.asOfDay)).find((x) => x && x.attr !== "expiry") ?? compiled.claims.map((c) => zkClaimOf(c.prim, ch.info.asOfDay)).find(Boolean);
          if (!z) throw new ClientError({ code: "no_target", message: "This policy has no attribute claim to falsify." });
          const real = v[z.cred]?.attrs[z.attr]?.v ?? 0;
          const b = buildProof(v, ch.info, { assume: { [`${z.cred}.${z.attr}`]: Math.min(65535, real + 1) } });
          const r = await submit(ch, b);
          record(id, r.report, r.ms, `The prover pretended ${z.cred}.${z.attr} had a different value than the one the issuer signed.`);
          return;
        }
        const honest = buildProof(v, ch.info);
        const mutated = id === "tamper" ? tamperBundle(honest) : id === "alter" ? alterClaim(honest) : breakSignature(honest);
        const r = await submit(ch, mutated);
        record(id, r.report, r.ms);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [compiled, fetchChallenge, guard, log, record, submit, verify],
  );

  async function setStatusDirect(cred: CredId, status: RegistryStatus) {
    const h = vaultRef.current[cred]?.handle;
    if (!h) return;
    await postJson("/api/trust", { action: "registry", op: "set", handle: h, status });
    log("warn", `Credential ${status}: ${CREDS[cred].label}`);
    await refreshStatuses();
  }

  // ------------------------------------------------------------------ AI + misc
  const parseText = useCallback(
    (input: string) =>
      guard("Policy parsing", async () => {
        const r = await postJson<{ policy: PolicyNode | null; source: string; provider: string | null; note: string | null }>("/api/trust", { action: "parse", text: input });
        if (r.policy) {
          setPolicy(r.policy);
          setVerifierId("custom");
          log("info", `Natural-language policy parsed (${r.source === "ai" ? `AI${r.provider ? `: ${r.provider}` : ""}` : "rule parser"}) and validated by the compiler`);
        }
        setParseNote(r.note ?? (r.policy ? (r.source === "ai" ? "Parsed by AI; the deterministic compiler validated the result." : null) : "No supported conditions found."));
      }),
    [guard, log],
  );

  const explainReport = useCallback(
    (key: string, kind: "verification" | "attack" | "claim" | "security", report: VerifyReport, attackName?: string) =>
      guard("Explanation", async () => {
        const r = await postJson<{ explanation: Explanation | null; note: string | null }>("/api/trust", {
          action: "explain",
          kind,
          facts: { policy: compiled.expression.slice(0, 480), trust: report.trust, attack: attackName, mode: modeRef.current, stages: report.stages.map((s) => ({ label: s.label, state: s.state, detail: s.detail.slice(0, 230) })) },
        });
        setExplain({ key, explanation: r.explanation, note: r.note });
      }),
    [compiled.expression, guard],
  );

  const runBench = useCallback(
    () =>
      guard("Post-quantum benchmark", async () => {
        const r = await postJson<PqBench>("/api/trust", { action: "pqbench" });
        setBench(r);
        log("info", "Post-quantum benchmark measured (ML-DSA-65, ML-KEM-768 vs Schnorr, ECDH)");
      }),
    [guard, log],
  );

  const selectVerifier = (id: string) => {
    const v = VERIFIERS.find((x) => x.id === id);
    if (!v) return;
    setVerifierId(id);
    setPolicy(v.policy);
    log("info", `Verifier selected: ${v.name}`);
  };

  const policyHashNow = compiled.ok ? compiled.policyHash : "";
  const stale = !!current && current.challenge.info.policyHash !== policyHashNow;
  const secondsLeft = current ? Math.max(0, Math.ceil((current.challenge.info.exp - now) / 1000)) : null;
  const expired = !!current && now > current.challenge.info.exp;
  const issued = CRED_IDS.every((c) => vault[c]);
  const planned = current ? Object.keys(current.bundle.claims).length : compiled.claims.length;
  const selected = current ? Object.entries(current.bundle.claims).map(([path, c]) => ({ path, prim: c.claim })) : compiled.claims;
  const disclosure = minimumDisclosure(selected, today);
  const verdict: "none" | "valid" | "invalid" = !current?.report ? "none" : current.report.trust === "VERIFIED" ? "valid" : "invalid";

  return {
    config, draft, setDraft, text, setText, vault, statuses, verifierId, selectVerifier, policy, setPolicy, setVerifierId, mode, setMode, current, phase, busy, error, setError, events, attack, attackHistory, countdown, bench, explain, parseNote,
    now, today, compiled, issued, stale, secondsLeft, expired, planned, disclosure, verdict, totalAttributes: totalAttributeCount(),
    issueAll, setStatus, lifecycle, generate, verify, proveAndVerify, runAttack, parseText, explainReport, runBench, log, refreshStatuses,
  };
}
export type TrustLab = ReturnType<typeof useTrustLab>;
