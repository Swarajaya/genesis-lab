/**
 * Educational / simulation prototype. NOT for clinical use. It does not replace crossmatching,
 * antibody screening or any real blood-bank protocol.
 */
export type Abo = "O" | "A" | "B" | "AB";
export type Rh = "+" | "-";
export type Antibody = "anti-K" | "anti-c" | "anti-E" | "anti-Fya";
export type Urgency = "routine" | "urgent" | "critical";
export type Verdict = "MATCH" | "PARTIAL" | "INCOMPATIBLE";
export type FactorStatus = "pass" | "warn" | "fail";

export interface Donor {
  code: string;
  abo: Abo;
  rh: Rh;
  kell: "K+" | "K-";
  rhc: "c+" | "c-";
  rhe: "E+" | "E-";
  duffy: "Fy(a+)" | "Fy(a-)";
  units: number;
  distanceKm: number;
  available: boolean;
  hoursToExpiry: number;
}

export interface Recipient {
  abo: Abo;
  rh: Rh;
  antibodies: Antibody[];
  unitsNeeded: number;
  urgency: Urgency;
  /** Chronic transfusion or child-bearing potential: antigen matching matters more. */
  chronicTransfusion: boolean;
}

export interface Constraints {
  maxDistanceKm: number;
  minHoursToExpiry: number;
  /** Simulates an emergency override that tolerates Rh mismatch. */
  allowRhMismatch: boolean;
}

export interface Factor {
  id: string;
  label: string;
  status: FactorStatus;
  detail: string;
}

export interface MatchResult {
  donor: Donor;
  verdict: Verdict;
  score: number;
  etaMinutes: number;
  factors: Factor[];
}

const ABO_OK: Record<Abo, Abo[]> = { O: ["O", "A", "B", "AB"], A: ["A", "AB"], B: ["B", "AB"], AB: ["AB"] };
const URGENCY_WINDOW_H: Record<Urgency, number> = { critical: 1, urgent: 4, routine: 24 };
const SPEED_KMH = 40;
const PREP_MIN = 15;

export function etaMinutes(km: number): number {
  return Math.round((km / SPEED_KMH) * 60 + PREP_MIN);
}

export const DEFAULT_CONSTRAINTS: Constraints = { maxDistanceKm: 30, minHoursToExpiry: 24, allowRhMismatch: false };

export function evaluateDonor(r: Recipient, d: Donor, c: Constraints): MatchResult {
  const factors: Factor[] = [];
  let score = 100;
  const push = (f: Factor, penalty = 0) => {
    factors.push(f);
    score -= penalty;
  };

  // ABO (red-cell compatibility)
  const aboOk = ABO_OK[d.abo].includes(r.abo);
  push(
    aboOk
      ? { id: "abo", label: "ABO compatibility", status: "pass", detail: `Donor ${d.abo} red cells are ABO-compatible with a ${r.abo} recipient.` }
      : { id: "abo", label: "ABO compatibility", status: "fail", detail: `Donor ${d.abo} red cells would react with recipient ${r.abo} antibodies.` },
    aboOk ? (d.abo === r.abo ? 0 : 4) : 100,
  );

  // Rh(D)
  const rhMismatch = d.rh === "+" && r.rh === "-";
  if (!rhMismatch) push({ id: "rh", label: "Rh(D) factor", status: "pass", detail: `Rh ${d.rh} donor is acceptable for an Rh ${r.rh} recipient.` }, d.rh === r.rh ? 0 : 2);
  else if (c.allowRhMismatch) push({ id: "rh", label: "Rh(D) factor", status: "warn", detail: "Rh-positive donor for an Rh-negative recipient, tolerated only under the emergency override. Risk of sensitization.", }, 22);
  else push({ id: "rh", label: "Rh(D) factor", status: "fail", detail: "Rh-positive donor for an Rh-negative recipient, with no emergency override enabled." }, 100);

  // Antibody vs antigen (hard failures)
  const clash: string[] = [];
  if (r.antibodies.includes("anti-K") && d.kell === "K+") clash.push("K antigen vs anti-K");
  if (r.antibodies.includes("anti-c") && d.rhc === "c+") clash.push("c antigen vs anti-c");
  if (r.antibodies.includes("anti-E") && d.rhe === "E+") clash.push("E antigen vs anti-E");
  if (r.antibodies.includes("anti-Fya") && d.duffy === "Fy(a+)") clash.push("Fy(a) antigen vs anti-Fya");
  if (clash.length)
    push({ id: "antibody", label: "Recipient antibodies", status: "fail", detail: `Donor carries an antigen the recipient has an antibody against: ${clash.join(", ")}.` }, 100);
  else
    push({ id: "antibody", label: "Recipient antibodies", status: "pass", detail: r.antibodies.length ? `No donor antigen matches the recipient's ${r.antibodies.join(", ")}.` : "No recipient antibodies reported." });

  // Minor antigen matching preference (chronic / child-bearing recipients)
  const exposure: string[] = [];
  if (!r.antibodies.includes("anti-K") && d.kell === "K+") exposure.push("K");
  if (!r.antibodies.includes("anti-c") && d.rhc === "c-") exposure.push("c");
  if (!r.antibodies.includes("anti-E") && d.rhe === "E+") exposure.push("E");
  if (r.chronicTransfusion && exposure.length)
    push({ id: "antigen", label: "Extended antigen match", status: "warn", detail: `Recipient needs extended matching; donor differs on ${exposure.join(", ")} (alloimmunization risk).` }, 8 + exposure.length * 4);
  else
    push({ id: "antigen", label: "Extended antigen match", status: "pass", detail: r.chronicTransfusion ? "Extended antigens look favourable for a chronic recipient." : "Extended matching not required for this recipient." });

  // Availability & quantity
  if (!d.available) push({ id: "availability", label: "Availability", status: "fail", detail: "Unit is currently not available." }, 100);
  else if (d.units < r.unitsNeeded)
    push({ id: "availability", label: "Availability", status: "warn", detail: `Only ${d.units} of ${r.unitsNeeded} required units at this site.` }, 12 + (r.unitsNeeded - d.units) * 3);
  else push({ id: "availability", label: "Availability", status: "pass", detail: `${d.units} units in stock, ${r.unitsNeeded} required.` });

  // Logistics vs urgency window
  const eta = etaMinutes(d.distanceKm);
  const windowMin = URGENCY_WINDOW_H[r.urgency] * 60;
  if (d.distanceKm > c.maxDistanceKm)
    push({ id: "distance", label: "Distance & transport", status: "fail", detail: `${d.distanceKm} km exceeds the ${c.maxDistanceKm} km limit.` }, 100);
  else if (eta > windowMin)
    push({ id: "distance", label: "Distance & transport", status: "fail", detail: `Estimated ${eta} min delivery exceeds the ${r.urgency} window of ${windowMin} min.` }, 100);
  else if (eta > windowMin * 0.6)
    push({ id: "distance", label: "Distance & transport", status: "warn", detail: `Estimated ${eta} min delivery uses most of the ${windowMin} min window.` }, 10);
  else push({ id: "distance", label: "Distance & transport", status: "pass", detail: `Estimated ${eta} min delivery fits the ${windowMin} min window.` }, Math.round((eta / windowMin) * 6));

  // Freshness
  if (d.hoursToExpiry < c.minHoursToExpiry)
    push({ id: "freshness", label: "Shelf life", status: "fail", detail: `${d.hoursToExpiry} h to expiry is below the ${c.minHoursToExpiry} h minimum.` }, 100);
  else if (d.hoursToExpiry < c.minHoursToExpiry * 2)
    push({ id: "freshness", label: "Shelf life", status: "warn", detail: `${d.hoursToExpiry} h to expiry: use soon (first-expiring-first-out).` }, 3);
  else push({ id: "freshness", label: "Shelf life", status: "pass", detail: `${d.hoursToExpiry} h to expiry.` });

  const hasFail = factors.some((f) => f.status === "fail");
  const hasWarn = factors.some((f) => f.status === "warn");
  const verdict: Verdict = hasFail ? "INCOMPATIBLE" : hasWarn ? "PARTIAL" : "MATCH";
  return { donor: d, verdict, score: hasFail ? 0 : Math.max(1, Math.min(100, Math.round(score))), etaMinutes: eta, factors };
}

