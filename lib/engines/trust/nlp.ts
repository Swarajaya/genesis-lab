/** Deterministic fallback for natural-language policy parsing. Used when no AI key works; the compiler validates either way. */
import { COUNTRIES, group, leaf, type CredId, type PolicyNode } from "./model";

const num = (s: string): number | undefined => {
  const m = /(\d+(?:\.\d+)?)/.exec(s);
  return m ? Number(m[1]) : undefined;
};

export function parsePolicyText(text: string): { policy: PolicyNode | null; found: string[] } {
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9.≥>=+\s]/g, " ")} `;
  const clauses = t.split(/\b(?:and|with|plus|as well as)\b/);
  const out: PolicyNode[] = [];
  const found: string[] = [];
  const add = (n: PolicyNode, why: string) => {
    if (!out.some((o) => JSON.stringify(o) === JSON.stringify(n))) {
      out.push(n);
      found.push(why);
    }
  };
  const credOf = (c: string): CredId | null => (/clearance/.test(c) ? "CLR" : /certif/.test(c) ? "CERT" : /universit|college|degree|student/.test(c) ? "UNI" : /identity|passport|national id/.test(c) ? "ID" : null);
  for (const c of clauses) {
    const cred = credOf(c);
    const atLeast = /(at least|minimum|min\b|>=|≥|above|over|higher than|or more|or higher|or older|\+)/.test(c);
    if (/not revoked|non revoked|unrevoked|not been revoked/.test(c) && cred) add(leaf("cred_not_revoked", undefined, cred), `${cred} not revoked`);
    else if (/(valid|active|current|unexpired)/.test(c) && cred && !/clearance level|level of/.test(c)) add(leaf("cred_active", undefined, cred), `${cred} valid & active`);
    if (/clearance/.test(c)) {
      const n = num(c);
      if (n !== undefined && (atLeast || /level/.test(c))) add(leaf("clearance_gte", Math.min(5, Math.round(n))), `clearance ≥ ${n}`);
    }
    if (/\bage\b|years old|older|over \d+|\b\d+\s*\+/.test(c)) {
      const n = num(c);
      if (n !== undefined && n >= 1 && n <= 120) add(leaf("age_gte", Math.round(n)), `age ≥ ${n}`);
    }
    if (/\bstudent\b|enrolled/.test(c) && !/not a student/.test(c)) add(leaf("student"), "student");
    if (/certif/.test(c) && /level/.test(c)) {
      const n = num(c);
      if (n !== undefined) add(leaf("cert_level_gte", Math.min(3, Math.round(n))), `certification level ≥ ${n}`);
    }
    if (/phd|doctorate/.test(c)) add(leaf("degree_gte", 3), "degree ≥ doctorate");
    else if (/master/.test(c)) add(leaf("degree_gte", 2), "degree ≥ master");
    else if (/bachelor/.test(c)) add(leaf("degree_gte", 1), "degree ≥ bachelor");
    if (/(score|gpa|grade)/.test(c)) {
      const n = num(c);
      if (n !== undefined) add(leaf("score_gte", Math.min(400, Math.round(n <= 4.5 ? n * 100 : n))), `score ≥ ${n}`);
    }
    for (const [code, name] of Object.entries(COUNTRIES)) if (c.includes(name.toLowerCase())) add(leaf("country_eq", Number(code)), `country = ${name}`);
  }
  if (out.length === 0) return { policy: null, found };
  const anyOr = /\bor\b/.test(t) && !/\band\b/.test(t);
  return { policy: out.length === 1 ? out[0] : group(anyOr ? "OR" : "AND", ...out), found };
}
