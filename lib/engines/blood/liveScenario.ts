import type { Constraints } from "./engine";
import { DEFAULT_CONSTRAINTS } from "./engine";
import type { LiveDonor, LivePatient, World } from "./liveTypes";

const C: Constraints = { ...DEFAULT_CONSTRAINTS };

const bank = (code: string, abo: LiveDonor["abo"], rh: LiveDonor["rh"], units: number, distanceKm: number, hoursToExpiry: number, kell: LiveDonor["kell"] = "K-"): LiveDonor => ({
  code, abo, rh, kell, rhc: "c+", rhe: "E-", duffy: "Fy(a+)", units, distanceKm, hoursToExpiry, status: "online", source: "bank", participantId: null, zone: null,
});

/** 27 units across 8 groups. Every bank donor is Fy(a+), which matters for patient 07 (anti-Fya). */
export const SCENARIO_BANK: LiveDonor[] = [
  bank("D-101", "O", "-", 2, 3.5, 300),
  bank("D-102", "O", "-", 1, 6, 60),
  bank("D-103", "A", "+", 3, 2.7, 280),
  bank("D-104", "A", "+", 2, 5, 260, "K+"),
  bank("D-105", "AB", "+", 2, 4.1, 200),
  bank("D-106", "AB", "+", 2, 7, 180),
  bank("D-107", "B", "-", 2, 6.4, 150),
  bank("D-108", "O", "+", 3, 3, 220),
  bank("D-109", "O", "+", 2, 8, 170),
  bank("D-110", "A", "-", 2, 5.5, 260),
  bank("D-111", "B", "+", 3, 4.4, 190),
  bank("D-112", "B", "+", 1, 7.5, 40),
  bank("D-113", "AB", "-", 2, 8.5, 210),
];

const P = (no: number, abo: LivePatient["abo"], rh: LivePatient["rh"], unitsNeeded: number, urgency: LivePatient["urgency"], extra: Partial<LivePatient> = {}): LivePatient => ({
  id: `P-${String(no).padStart(2, "0")}`, no, abo, rh, component: "RBC", unitsNeeded, urgency, antibodies: [], chronicTransfusion: false, constraints: { ...C }, resolved: false, source: "scenario", ...extra,
});

/** 12 patients, 31 units required, 27 units in the bank. Patient 07 needs Fy(a-) blood that no bank donor has. */
export const SCENARIO_PATIENTS: LivePatient[] = [
  P(1, "A", "+", 2, "critical"),
  P(2, "O", "-", 3, "critical"),
  P(3, "AB", "+", 4, "urgent"),
  P(4, "B", "-", 2, "routine"),
  P(5, "O", "+", 3, "urgent"),
  P(6, "A", "-", 2, "urgent"),
  P(7, "AB", "+", 4, "critical", { antibodies: ["anti-Fya"], chronicTransfusion: true }),
  P(8, "B", "+", 3, "routine"),
  P(9, "O", "+", 2, "routine", { component: "PLASMA" }),
  P(10, "A", "+", 3, "urgent"),
  P(11, "AB", "-", 2, "routine"),
  P(12, "B", "+", 1, "routine"),
];

export function emptyWorld(): World {
  return { phase: "idle", patients: [], bank: [], nextPatientNo: 1, nextWalkIn: 901, nextHospital: 0, stressStep: 0, resolution: null, seq: 0 };
}

export function emergencyWorld(prevSeq: number): World {
  return {
    phase: "emergency",
    patients: structuredClone(SCENARIO_PATIENTS),
    bank: structuredClone(SCENARIO_BANK),
    nextPatientNo: SCENARIO_PATIENTS.length + 1,
    nextWalkIn: 901,
    nextHospital: 0,
    stressStep: 0,
    resolution: null,
    seq: prevSeq,
  };
}

/** Deterministic hospital requests, used by the console, the stress test and the phone-less fallback. */
export const HOSPITAL_CYCLE: Array<Pick<LivePatient, "abo" | "rh" | "unitsNeeded" | "urgency">> = [
  { abo: "B", rh: "+", unitsNeeded: 3, urgency: "urgent" },
  { abo: "O", rh: "-", unitsNeeded: 2, urgency: "critical" },
  { abo: "A", rh: "+", unitsNeeded: 2, urgency: "routine" },
  { abo: "AB", rh: "+", unitsNeeded: 2, urgency: "urgent" },
];

/** Deterministic walk-in donors. Fy(a-) and K-, so they can serve antibody patients. */
export const WALKIN_CYCLE: Array<{ abo: LiveDonor["abo"]; rh: LiveDonor["rh"]; units: number }> = [
  { abo: "AB", rh: "-", units: 3 },
  { abo: "O", rh: "-", units: 2 },
  { abo: "A", rh: "+", units: 2 },
  { abo: "B", rh: "-", units: 2 },
];

export const STRESS = {
  cancel: ["D-103", "D-108"],
  expire: "D-111",
  demandPatient: "P-05",
  demandExtra: 2,
  criticalPatient: "P-10",
  steps: 7,
} as const;