const ORDER: Record<Verdict, number> = { MATCH: 0, PARTIAL: 1, INCOMPATIBLE: 2 };

export function rankDonors(r: Recipient, donors: Donor[], c: Constraints = DEFAULT_CONSTRAINTS): MatchResult[] {
  return donors
    .map((d) => evaluateDonor(r, d, c))
    .sort((a, b) => ORDER[a.verdict] - ORDER[b.verdict] || b.score - a.score || a.etaMinutes - b.etaMinutes || a.donor.code.localeCompare(b.donor.code));
}

export const DEMO_DONORS: Donor[] = [
  { code: "D-101", abo: "O", rh: "-", kell: "K-", rhc: "c+", rhe: "E-", duffy: "Fy(a+)", units: 4, distanceKm: 3.5, available: true, hoursToExpiry: 300 },
  { code: "D-102", abo: "O", rh: "+", kell: "K-", rhc: "c+", rhe: "E+", duffy: "Fy(a+)", units: 6, distanceKm: 8, available: true, hoursToExpiry: 220 },
  { code: "D-103", abo: "A", rh: "+", kell: "K-", rhc: "c+", rhe: "E-", duffy: "Fy(a-)", units: 3, distanceKm: 5.2, available: true, hoursToExpiry: 180 },
  { code: "D-104", abo: "A", rh: "-", kell: "K+", rhc: "c-", rhe: "E-", duffy: "Fy(a+)", units: 2, distanceKm: 12.4, available: true, hoursToExpiry: 260 },
  { code: "D-105", abo: "B", rh: "+", kell: "K-", rhc: "c+", rhe: "E+", duffy: "Fy(a+)", units: 5, distanceKm: 6.8, available: true, hoursToExpiry: 120 },
  { code: "D-106", abo: "B", rh: "-", kell: "K-", rhc: "c-", rhe: "E-", duffy: "Fy(a-)", units: 1, distanceKm: 15, available: true, hoursToExpiry: 90 },
  { code: "D-107", abo: "AB", rh: "+", kell: "K-", rhc: "c+", rhe: "E-", duffy: "Fy(a+)", units: 2, distanceKm: 4.1, available: true, hoursToExpiry: 200 },
  { code: "D-108", abo: "AB", rh: "-", kell: "K+", rhc: "c+", rhe: "E+", duffy: "Fy(a+)", units: 1, distanceKm: 22, available: false, hoursToExpiry: 150 },
  { code: "D-109", abo: "O", rh: "-", kell: "K+", rhc: "c-", rhe: "E-", duffy: "Fy(a-)", units: 3, distanceKm: 9.9, available: true, hoursToExpiry: 70 },
  { code: "D-110", abo: "A", rh: "+", kell: "K-", rhc: "c+", rhe: "E+", duffy: "Fy(a+)", units: 4, distanceKm: 2.7, available: true, hoursToExpiry: 280 },
];
