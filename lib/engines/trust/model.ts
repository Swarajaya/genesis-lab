/**
 * Trust model: credential catalog, policy AST, deterministic policy compiler and planner.
 * Pure TypeScript, safe in the browser and on the server. No LLM is involved anywhere in this file.
 */
import { cutoffDay, daysSince1900, sha256Hex } from "./zk";

// ------------------------------------------------------------------ credential catalog

export type CredId = "ID" | "UNI" | "CERT" | "CLR";
export const CRED_IDS: CredId[] = ["ID", "UNI", "CERT", "CLR"];

export interface AttrDef {
  label: string;
  kind: "date" | "flag" | "level" | "score" | "country";
  min: number;
  max: number;
}
export interface CredDef {
  id: CredId;
  label: string;
  issuer: string;
  /** committed attributes, always including `expiry` */
  attrs: Record<string, AttrDef>;
}

export const COUNTRIES: Record<number, string> = { 1: "India", 2: "United States", 3: "United Kingdom", 4: "Germany", 5: "Japan" };
export const DEGREES: Record<number, string> = { 0: "None", 1: "Bachelor", 2: "Master", 3: "Doctorate" };
const expiry: AttrDef = { label: "Credential expiry", kind: "date", min: 0, max: 65535 };

export const CREDS: Record<CredId, CredDef> = {
  ID: { id: "ID", label: "Identity credential", issuer: "Civil Registry", attrs: { dob: { label: "Date of birth", kind: "date", min: 0, max: 65535 }, country: { label: "Country", kind: "country", min: 0, max: 255 }, expiry } },
  UNI: { id: "UNI", label: "University credential", issuer: "University", attrs: { student: { label: "Enrolled student", kind: "flag", min: 0, max: 1 }, degree: { label: "Degree level", kind: "level", min: 0, max: 3 }, gpa: { label: "Score (x100)", kind: "score", min: 0, max: 400 }, expiry } },
  CERT: { id: "CERT", label: "Research certification", issuer: "Research Certification Board", attrs: { level: { label: "Certification level", kind: "level", min: 0, max: 3 }, expiry } },
  CLR: { id: "CLR", label: "Security clearance", issuer: "Security Office", attrs: { level: { label: "Clearance level", kind: "level", min: 0, max: 5 }, expiry } },
};

/** Private text fields held in the vault but never committed, therefore never provable. */
export const PRIVATE_TEXT_FIELDS = ["fullName", "universityName", "credentialId.ID", "credentialId.UNI", "credentialId.CERT", "credentialId.CLR"] as const;

export const totalAttributeCount = () => CRED_IDS.reduce((n, c) => n + Object.keys(CREDS[c].attrs).length, 0) + PRIVATE_TEXT_FIELDS.length;

// ------------------------------------------------------------------ time helpers

export const todayIso = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
export const dayNumber = (iso: string) => daysSince1900(iso);
export const isoFromDay = (d: number) => new Date(Date.UTC(1900, 0, 1) + d * 86_400_000).toISOString().slice(0, 10);

export type Lifecycle = "ISSUED" | "ACTIVE" | "EXPIRING" | "EXPIRED" | "SUSPENDED" | "REVOKED";
export type RegistryStatus = "active" | "suspended" | "revoked";
export const EXPIRING_WINDOW_DAYS = 30;

export function lifecycleOf(expiryDay: number, today: number, status: RegistryStatus, issuedDay?: number): Lifecycle {
  if (status === "revoked") return "REVOKED";
  if (status === "suspended") return "SUSPENDED";
  if (expiryDay < today) return "EXPIRED";
  if (expiryDay - today <= EXPIRING_WINDOW_DAYS) return "EXPIRING";
  if (issuedDay !== undefined && issuedDay === today) return "ISSUED";
  return "ACTIVE";
}

// ------------------------------------------------------------------ policy AST

export type SpecId = "cred_active" | "cred_not_revoked" | "student" | "degree_gte" | "score_gte" | "cert_level_gte" | "clearance_gte" | "age_gte" | "country_eq";

export interface LeafSpec {
  id: SpecId;
  label: string;
  /** short label used in expressions */
  expr: string;
  cred: CredId;
  attr?: string;
  op: "active" | "notRevoked" | "eq" | "gte" | "age";
  param?: { label: string; min: number; max: number; def: number };
  /** the user-chosen credential (for cred_active / cred_not_revoked) */
  pickCred?: boolean;
}

