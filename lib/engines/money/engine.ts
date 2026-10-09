/** Prototype digital currency simulation. No real monetary value. */
export type Category = "food" | "education" | "transport" | "health" | "electronics" | "entertainment" | "other";
export const CATEGORIES: Category[] = ["food", "education", "transport", "health", "electronics", "entertainment", "other"];
export type RecipientType = "student" | "farmer" | "worker" | "any";
export const RECIPIENT_TYPES: RecipientType[] = ["student", "farmer", "worker", "any"];

export interface MoneyRule {
  allowedCategories: Category[];
  recipientType: RecipientType;
  maxPerTxnPaise: number;
  issuedAt: string; // ISO
  expiresAt: string; // ISO
}

export interface TxnRequest {
  amountPaise: number;
  category: Category;
  merchant: string;
  /** Who is spending (the wallet holder claims a type; the rule requires one). */
  spenderType: RecipientType;
}

export type Decision = "APPROVED" | "REJECTED";

export interface Evaluation {
  decision: Decision;
  reasons: string[];
  checks: { id: string; label: string; ok: boolean; detail: string }[];
}

export const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export type Lifecycle = "ACTIVE" | "EXPIRING" | "EXPIRED" | "SPENT";

export function lifecycle(rule: MoneyRule, balancePaise: number, now: number): Lifecycle {
  const exp = Date.parse(rule.expiresAt);
  const iss = Date.parse(rule.issuedAt);
  if (now >= exp) return "EXPIRED";
  if (balancePaise <= 0) return "SPENT";
  return exp - now < (exp - iss) * 0.25 ? "EXPIRING" : "ACTIVE";
}

/** Pure rule engine. Every failed check is reported, not just the first. */
export function evaluate(rule: MoneyRule, txn: TxnRequest, balancePaise: number, now: number): Evaluation {
  const checks: Evaluation["checks"] = [];
  const add = (id: string, label: string, ok: boolean, detail: string) => checks.push({ id, label, ok, detail });

  const exp = Date.parse(rule.expiresAt);
  add("expiry", "Not expired", now < exp, now < exp ? `Valid for ${Math.max(0, Math.round((exp - now) / 3_600_000))} more hours.` : "Funds expired. Remaining balance is no longer spendable.");
  add(
    "category",
    "Allowed purpose",
    rule.allowedCategories.length === 0 || rule.allowedCategories.includes(txn.category),
    rule.allowedCategories.includes(txn.category) ? `"${txn.category}" is an allowed purpose.` : `"${txn.category}" is not in the allowed purposes (${rule.allowedCategories.join(", ") || "none"}).`,
  );
  add(
    "recipient",
    "Eligible recipient",
    rule.recipientType === "any" || rule.recipientType === txn.spenderType,
    rule.recipientType === "any" || rule.recipientType === txn.spenderType ? `Spender type "${txn.spenderType}" is eligible.` : `Funds are restricted to ${rule.recipientType}s; spender is ${txn.spenderType}.`,
  );
  add("cap", "Within per-transaction limit", txn.amountPaise <= rule.maxPerTxnPaise, txn.amountPaise <= rule.maxPerTxnPaise ? `${rupees(txn.amountPaise)} is within the ${rupees(rule.maxPerTxnPaise)} cap.` : `${rupees(txn.amountPaise)} exceeds the ${rupees(rule.maxPerTxnPaise)} cap.`);
  add("balance", "Sufficient balance", txn.amountPaise <= balancePaise, txn.amountPaise <= balancePaise ? `Balance ${rupees(balancePaise)} covers it.` : `Balance ${rupees(balancePaise)} is not enough.`);

  const failed = checks.filter((c) => !c.ok);
  return { decision: failed.length ? "REJECTED" : "APPROVED", reasons: failed.map((c) => c.detail), checks };
}

// ---------- Hash-chained ledger entry (pure data; hashing is injected so this works anywhere) ----------

export interface LedgerEntry {
  walletId: string;
  amountPaise: number;
  category: string;
  merchant: string;
  decision: Decision;
  evaluatedAt: string;
  balanceAfterPaise: number;
  prevHash: string | null;
  entryHash: string;
}

export function entryPayload(e: Omit<LedgerEntry, "entryHash">): string {
  return [e.prevHash ?? "GENESIS", e.walletId, e.amountPaise, e.category, e.merchant, e.decision, e.evaluatedAt, e.balanceAfterPaise].join("|");
}

export function verifyChain(entries: LedgerEntry[], hash: (s: string) => string): { valid: boolean; brokenAt?: number } {
  let prev: string | null = null;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.prevHash !== prev) return { valid: false, brokenAt: i };
    const { entryHash, ...rest } = e;
    if (hash(entryPayload(rest)) !== entryHash) return { valid: false, brokenAt: i };
    prev = entryHash;
  }
  return { valid: true };
}
