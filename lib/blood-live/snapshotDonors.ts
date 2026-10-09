import type { LiveDonor } from "@/lib/engines/blood/liveTypes";
import type { Snapshot } from "@/lib/engines/blood/live";

/** Rebuilds engine donors from a client-safe snapshot (antigens included). */
export function allDonorsFromSnapshot(snap: Snapshot): LiveDonor[] {
  return snap.donors.map((d) => ({
    code: d.code, abo: d.abo, rh: d.rh, kell: d.kell, rhc: d.rhc, rhe: d.rhe, duffy: d.duffy, units: d.units, distanceKm: d.distanceKm, hoursToExpiry: d.hoursToExpiry,
    status: d.status === "OFFLINE" ? "offline" : d.status === "EXPIRED" ? "expired" : "online", source: d.source, participantId: d.participantId, zone: d.zone,
  }));
}