export const SPECS: Record<SpecId, LeafSpec> = {
  cred_active: { id: "cred_active", label: "Credential valid & active", expr: "credential.active", cred: "UNI", op: "active", pickCred: true },
  cred_not_revoked: { id: "cred_not_revoked", label: "Credential not revoked", expr: "credential.notRevoked", cred: "UNI", op: "notRevoked", pickCred: true },
  student: { id: "student", label: "Student = true", expr: "student", cred: "UNI", attr: "student", op: "eq", param: undefined },
  degree_gte: { id: "degree_gte", label: "Degree level ≥", expr: "degree", cred: "UNI", attr: "degree", op: "gte", param: { label: "level", min: 0, max: 3, def: 1 } },
  score_gte: { id: "score_gte", label: "Score ≥ (x100)", expr: "score", cred: "UNI", attr: "gpa", op: "gte", param: { label: "x100", min: 0, max: 400, def: 300 } },
  cert_level_gte: { id: "cert_level_gte", label: "Certification level ≥", expr: "certification.level", cred: "CERT", attr: "level", op: "gte", param: { label: "level", min: 0, max: 3, def: 1 } },
  clearance_gte: { id: "clearance_gte", label: "Clearance ≥", expr: "clearance", cred: "CLR", attr: "level", op: "gte", param: { label: "level", min: 0, max: 5, def: 2 } },
  age_gte: { id: "age_gte", label: "Age ≥", expr: "age", cred: "ID", attr: "dob", op: "age", param: { label: "years", min: 0, max: 120, def: 18 } },
  country_eq: { id: "country_eq", label: "Country =", expr: "country", cred: "ID", attr: "country", op: "eq", param: { label: "code", min: 1, max: 5, def: 1 } },
};
export const SPEC_IDS = Object.keys(SPECS) as SpecId[];

export type PolicyNode =
  | { t: "leaf"; spec: SpecId; param?: number; cred?: CredId; not?: boolean }
  | { t: "group"; op: "AND" | "OR"; children: PolicyNode[]; not?: boolean };

export const MAX_POLICY_NODES = 16;
export const MAX_POLICY_DEPTH = 4;

export const leaf = (spec: SpecId, param?: number, cred?: CredId, not?: boolean): PolicyNode => ({ t: "leaf", spec, ...(param !== undefined ? { param } : {}), ...(cred ? { cred } : {}), ...(not ? { not } : {}) });
export const group = (op: "AND" | "OR", ...children: PolicyNode[]): PolicyNode => ({ t: "group", op, children });

// ------------------------------------------------------------------ compiled form

/** Primitive claim after normalisation. `active` and `notRevoked` are lifecycle claims; the rest are attribute claims. */
export type LifePrim = { kind: "active" | "notRevoked"; cred: CredId };
export type AttrPrim = { kind: "eq" | "gte" | "lte"; cred: CredId; attr: string; value: number };
export type Prim = LifePrim | AttrPrim;
export const isLife = (p: Prim): p is LifePrim => p.kind === "active" || p.kind === "notRevoked";

export type CNode = { op: "AND" | "OR"; children: CNode[] } | { op: "CLAIM"; claim: Prim };

export const primKey = (p: Prim): string => (isLife(p) ? `${p.kind}:${p.cred}` : `${p.kind}:${p.cred}.${p.attr}:${p.value}`);

/** The attribute claim that a prim reduces to for zero-knowledge proving (null for notRevoked). */
export function zkClaimOf(p: Prim, today: number): AttrPrim | null {
  if (p.kind === "notRevoked") return null;
  if (isLife(p)) return { kind: "gte", cred: p.cred, attr: "expiry", value: today };
  return p;
}

export interface CompileError {
  code: string;
  message: string;
}

export interface Compiled {
  ok: boolean;
  errors: CompileError[];
  tree: CNode | null;
  claims: { path: string; prim: Prim }[];
  expression: string;
  policyHash: string;
  /** credentials whose commitments any satisfying proof must present */
  credentials: CredId[];
  attributeClaims: number;
  lifecycleClaims: number;
  asOfDay: number;
  hasOr: boolean;
}

function countNodes(n: PolicyNode): number {
  return n.t === "leaf" ? 1 : 1 + n.children.reduce((a, c) => a + countNodes(c), 0);
}
function depthOf(n: PolicyNode): number {
  return n.t === "leaf" ? 1 : 1 + Math.max(0, ...n.children.map(depthOf));
}

