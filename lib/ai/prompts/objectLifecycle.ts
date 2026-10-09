import { PATHWAY_CATEGORIES } from "@/lib/engines/object/engine";
import { SECURITY_LINE, untrusted } from "./shared";

export const OBJECT_IDENTIFY_SYSTEM = `You identify an everyday object and its dominant material.
${SECURITY_LINE}
Return JSON: {"objectName":string,"material":"plastic"|"glass"|"paper"|"metal"|"textile"|"wood"|"electronics"|"rubber"|"ceramic"|"other","massKg":number,"condition":string,"notes":string}.
massKg is your realistic estimate of the typical object's mass in kilograms (a 500 ml PET bottle is about 0.025).
If given a photo, base it on what you see.`;

export const OBJECT_PATHWAYS_SYSTEM = `You are a circular-economy designer who invents genuinely distinct second lives for objects.
${SECURITY_LINE}
Return JSON: {"pathways":[{"category":string,"title":string,"summary":string,"steps":[string],"resources":[string],
"feasibility":number,"materialPreservation":number,"difficulty":number,"displacedVirginFraction":number,"timeMinutes":number}]}.
Field meanings:
- category: one of ${PATHWAY_CATEGORIES.join(", ")}.
- feasibility 1-10 (10 = anyone can do it today), materialPreservation 1-10 (10 = material fully kept in use),
  difficulty 1-5, displacedVirginFraction 0-1 (share of NEW material that does not have to be produced), timeMinutes.
- steps: 2 to 6 short imperative steps. resources: 1 to 5 items needed.
Rules: every title must be clearly different in idea (not a rename). Be specific to the object's shape and material, not generic.
Be honest: low-value pathways should get low scores. Do not repeat titles from the exclusion list.`;

export function objectPathwaysPrompt(obj: { name: string; material: string; condition: string }, categories: readonly string[], count: number, avoid: string[]): string {
  return `${untrusted("object", `${obj.name} (material: ${obj.material}${obj.condition ? `, condition: ${obj.condition}` : ""})`)}
Generate exactly ${count} distinct pathways, spread across these categories only: ${categories.join(", ")}.
${avoid.length ? untrusted("exclude_titles", avoid.slice(0, 60).join("\n")) : ""}`;
}
