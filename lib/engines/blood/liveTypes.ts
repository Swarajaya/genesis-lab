import type { Abo, Antibody, Constraints, Rh, Urgency } from "./engine";

export type Component = "RBC" | "PLASMA";
export type Zone = "A" | "B" | "C";
export type Role = "donor" | "hospital" | "observer";

/** Distance of each phone-selectable zone from the emergency hub. */
export const ZONE_KM: Record<Zone, number> = { A: 2.5, B: 6, C: 12 };
export const LIVE_DONOR_EXPIRY_H = 168;
export const SESSION_TTL_MS = 4 * 60 * 60 * 1000;
export const MAX_PARTICIPANTS = 40;
export const MAX_HOSPITAL_REQUESTS = 3;

export interface LivePatient {
  id: string;
  no: number;
  abo: Abo;
  rh: Rh;
  component: Component;
  unitsNeeded: number;
  urgency: Urgency;
  antibodies: Antibody[];
  chronicTransfusion: boolean;
  constraints: Constraints;
  resolved: boolean;
  source: "scenario" | "hospital" | "stress" | "console";
}

export type DonorStatus = "online" | "offline" | "expired";

/** A donor unit pool. `bank` donors are simulated inventory; `live` donors are real phones. */
export interface LiveDonor {
  code: string;
  abo: Abo;
  rh: Rh;
  kell: "K+" | "K-";
  rhc: "c+" | "c-";
  rhe: "E+" | "E-";
  duffy: "Fy(a+)" | "Fy(a-)";
  units: number;
  distanceKm: number;
  hoursToExpiry: number;
  status: DonorStatus;
  source: "bank" | "live";
  participantId: string | null;
  zone: Zone | null;
}

export interface Participant {
  id: string;
  role: Role;
  code: string;
  abo: Abo | null;
  rh: Rh | null;
  units: number;
  zone: Zone | null;
  /** Donor availability (donor can cancel and return). */
  online: boolean;
  /** Device connection (phone screen open). */
  connected: boolean;
  hospitalRequests: number;
  joinedAt: string;
}

export type AllocationState = "offered" | "confirmed" | "declined" | "cancelled";

export interface Allocation {
  id: string;
  patientId: string;
  donorCode: string;
  participantId: string;
  units: number;
  state: AllocationState;
  createdAt: string;
  updatedAt: string;
}

export interface Resolution {
  patientsServed: number;
  patientsTotal: number;
  unitsAllocated: number;
  criticalShortage: number;
  shortage: number;
  pending: number;
}

export type Phase = "idle" | "emergency" | "stress" | "resolved";

export interface World {
  phase: Phase;
  patients: LivePatient[];
  bank: LiveDonor[];
  nextPatientNo: number;
  nextWalkIn: number;
  nextHospital: number;
  stressStep: number;
  resolution: Resolution | null;
  seq: number;
}

export interface LiveState {
  world: World;
  participants: Participant[];
  allocations: Allocation[];
}

export type EventType =
  | "SESSION_STARTED"
  | "DEVICE_CONNECTED"
  | "DEVICE_DISCONNECTED"
  | "DONOR_JOINED"
  | "DONOR_OFFLINE"
  | "DONOR_ONLINE"
  | "EMERGENCY_STARTED"
  | "MATCH_FOUND"
  | "MATCH_ACCEPTED"
  | "MATCH_DECLINED"
  | "MATCH_CANCELLED"
  | "PRIORITY_UPDATED"
  | "UNIT_EXPIRED"
  | "NEW_DONOR"
  | "HOSPITAL_REQUEST"
  | "EMERGENCY_WORSENED"
  | "STRESS_STARTED"
  | "STRESS_STEP"
  | "EMERGENCY_RESOLVED"
  | "SESSION_ENDED";

export interface LiveEvent {
  seq: number;
  type: EventType;
  at: string;
  actor: string;
  message: string;
  data: { patientId?: string; donorCode?: string; participantId?: string; units?: number; allocationId?: string; step?: number };
}

export type Actor = { kind: "host" } | { kind: "participant"; id: string } | { kind: "anonymous" };

export type LiveAction =
  | { type: "join"; role: Role; abo?: Abo; rh?: Rh; units?: number; zone?: Zone }
  | { type: "rejoin" }
  | { type: "leave" }
  | { type: "set_online"; online: boolean }
  | { type: "respond"; allocationId: string; accept: boolean }
  | { type: "hospital_submit"; abo: Abo; rh: Rh; units: number; urgency: Urgency }
  | { type: "start_emergency" }
  | { type: "donor_cancels"; target?: string }
  | { type: "unit_expires"; target?: string }
  | { type: "new_donor" }
  | { type: "emergency_worsens"; target?: string }
  | { type: "hospital_request" }
  | { type: "donor_returns"; target?: string }
  | { type: "escalate"; target?: string }
  | { type: "stress_step"; step: number };

export class LiveError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

export interface Ctx {
  now: () => Date;
  /** Opaque unique id (UUID). */
  uid: () => string;
  /** Four random digits for LIVE-XXXX codes. */
  digits: () => string;
}

export const URGENCY_RANK: Record<Urgency, number> = { critical: 0, urgent: 1, routine: 2 };