/** Structural + semantic validation. Returns a cleaned copy (unknown fields dropped, params clamped) or errors. */
export function validatePolicy(input: unknown): { ok: true; policy: PolicyNode } | { ok: false; errors: CompileError[] } {
  const errors: CompileError[] = [];
  const err = (code: string, message: string) => errors.push({ code, message });
  const walk = (n: unknown, depth: number): PolicyNode | null => {
    if (!n || typeof n !== "object") {
      err("shape", "Policy node must be an object.");
      return null;
    }
    const o = n as Record<string, unknown>;
    if (o.t === "leaf") {
      const spec = SPECS[o.spec as SpecId];
      if (!spec) {
        err("unknown_claim", `Unknown condition "${String(o.spec).slice(0, 40)}".`);
        return null;
      }
      let param: number | undefined;
      if (spec.param) {
        const raw = typeof o.param === "number" && Number.isFinite(o.param) ? Math.round(o.param) : spec.param.def;
        if (raw < spec.param.min || raw > spec.param.max) err("param_range", `${spec.label} must be between ${spec.param.min} and ${spec.param.max}.`);
        param = Math.min(spec.param.max, Math.max(spec.param.min, raw));
      }
      let cred: CredId | undefined;
      if (spec.pickCred) {
        cred = CRED_IDS.includes(o.cred as CredId) ? (o.cred as CredId) : spec.cred;
      }
      return { t: "leaf", spec: spec.id, ...(param !== undefined ? { param } : {}), ...(cred ? { cred } : {}), ...(o.not === true ? { not: true } : {}) };
    }
    if (o.t === "group") {
      if (o.op !== "AND" && o.op !== "OR") {
        err("operator", "Group operator must be AND or OR.");
        return null;
      }
      if (!Array.isArray(o.children) || o.children.length === 0) {
        err("empty_group", "A group needs at least one condition.");
        return null;
      }
      const kids = o.children.map((c) => walk(c, depth + 1)).filter((x): x is PolicyNode => x !== null);
      if (kids.length !== o.children.length) return null;
      return { t: "group", op: o.op, children: kids, ...(o.not === true ? { not: true } : {}) };
    }
    err("shape", "Policy node must be a leaf or a group.");
    return null;
  };
  const policy = walk(input, 1);
  if (policy) {
    if (countNodes(policy) > MAX_POLICY_NODES) err("too_large", `A policy may contain at most ${MAX_POLICY_NODES} nodes.`);
    if (depthOf(policy) > MAX_POLICY_DEPTH) err("too_deep", `A policy may be nested at most ${MAX_POLICY_DEPTH} levels deep.`);
  }
  if (errors.length || !policy) return { ok: false, errors };
  return { ok: true, policy };
}

/** Policy to normal form: pushes NOT down to leaves; returns a CNode tree. */
function lower(n: PolicyNode, negate: boolean, today: number, errors: CompileError[]): CNode | null {
  const neg = negate !== (n.not === true);
  if (n.t === "group") {
    const op = neg ? (n.op === "AND" ? "OR" : "AND") : n.op;
    const kids = n.children.map((c) => lower(c, neg, today, errors));
    if (kids.some((k) => k === null)) return null;
    return { op, children: kids as CNode[] };
  }
  const spec = SPECS[n.spec];
  const cred = n.cred ?? spec.cred;
  const claim = (p: Prim): CNode => ({ op: "CLAIM", claim: p });
  if (spec.op === "active" || spec.op === "notRevoked") {
    if (neg) {
      errors.push({ code: "unsupported_negation", message: `NOT cannot be applied to "${spec.label}": registry state is checked by the verifier, not proven in zero knowledge.` });
      return null;
    }
    return claim({ kind: spec.op, cred });
  }
  const attr = spec.attr as string;
  const v = n.param ?? 1;
  if (spec.op === "age") {
    const cut = cutoffDay(todayIso(Date.UTC(1900, 0, 1) + today * 86_400_000), v);
    // age >= N  <=>  dob <= cutoff ; NOT(age >= N) <=> dob >= cutoff + 1
    return neg ? claim({ kind: "gte", cred, attr, value: cut + 1 }) : claim({ kind: "lte", cred, attr, value: cut });
  }
  if (spec.op === "gte") {
    if (!neg) return claim({ kind: "gte", cred, attr, value: v });
    if (v <= 0) {
      errors.push({ code: "unsatisfiable", message: `NOT (${spec.expr} ≥ ${v}) can never be true.` });
      return null;
    }
    return claim({ kind: "lte", cred, attr, value: v - 1 });
  }
  // eq: student -> value 1 ; country -> param
  const k = spec.id === "student" ? 1 : v;
  if (!neg) return claim({ kind: "eq", cred, attr, value: k });
  // NOT eq  ->  value < k OR value > k  (the satisfied branch is revealed to the verifier)
  const lo: CNode | null = k > 0 ? claim({ kind: "lte", cred, attr, value: k - 1 }) : null;
  const hi: CNode = claim({ kind: "gte", cred, attr, value: k + 1 });
  return lo ? { op: "OR", children: [lo, hi] } : hi;
}

