import { z } from "zod";
import { MAX_AMOUNT_PAISE, PURPOSES, RECIPIENT_TYPES, type Purpose } from "@/lib/engines/money/policy";
import { cleanText } from "./text";

const text = (max: number, min = 1) => z.string().transform((s) => cleanText(s, max)).pipe(z.string().min(min).max(max));
const purpose = z.enum(PURPOSES);
const recipientType = z.enum(RECIPIENT_TYPES);

export const draftSchema = z.object({
  amountPaise: z.number().int().min(1).max(MAX_AMOUNT_PAISE),
  recipientType,
  recipientId: z.string().trim().min(1).max(40),
  purposes: z.array(purpose).max(PURPOSES.length),
  maxTxnPaise: z.number().int().min(1).max(MAX_AMOUNT_PAISE).nullable(),
  expiresInSeconds: z.number().finite().min(1).max(366 * 86_400),
  allocations: z
    .record(z.string(), z.number().int().min(0).max(MAX_AMOUNT_PAISE))
    .refine((o) => Object.keys(o).every((k) => (PURPOSES as readonly string[]).includes(k)), "Unknown purpose in allocations")
    .transform((o) => o as Partial<Record<Purpose, number>>),
  merchants: z.array(text(60)).max(10),
});

const token = z.string().min(20).max(20_000);

export const expiryRequest = z.discriminatedUnion("action", [
  z.object({ action: z.literal("compile"), text: text(600, 8) }),
  z.object({ action: z.literal("issue"), draft: draftSchema }),
  z.object({ action: z.literal("spend"), token, request: z.object({ amountPaise: z.number().int().min(1).max(MAX_AMOUNT_PAISE), purpose, recipient: text(40), merchant: text(60, 0) }) }),
  z.object({ action: z.literal("control"), token, command: z.enum(["SUSPEND", "RESUME", "REVOKE"]) }),
  z.object({ action: z.literal("sync"), token }),
  z.object({ action: z.literal("update_policy"), token, draft: draftSchema, keepExpiry: z.boolean() }),
  z.object({
    action: z.literal("explain"),
    kind: z.enum(["trace", "conflict"]),
    facts: z.object({
      headline: text(200),
      lines: z.array(text(240)).min(1).max(14),
    }),
  }),
]);

/** What the model returns when compiling natural language. Never trusted until the deterministic validator has run. */
export const aiPolicyParse = z.object({
  amountRupees: z.number().finite().min(0).max(1_000_000),
  recipientType,
  recipientId: z.string().trim().max(40).nullable().default(null),
  purposes: z.array(purpose).max(PURPOSES.length),
  maxTransactionRupees: z.number().finite().min(0).max(1_000_000).nullable().default(null),
  expiresInSeconds: z.number().finite().min(0).max(366 * 86_400),
  allocations: z.array(z.object({ purpose, rupees: z.number().finite().min(0).max(1_000_000) })).max(PURPOSES.length).default([]),
  merchants: z.array(text(60)).max(10).default([]),
});

export const aiExplain = z.object({ explanation: text(700, 10) });
