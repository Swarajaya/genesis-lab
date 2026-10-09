import { z } from "zod";

const abo = z.enum(["O", "A", "B", "AB"]);
const rh = z.enum(["+", "-"]);
const code = z.string().regex(/^[A-Z0-9-]{3,16}$/);

export const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

export const liveAction = z.discriminatedUnion("type", [
  z.object({ type: z.literal("join"), role: z.enum(["donor", "hospital", "observer"]), abo: abo.optional(), rh: rh.optional(), units: z.number().int().min(1).max(4).optional(), zone: z.enum(["A", "B", "C"]).optional() }),
  z.object({ type: z.literal("rejoin") }),
  z.object({ type: z.literal("leave") }),
  z.object({ type: z.literal("set_online"), online: z.boolean() }),
  z.object({ type: z.literal("respond"), allocationId: uuid, accept: z.boolean() }),
  z.object({ type: z.literal("hospital_submit"), abo, rh, units: z.number().int().min(1).max(6), urgency: z.enum(["routine", "urgent", "critical"]) }),
  z.object({ type: z.literal("start_emergency") }),
  z.object({ type: z.literal("donor_cancels"), target: code.optional() }),
  z.object({ type: z.literal("unit_expires"), target: code.optional() }),
  z.object({ type: z.literal("new_donor") }),
  z.object({ type: z.literal("emergency_worsens"), target: code.optional() }),
  z.object({ type: z.literal("hospital_request") }),
  z.object({ type: z.literal("donor_returns"), target: code.optional() }),
  z.object({ type: z.literal("escalate"), target: code.optional() }),
  z.object({ type: z.literal("stress_step"), step: z.number().int().min(0).max(7) }),
  z.object({ type: z.literal("end") }),
]);

export const actionRequest = z.object({ token: z.string().max(600).optional(), action: liveAction });

export const explainRequest = z.object({
  token: z.string().max(600),
  kind: z.enum(["donor_selected", "donor_rejected", "allocation_changed", "priority", "what_changed"]),
  patientId: code.optional(),
  donorCode: code.optional(),
});