export function describePrim(p: Prim, today?: number): string {
  if (isLife(p)) return `${p.cred}.${p.kind}`;
  const op = p.kind === "eq" ? "==" : p.kind === "gte" ? "≥" : "≤";
  const val = p.attr === "expiry" && today !== undefined ? "today" : p.value;
  return `${p.cred}.${p.attr} ${op} ${val}`;
}

export function expressionOf(n: CNode, today?: number): string {
  if (n.op === "CLAIM") return describePrim(n.claim, today);
  const inner = n.children.map((c) => expressionOf(c, today)).join(` ${n.op} `);
  return n.children.length > 1 ? `(${inner})` : inner;
}

/** Collects claim leaves with stable path ids ("0", "1.0", ...). */
function collect(n: CNode, path: string, out: { path: string; prim: Prim }[]) {
  if (n.op === "CLAIM") {
    out.push({ path: path || "0", prim: n.claim });
    return;
  }
  n.children.forEach((c, i) => collect(c, path ? `${path}.${i}` : String(i), out));
}

export function compilePolicy(input: unknown, asOfDay: number): Compiled {
  const empty = (errors: CompileError[]): Compiled => ({ ok: false, errors, tree: null, claims: [], expression: "", policyHash: "", credentials: [], attributeClaims: 0, lifecycleClaims: 0, asOfDay, hasOr: false });
  const v = validatePolicy(input);
  if (!v.ok) return empty(v.errors);
  const errors: CompileError[] = [];
  const tree = lower(v.policy, false, asOfDay, errors);
  if (!tree || errors.length) return empty(errors);
  const claims: { path: string; prim: Prim }[] = [];
  collect(tree, "", claims);
  const hasOr = JSON.stringify(tree).includes('"op":"OR"');
  const creds = Array.from(new Set(claims.map((c) => c.prim.cred)));
  const policyHash = sha256Hex(`policy-v1|${asOfDay}|${JSON.stringify(tree)}`);
  return {
    ok: true,
    errors: [],
    tree,
    claims,
    expression: expressionOf(tree, asOfDay),
    policyHash,
    credentials: creds,
    attributeClaims: claims.filter((c) => c.prim.kind !== "notRevoked").length,
    lifecycleClaims: claims.filter((c) => c.prim.kind === "active" || c.prim.kind === "notRevoked").length,
    asOfDay,
    hasOr,
  };
}

// ------------------------------------------------------------------ planning (holder) and requirement derivation (verifier)

export type Selection = Record<string, number>;

/** Required claim leaves for a tree under a given OR selection. Returns null if the selection is invalid. */
export function requiredClaims(tree: CNode, selection: Selection): { path: string; prim: Prim }[] | null {
  const out: { path: string; prim: Prim }[] = [];
  let valid = true;
  const walk = (n: CNode, path: string) => {
    if (!valid) return;
    if (n.op === "CLAIM") {
      out.push({ path: path || "0", prim: n.claim });
      return;
    }
    if (n.op === "AND") {
      n.children.forEach((c, i) => walk(c, path ? `${path}.${i}` : String(i)));
      return;
    }
    const pick = selection[path || "0"];
    if (!Number.isInteger(pick) || pick < 0 || pick >= n.children.length) {
      valid = false;
      return;
    }
    walk(n.children[pick], path ? `${path}.${pick}` : String(pick));
  };
  walk(tree, "");
  return valid ? out : null;
}

/** Holder-side planning: choose a satisfiable set of claims using `can` (local truth), preferring fewer claims. */
export function planSelection(tree: CNode, can: (p: Prim) => boolean): { ok: boolean; selection: Selection; claims: { path: string; prim: Prim }[] } {
  const selection: Selection = {};
  const best = (n: CNode, path: string): { ok: boolean; cost: number; sel: Selection } => {
    if (n.op === "CLAIM") return { ok: can(n.claim), cost: 1, sel: {} };
    if (n.op === "AND") {
      let cost = 0;
      let ok = true;
      const sel: Selection = {};
      n.children.forEach((c, i) => {
        const r = best(c, path ? `${path}.${i}` : String(i));
        ok = ok && r.ok;
        cost += r.cost;
        Object.assign(sel, r.sel);
      });
      return { ok, cost, sel };
    }
    let pick = -1;
    let pickCost = Infinity;
    let pickSel: Selection = {};
    n.children.forEach((c, i) => {
      const r = best(c, path ? `${path}.${i}` : String(i));
      if (r.ok && r.cost < pickCost) {
        pick = i;
        pickCost = r.cost;
        pickSel = r.sel;
      }
    });
    if (pick < 0) return { ok: false, cost: 1, sel: {} };
    return { ok: true, cost: pickCost, sel: { ...pickSel, [path || "0"]: pick } };
  };
  const r = best(tree, "");
  Object.assign(selection, r.sel);
  // For an unsatisfiable OR, fall back to branch 0 so a dishonest prover can still attempt a (failing) proof.
  const fill = (n: CNode, path: string) => {
    if (n.op === "CLAIM") return;
    if (n.op === "OR") {
      const key = path || "0";
      if (selection[key] === undefined) selection[key] = 0;
      fill(n.children[selection[key]], path ? `${path}.${selection[key]}` : String(selection[key]));
      return;
    }
    n.children.forEach((c, i) => fill(c, path ? `${path}.${i}` : String(i)));
  };
  fill(tree, "");
  return { ok: r.ok, selection, claims: requiredClaims(tree, selection) ?? [] };
}

