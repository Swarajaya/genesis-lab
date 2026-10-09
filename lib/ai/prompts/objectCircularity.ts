import { CATEGORIES, COMPONENT_KINDS, OBJECT_FORMS, type Category, type ObjectProfile } from "@/lib/engines/object/types";
import { MATERIALS } from "@/lib/engines/object/engine";
import { SECURITY_LINE, untrusted } from "./shared";

export const OBJECT_ANALYSIS_SYSTEM = `You are a materials analyst describing an everyday object for a circular-economy tool.
${SECURITY_LINE}
Return ONLY JSON:
{"objectName":string,"form":${OBJECT_FORMS.map((f) => `"${f}"`).join("|")},"massKg":number,"condition":"good"|"worn"|"damaged"|"unknown","conditionText":string,"damage":string,
"contaminationLevel":"low"|"medium"|"high"|"unknown","contaminationNote":string,"reusePotential":0..1,"repairPotential":0..1,"durability":0..1,"confidence":0..1,"notes":string,
"components":[{"name":string,"kind":${COMPONENT_KINDS.map((k) => `"${k}"`).join("|")},"material":${MATERIALS.map((m) => `"${m}"`).join("|")},"massFraction":0..1,"condition":"good"|"worn"|"damaged"|"unknown","recoverability":0..1,"separability":0..1,"hazardous":boolean,"visible":boolean}]}
Rules:
- List 3 to 12 physical components that a person could actually separate. massFractions should sum to about 1.
- massKg is the typical mass of such an object in kilograms. If unsure, give the typical value and lower "confidence".
- "visible" is true ONLY for components you can actually see in the photo. Inferred internal parts are false.
- Never claim exact composition. Use the closest material label. recoverability and separability are rough 0..1 judgements, not measurements.
- hazardous is true for lithium batteries and similar parts that must not be dismantled at home.
- If a photo is given, describe what is visible: damage, wear, contamination. If a typed name is also given, treat the name as the user's statement.`;

const DESCRIPTORS = `Descriptor bands (use these exact words, never numbers):
retention: none|low|medium|high|full  (how much of the object's material stays in use or in a recovery loop)
transform: none|manual|mechanical|thermal|chemical|industrial
added: none|minor|moderate|major  (new materials or parts needed)
lifetime: none|short|medium|long|extended  (useful life added: <1y, ~2y, ~6y, 10y+)
value: none|low|medium|high  (economic value of the result)
displaces: none|low|medium|high  (how much new production it avoids)
transport: none|local|regional|industrial
reversible: yes|partly|no
skill: 1-5, timeMinutes: integer`;

export const CANDIDATE_SYSTEM = `You are a circular-economy designer proposing genuinely different second-life pathways for a specific object.
${SECURITY_LINE}
You PROPOSE pathways and describe them with qualitative bands. You never compute scores; a separate deterministic engine does that.
Return ONLY JSON: {"pathways":[{"category":${CATEGORIES.map((c) => `"${c}"`).join("|")},"title":string,"description":string,"steps":[string],"tools":[string],"materials":[string],"component":string,"community":boolean,"retention":..,"transform":..,"added":..,"lifetime":..,"value":..,"displaces":..,"transport":..,"reversible":..,"skill":number,"timeMinutes":number}]}
${DESCRIPTORS}
Rules:
- "component" is the exact name of ONE listed component this pathway acts on, or "" when it acts on the whole object.
- Every title must describe a clearly different idea, specific to this object's shape and materials. No renames, no generic filler.
- steps: 2 to 6 short imperative steps. tools and materials: only what is truly needed.
- Be honest: low-value or hard pathways get low-value bands. Do not propose dismantling batteries at home.
- Do not repeat titles from the exclusion list.`;

export function profileBrief(p: ObjectProfile): string {
  const comps = p.components.map((c) => `${c.name} (${c.material}, ${Math.round(c.massFraction * 100)}%)`).join("; ");
  return `${p.name}; form: ${p.form}; condition: ${p.condition}${p.damage ? ` (${p.damage})` : ""}; mass ≈ ${p.massKg} kg; components: ${comps}`;
}

export function candidatePrompt(p: ObjectProfile, categories: Category[], perCategory: number, exclude: string[]): string {
  return `${untrusted("object", profileBrief(p))}
Generate exactly ${perCategory} distinct pathways for EACH of these categories only: ${categories.join(", ")}.
${exclude.length ? untrusted("exclude_titles", exclude.slice(0, 80).join("\n")) : ""}`;
}

export const EXPLAIN_SYSTEM = `You explain the output of a deterministic circularity scoring model to a researcher.
${SECURITY_LINE}
Return ONLY JSON: {"summary":string,"points":[string]}.
Rules:
- Use ONLY the numbers provided. Never introduce, round differently, or invent any figure. Never claim certainty.
- summary: 2 sentences. points: 2 to 4 short sentences on why the ranking is what it is and the main trade-off.
- Emissions values are indicative heuristics, not life-cycle results. Say so if you mention them.
- For a comparison, state which pathway wins on which dimension and what it costs.`;