/** Evaluates the tree given per-path claim outcomes. Deterministic; this is the policy decision. */
export function evaluateTree(tree: CNode, selection: Selection, passed: (path: string) => boolean): boolean {
  const walk = (n: CNode, path: string): boolean => {
    if (n.op === "CLAIM") return passed(path || "0");
    if (n.op === "AND") return n.children.every((c, i) => walk(c, path ? `${path}.${i}` : String(i)));
    const pick = selection[path || "0"];
    if (!Number.isInteger(pick) || pick < 0 || pick >= n.children.length) return false;
    return walk(n.children[pick], path ? `${path}.${pick}` : String(pick));
  };
  return walk(tree, "");
}

// ------------------------------------------------------------------ minimum disclosure (all counts derived, nothing estimated)

export interface Disclosure {
  privateAttributes: number;
  committedAttributes: number;
  requiredClaims: number;
  attributesTouched: number;
  unnecessary: number;
  rawDisclosed: number;
  credentialsPresented: number;
  opaqueCommitmentsPresented: number;
}

export function minimumDisclosure(claims: { prim: Prim }[], today: number): Disclosure {
  const touched = new Set<string>();
  const creds = new Set<CredId>();
  for (const c of claims) {
    creds.add(c.prim.cred);
    const z = zkClaimOf(c.prim, today);
    if (z) touched.add(`${z.cred}.${z.attr}`);
  }
  const total = totalAttributeCount();
  const committed = CRED_IDS.reduce((n, c) => n + Object.keys(CREDS[c].attrs).length, 0);
  const presentedCommitments = Array.from(creds).reduce((n, c) => n + Object.keys(CREDS[c].attrs).length, 0);
  return {
    privateAttributes: total,
    committedAttributes: committed,
    requiredClaims: claims.length,
    attributesTouched: touched.size,
    unnecessary: total - touched.size,
    rawDisclosed: 0,
    credentialsPresented: creds.size,
    opaqueCommitmentsPresented: presentedCommitments,
  };
}

// ------------------------------------------------------------------ verifier presets

export interface VerifierPreset {
  id: string;
  name: string;
  question: string;
  policy: PolicyNode;
}

export const VERIFIERS: VerifierPreset[] = [
  { id: "university", name: "University registrar", question: "Is the user a valid student?", policy: group("AND", leaf("cred_active", undefined, "UNI"), leaf("student")) },
  { id: "lab", name: "Research lab", question: "Does the user hold clearance ≥ 2 on a credential that is not revoked?", policy: group("AND", leaf("clearance_gte", 2), leaf("cred_not_revoked", undefined, "CLR"), leaf("cred_active", undefined, "CERT")) },
  { id: "event", name: "Event gate", question: "Does the user satisfy the age requirement?", policy: leaf("age_gte", 18) },
  { id: "company", name: "Company", question: "Is the research certification valid?", policy: group("AND", leaf("cred_active", undefined, "CERT"), leaf("cert_level_gte", 1)) },
];

export const DEFAULT_POLICY: PolicyNode = group("AND", leaf("cred_active", undefined, "UNI"), leaf("cred_active", undefined, "CERT"), leaf("clearance_gte", 2));

export function leafLabel(n: Extract<PolicyNode, { t: "leaf" }>): string {
  const s = SPECS[n.spec];
  const base = s.pickCred ? `${CREDS[n.cred ?? s.cred].label} ${s.id === "cred_active" ? "valid & active" : "not revoked"}` : `${s.label}${s.param && n.param !== undefined ? ` ${n.spec === "country_eq" ? (COUNTRIES[n.param] ?? n.param) : n.param}` : ""}`;
  return n.not ? `NOT ${base}` : base;
}
