import { EMISSION_FACTORS } from "./engine";
import type {
  Added, Category, ComponentKind, ComponentSpec, ConditionRating, Level, Lifetime, Material, ObjectForm, ObjectProfile, Retention, Reversible, Transform, Transport,
} from "./types";

/** Relative material value index (0..1). Heuristic ordering of scrap/resale value, not market prices. */
export const MATERIAL_VALUE: Record<Material, number> = { plastic: 0.25, glass: 0.15, paper: 0.1, metal: 0.7, textile: 0.3, wood: 0.25, electronics: 0.9, rubber: 0.2, ceramic: 0.1, other: 0.1 };

export const factorFor = (m: Material) => EMISSION_FACTORS[m].kgCo2ePerKg;

/* ============================================================ reference profiles (DATABASE provenance) */

type CompRow = [name: string, kind: ComponentKind, material: Material, massFraction: number, recoverability: number, separability: number, hazardous?: boolean];

interface RefProfile {
  name: string;
  aliases: string[];
  form: ObjectForm;
  massKg: number;
  condition: ConditionRating;
  conditionText: string;
  damage: string;
  contamination: ObjectProfile["contamination"]["level"];
  contaminationNote: string;
  reuse: number;
  repair: number;
  durability: number;
  comps: CompRow[];
}

export const REFERENCE_PROFILES: RefProfile[] = [
  {
    name: "plastic bottle", aliases: ["plastic bottle", "pet bottle", "water bottle", "soda bottle", "bottle"], form: "container", massKg: 0.025, condition: "worn", conditionText: "used, empty", damage: "none assumed", contamination: "medium", contaminationNote: "Residue from the former contents is likely.", reuse: 0.8, repair: 0.1, durability: 0.5,
    comps: [["bottle body", "container", "plastic", 0.86, 0.85, 0.9], ["screw cap", "closure", "plastic", 0.1, 0.8, 0.95], ["label sleeve", "other", "plastic", 0.04, 0.3, 0.6]],
  },
  {
    name: "old phone", aliases: ["old phone", "phone", "smartphone", "mobile phone", "cell phone", "mobile"], form: "device", massKg: 0.18, condition: "worn", conditionText: "used, no longer in daily use", damage: "unknown", contamination: "low", contaminationNote: "Personal data is stored on the device and must be wiped.", reuse: 0.7, repair: 0.55, durability: 0.5,
    comps: [["display assembly", "display", "glass", 0.22, 0.5, 0.6], ["lithium battery", "battery", "metal", 0.22, 0.6, 0.7, true], ["main board", "circuit_board", "electronics", 0.12, 0.7, 0.5], ["metal frame", "metal_part", "metal", 0.2, 0.85, 0.5], ["rear casing", "polymer_part", "plastic", 0.12, 0.6, 0.6], ["camera modules", "other", "electronics", 0.06, 0.6, 0.7], ["connectors and wiring", "wiring", "metal", 0.06, 0.6, 0.5]],
  },
  {
    name: "cardboard box", aliases: ["cardboard box", "cardboard", "carton", "shipping box", "box"], form: "box", massKg: 0.35, condition: "worn", conditionText: "used, flattened or intact", damage: "none assumed", contamination: "low", contaminationNote: "Tape and labels are minor contaminants; grease or moisture would reduce recyclability.", reuse: 0.85, repair: 0.3, durability: 0.35,
    comps: [["corrugated panels", "fiber_sheet", "paper", 0.9, 0.9, 0.9], ["packing tape", "other", "plastic", 0.05, 0.2, 0.7], ["printed label", "other", "paper", 0.03, 0.5, 0.8], ["staples", "fastener", "metal", 0.02, 0.5, 0.8]],
  },
  {
    name: "broken chair", aliases: ["broken chair", "chair", "wooden chair", "stool"], form: "furniture", massKg: 5, condition: "damaged", conditionText: "structurally damaged", damage: "loose or broken joint assumed", contamination: "low", contaminationNote: "Finish or varnish may limit some wood recovery routes.", reuse: 0.6, repair: 0.75, durability: 0.7,
    comps: [["seat panel", "wood_part", "wood", 0.3, 0.8, 0.7], ["backrest", "wood_part", "wood", 0.2, 0.75, 0.7], ["legs and frame", "structure", "wood", 0.36, 0.8, 0.6], ["fasteners and brackets", "fastener", "metal", 0.04, 0.6, 0.8], ["seat cushion", "cushion", "textile", 0.1, 0.4, 0.7]],
  },
  {
    name: "glass jar", aliases: ["glass jar", "jar", "mason jar", "glass bottle"], form: "container", massKg: 0.25, condition: "good", conditionText: "used, intact", damage: "none assumed", contamination: "low", contaminationNote: "Food residue and the label adhesive come off with washing.", reuse: 0.95, repair: 0.05, durability: 0.9,
    comps: [["jar body", "glass_body", "glass", 0.84, 0.95, 0.9], ["metal lid", "closure", "metal", 0.13, 0.8, 0.95], ["liner and label", "other", "plastic", 0.03, 0.2, 0.6]],
  },
  {
    name: "old clothing", aliases: ["old clothing", "clothing", "clothes", "garment", "shirt", "t-shirt", "jeans", "jacket", "dress"], form: "garment", massKg: 0.4, condition: "worn", conditionText: "worn", damage: "wear at seams assumed", contamination: "low", contaminationNote: "Stains reduce resale value; blended fibres complicate fibre-to-fibre recycling.", reuse: 0.7, repair: 0.8, durability: 0.5,
    comps: [["fabric body", "fabric", "textile", 0.8, 0.8, 0.8], ["zip and buttons", "fastener", "metal", 0.05, 0.6, 0.85], ["thread and seams", "fabric", "textile", 0.08, 0.3, 0.3], ["labels and trims", "fabric", "textile", 0.07, 0.3, 0.7]],
  },
  {
    name: "old laptop", aliases: ["old laptop", "laptop", "notebook computer", "macbook", "notebook"], form: "device", massKg: 2.2, condition: "worn", conditionText: "used, no longer in daily use", damage: "unknown", contamination: "low", contaminationNote: "The storage drive may hold personal data that must be wiped.", reuse: 0.7, repair: 0.7, durability: 0.6,
    comps: [["display panel", "display", "glass", 0.16, 0.5, 0.5], ["battery pack", "battery", "metal", 0.08, 0.55, 0.8, true], ["motherboard", "circuit_board", "electronics", 0.1, 0.7, 0.5], ["aluminium chassis", "metal_part", "metal", 0.3, 0.9, 0.5], ["storage drive", "storage", "electronics", 0.02, 0.8, 0.9], ["keyboard", "polymer_part", "plastic", 0.1, 0.6, 0.6], ["plastic bezel and casing", "polymer_part", "plastic", 0.12, 0.6, 0.6], ["cooling fan and heat sink", "metal_part", "metal", 0.04, 0.8, 0.7], ["memory modules", "circuit_board", "electronics", 0.01, 0.9, 0.95], ["internal wiring", "wiring", "metal", 0.03, 0.6, 0.5], ["hinges and screws", "fastener", "metal", 0.04, 0.7, 0.8]],
  },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** Match a typed name against the reference table. Longest alias wins; whole-word matches only. */
export function findReference(name: string): RefProfile | null {
  const n = ` ${norm(name)} `;
  let best: { p: RefProfile; len: number } | null = null;
  for (const p of REFERENCE_PROFILES) {
    for (const a of p.aliases) {
      if (n.includes(` ${norm(a)} `) && (!best || a.length > best.len)) best = { p, len: a.length };
    }
  }
  return best?.p ?? null;
}

export function profileFromReference(ref: RefProfile, opts: { typedName: string; userMassKg: number | null; imageUsed: boolean }): ObjectProfile {
  const massKg = opts.userMassKg ?? ref.massKg;
  const components: ComponentSpec[] = ref.comps.map((c, i) => ({
    id: `c${i + 1}`, name: c[0], kind: c[1], material: c[2], massFraction: c[3], massKg: round(massKg * c[3], 4), condition: ref.condition,
    recoverability: c[4], separability: c[5], hazardous: Boolean(c[6]), prov: "DATABASE",
  }));
  const shares = new Map<Material, number>();
  for (const c of components) shares.set(c.material, (shares.get(c.material) ?? 0) + c.massFraction);
  return {
    name: opts.typedName || ref.name, form: ref.form, nameProv: opts.typedName ? "USER_INPUT" : "DATABASE", massKg, massProv: opts.userMassKg ? "USER_INPUT" : "DATABASE",
    condition: ref.condition, conditionText: ref.conditionText, damage: ref.damage, conditionProv: "DATABASE",
    materials: [...shares].map(([material, share]) => ({ material, share: round(share, 3), prov: "DATABASE" as const })).sort((a, b) => b.share - a.share),
    components,
    contamination: { level: ref.contamination, note: ref.contaminationNote, prov: "DATABASE" },
    reusePotential: ref.reuse, repairPotential: ref.repair, durability: ref.durability, indexProv: "DATABASE",
    confidence: opts.typedName ? 0.85 : 0.75, notes: "Curated in-app reference profile for a typical object of this type. It is not a measurement of your specific item.",
    source: "reference", imageUsed: false,
  };
}

export const round = (n: number, d = 2) => {
  const f = 10 ** d;
  return Math.round(n * f) / f;
};

/* ============================================================ operation library (possibility space rules) */

export interface Op {
  k: string;
  c: Category;
  scope: "whole" | "component";
  forms?: ObjectForm[];
  /** whole: object has a material with share >= 0.3 in this list. component: component material in this list. */
  mats?: Material[];
  /** component scope: component kinds this applies to */
  kinds?: ComponentKind[];
  /** whole scope: object name must match */
  re?: RegExp;
  title: string;
  desc: string;
  steps: string[];
  tools: string[];
  mat: string[];
  skill: number;
  time: number;
  d: [Retention, Transform, Added, Lifetime, Level, Level, Transport, Reversible];
  /** component op that keeps the whole object in use (repair, upgrade) */
  whole?: boolean;
  comm?: boolean;
}

const op = (k: string, c: Category, scope: Op["scope"], m: Pick<Op, "forms" | "mats" | "kinds" | "re">, title: string, desc: string, steps: string[], tools: string[], mat: string[], skill: number, time: number, d: Op["d"], x: { whole?: boolean; comm?: boolean } = {}): Op => ({ k, c, scope, ...m, title, desc, steps, tools, mat, skill, time, d, ...x });

const ANY = {};
const CON = { forms: ["container"] as ObjectForm[] };
const DEV = { forms: ["device"] as ObjectForm[] };
const FUR = { forms: ["furniture"] as ObjectForm[] };
const GAR = { forms: ["garment"] as ObjectForm[] };
const BOX = { forms: ["box"] as ObjectForm[] };
const REP: ObjectForm[] = ["device", "furniture", "garment", "generic"];

export const OPERATIONS: Op[] = [
  /* ---- any object ---- */
  op("donate", "direct_reuse", "whole", ANY, "Donate {o} to a community reuse network", "Pass the object on intact so someone else uses it for its original purpose.", ["Clean and check that it still works", "Find a local charity, reuse centre or community group that accepts it", "Drop it off or arrange collection"], [], [], 1, 45, ["full", "none", "none", "long", "low", "high", "local", "yes"], { comm: true }),
  op("resell", "direct_reuse", "whole", ANY, "Resell {o} on a second-hand marketplace", "Keep the object in use through a resale channel and recover some of its value.", ["Clean and photograph it", "List it with an honest description of its condition", "Hand it over locally to limit transport"], ["phone camera"], [], 1, 60, ["full", "none", "none", "long", "medium", "high", "regional", "yes"]),
  op("lend", "direct_reuse", "whole", ANY, "Place {o} in a neighbourhood sharing library", "Shared ownership raises use per object and delays new purchases.", ["Clean it and label it for shared use", "Register it with a local library of things or neighbourhood group", "Set simple borrowing rules"], [], [], 1, 40, ["full", "none", "none", "medium", "low", "medium", "local", "yes"], { comm: true }),
  op("swap", "direct_reuse", "whole", ANY, "Trade {o} at a local swap event", "Exchange the object for something needed instead of discarding it.", ["Clean it", "Find or host a swap event", "Trade for something useful"], [], [], 1, 90, ["full", "none", "none", "medium", "low", "medium", "local", "yes"], { comm: true }),
  op("harvest-all", "component_reuse", "whole", ANY, "Disassemble {o} and bank the usable parts", "Treat the object as a parts store and keep each reusable part in circulation.", ["Photograph the object before taking it apart", "Separate parts by material and condition", "Keep or pass on the parts that still work"], ["screwdriver set", "sorting trays"], [], 2, 90, ["medium", "manual", "none", "medium", "medium", "medium", "local", "partly"]),
  op("prop-store", "adaptive_reuse", "whole", ANY, "Hand {o} to a theatre or film prop store", "Objects with visual character often work as props even when they no longer work as products.", ["Clean it", "Contact a local theatre, school or prop hire service", "Hand it over"], [], [], 1, 45, ["full", "none", "none", "medium", "low", "medium", "local", "yes"], { comm: true }),
  op("teach-prop", "adaptive_reuse", "whole", ANY, "Use {o} as a hands-on teaching specimen", "Schools and workshops use real objects to teach materials, repair and design.", ["Make the object safe to handle", "Offer it to a school, makerspace or repair workshop", "Add a short note on its materials"], [], [], 1, 60, ["high", "none", "none", "medium", "low", "medium", "local", "yes"], { comm: true }),
  op("makerspace", "adaptive_reuse", "whole", ANY, "Donate {o} to a makerspace for experiments", "Makerspaces accept objects as raw stock for prototypes.", ["Clean and sort the object", "Contact the makerspace to confirm they want it", "Drop it off"], [], [], 1, 60, ["high", "none", "none", "medium", "low", "medium", "local", "yes"], { comm: true }),
  op("sculpture", "creative_transformation", "whole", ANY, "Turn {o} into a sculpture or display piece", "A purely aesthetic second life that keeps the material in one piece.", ["Clean the object and choose a display idea", "Cut, arrange or mount it", "Finish and place it"], ["hand tools", "adhesive"], ["adhesive"], 2, 180, ["high", "manual", "minor", "long", "low", "low", "none", "partly"]),
  op("mixed-recovery", "material_recovery", "whole", ANY, "Deliver {o} to a mixed-material recovery point", "A recovery centre separates materials that household bins cannot.", ["Remove contents and obvious contaminants", "Take it to a municipal recovery centre", "Let the centre sort the material streams"], [], [], 1, 60, ["medium", "mechanical", "none", "none", "low", "medium", "regional", "partly"]),
  op("industrial-line", "industrial_recovery", "whole", ANY, "Feed {o} into an industrial sorting line", "Industrial sorting separates metals, polymers and fibres at a scale households cannot match.", ["Collect the object with similar waste", "Send it through a materials recovery facility", "Route each separated stream to a processor"], [], [], 1, 30, ["medium", "industrial", "none", "none", "low", "medium", "industrial", "partly"]),
  /* ---- repair of working objects ---- */
  op("clean-refurb", "repair", "whole", { forms: REP }, "Deep-clean and refurbish {o} for continued use", "Restoring appearance and function often removes the main reason for discarding it.", ["Clean every surface and joint", "Replace worn consumable parts", "Test and put it back in use"], ["cleaning supplies", "basic hand tools"], ["cleaning supplies"], 1, 90, ["full", "manual", "minor", "medium", "medium", "high", "none", "yes"]),
  op("repair-fault", "repair", "whole", { forms: REP }, "Diagnose and repair the fault in {o}", "Fixing the specific fault returns the whole object to service.", ["Identify the failed part", "Source a spare or repair the part", "Reassemble and test"], ["basic hand tools", "multimeter or inspection light"], ["replacement part"], 3, 150, ["high", "manual", "minor", "long", "medium", "high", "local", "yes"]),
  op("repair-cafe", "repair", "whole", { forms: REP }, "Take {o} to a community repair café", "Volunteers supply tools and skills, which lowers the barrier to repair.", ["Book a slot at a repair café", "Bring the object and any spare parts", "Repair it with a volunteer"], [], [], 1, 120, ["high", "manual", "minor", "long", "medium", "high", "local", "yes"], { comm: true }),
  op("pro-repair", "repair", "whole", { forms: REP }, "Send {o} to a professional repair service", "A specialist can fix faults that are hard for an owner to repair.", ["Get a quote", "Ship or deliver the object", "Test it after repair"], [], ["replacement parts"], 1, 60, ["high", "mechanical", "minor", "long", "medium", "high", "regional", "yes"]),
  op("service", "repair", "whole", { forms: ["device", "furniture"] }, "Service {o} to extend its working life", "Preventive servicing slows the wear that leads to disposal.", ["Inspect wear points", "Clean, tighten and lubricate", "Record the service date"], ["basic hand tools", "lubricant"], ["lubricant"], 2, 60, ["full", "manual", "minor", "medium", "low", "medium", "none", "yes"]),
  /* ---- containers ---- */
  op("refill-storage", "direct_reuse", "whole", { ...CON, mats: ["glass", "plastic", "metal", "ceramic"] }, "Reuse {o} for dry-goods storage", "A clean container with a closure stores food, screws or craft supplies.", ["Wash and dry thoroughly", "Remove the label", "Fill and label for its new job"], ["warm soapy water"], [], 1, 20, ["full", "none", "none", "long", "low", "high", "none", "yes"]),
  op("planter", "adaptive_reuse", "whole", { ...CON, mats: ["glass", "plastic", "metal", "ceramic"] }, "Convert {o} into a self-watering planter", "A wick moves water from a reservoir to the soil, so the object becomes a plant pot.", ["Make drainage and wick holes", "Fit a cotton wick between reservoir and soil", "Pot the plant and fill the reservoir"], ["drill or heated nail", "scissors"], ["cotton cord", "potting soil"], 2, 40, ["high", "manual", "minor", "medium", "low", "medium", "none", "yes"]),
  op("bird-feeder", "adaptive_reuse", "whole", { ...CON, mats: ["glass", "plastic"] }, "Make {o} into a hanging bird feeder", "Feeding ports and a perch turn the object into a feeder.", ["Cut feeding ports", "Add perches and a hanging cord", "Fill with seed and hang in shade"], ["knife or snips", "dowel"], ["cord", "seed"], 2, 45, ["high", "manual", "minor", "medium", "low", "low", "none", "partly"]),
  op("organizer", "adaptive_reuse", "whole", { ...CON, mats: ["plastic", "metal", "glass"] }, "Cut {o} into a desk organizer", "The body becomes a holder for pens, cables or tools.", ["Mark the cut line", "Cut and smooth the edges", "Decorate or use as is"], ["scissors or saw", "sandpaper"], ["sandpaper"], 2, 40, ["high", "manual", "none", "long", "low", "medium", "none", "partly"]),
  op("pendant-lamp", "upcycling", "whole", { ...CON, mats: ["glass"] }, "Upcycle {o} into a pendant lamp shade", "A glass body diffuses light and holds a low-voltage fitting.", ["Drill or fit the lamp socket through the lid", "Wire a certified low-voltage cord set", "Hang and test"], ["drill", "wire strippers"], ["lamp cord set", "bulb"], 3, 90, ["high", "manual", "moderate", "long", "medium", "medium", "none", "partly"]),
  op("terrarium", "adaptive_reuse", "whole", { ...CON, mats: ["glass", "plastic"] }, "Plant {o} as a closed terrarium", "A transparent container holds a small self-contained plant habitat.", ["Add drainage layers", "Add soil and small plants", "Seal and place in indirect light"], [], ["gravel", "soil", "plants"], 1, 45, ["high", "none", "moderate", "medium", "low", "medium", "none", "yes"]),
  op("scoop", "adaptive_reuse", "whole", { ...CON, mats: ["plastic"] }, "Cut {o} into a scoop and funnel set", "Angled cuts give a pet-food scoop, soil scoop and funnel from one body.", ["Mark angled cuts", "Cut and sand the edges", "Label each tool"], ["scissors or knife"], [], 1, 25, ["high", "manual", "none", "medium", "low", "medium", "none", "partly"]),
  op("drip", "adaptive_reuse", "whole", { ...CON, mats: ["plastic", "glass"] }, "Use {o} as a drip-irrigation reservoir", "A pierced cap lets water seep into the soil beside a plant.", ["Pierce a small hole in the closure", "Fill and invert beside the plant", "Refill as needed"], ["nail or pin"], [], 1, 15, ["high", "manual", "none", "short", "low", "medium", "none", "yes"]),
  op("coin-bank", "creative_transformation", "whole", { ...CON, mats: ["glass", "plastic", "metal"] }, "Make {o} into a savings jar", "A slot in the lid turns the container into a savings box.", ["Cut a coin slot in the lid or wall", "Decorate it", "Use it"], ["knife or file"], [], 1, 20, ["full", "manual", "none", "long", "low", "low", "none", "yes"]),
  op("ecobrick", "adaptive_reuse", "whole", { ...CON, mats: ["plastic"] }, "Pack {o} into an ecobrick building block", "Dense-packed clean plastic scraps turn the bottle into a modular block for garden furniture.", ["Dry the bottle fully", "Pack clean dry plastic scrap until rigid", "Join bricks into a bench or border"], ["packing stick"], ["clean plastic scrap"], 2, 120, ["medium", "manual", "moderate", "long", "low", "low", "local", "no"], { comm: true }),
  op("candle", "upcycling", "whole", { ...CON, mats: ["glass", "metal", "ceramic"] }, "Pour a candle in {o}", "A heat-safe vessel becomes a candle holder.", ["Clean the vessel and fix a wick", "Melt wax and pour", "Cure and trim the wick"], ["double boiler", "thermometer"], ["wax", "wick"], 3, 120, ["high", "thermal", "moderate", "medium", "low", "low", "none", "partly"]),
  op("vase", "adaptive_reuse", "whole", { ...CON, mats: ["glass", "plastic", "ceramic"] }, "Use {o} as a vase or brush pot", "A clean upright container holds flowers, brushes or utensils.", ["Clean and dry", "Remove the label", "Fill with water or tools"], [], [], 1, 15, ["full", "none", "none", "long", "low", "medium", "none", "yes"]),
  op("preserve", "direct_reuse", "whole", { ...CON, mats: ["glass"] }, "Refill {o} for home preserving", "Glass withstands heat sterilisation, so it is refilled many times.", ["Wash and sterilise", "Fit a new seal or lid", "Fill and store"], ["stock pot"], ["new seal"], 2, 60, ["full", "thermal", "minor", "extended", "low", "high", "none", "yes"]),
  op("dispenser", "upcycling", "whole", { ...CON, mats: ["glass", "plastic"] }, "Fit {o} with a pump to make a soap dispenser", "A pump top turns the container into a refillable dispenser.", ["Clean the container", "Fit a pump cut to height", "Refill with soap"], ["scissors"], ["pump top"], 1, 20, ["full", "manual", "minor", "long", "low", "medium", "none", "yes"]),
  op("deposit-return", "direct_reuse", "whole", { ...CON, mats: ["glass", "plastic"] }, "Return {o} through a deposit-refill scheme", "A closed loop where the producer cleans and refills the same container.", ["Rinse the container", "Return it to a participating store", "It is cleaned and refilled"], [], [], 1, 20, ["full", "industrial", "none", "extended", "low", "high", "regional", "yes"], { comm: true }),
  op("cullet", "industrial_recovery", "whole", { ...CON, mats: ["glass"] }, "Send {o} to a glass cullet remelting plant", "Glass is remelted indefinitely without losing quality when colours are kept apart.", ["Remove lid and rinse", "Sort by colour", "Deliver to a glass bank"], [], [], 1, 20, ["high", "industrial", "none", "none", "low", "high", "regional", "partly"]),
  op("plastic-recycle", "recycling", "whole", { mats: ["plastic"] }, "Recycle {o} as a clean, sorted polymer stream", "Sorted clean plastic can be shredded and re-pelletised.", ["Rinse and dry", "Keep it separate from other plastics", "Place in the correct collection stream"], [], [], 1, 15, ["high", "industrial", "none", "none", "low", "medium", "regional", "partly"]),
  op("chem-recycle", "industrial_recovery", "whole", { mats: ["plastic"] }, "Send {o} to advanced polymer recycling", "Chemical processes can handle polymer waste that mechanical recycling rejects.", ["Collect with similar polymer waste", "Send to a facility that accepts it", "Receive feedstock back into production"], [], [], 1, 20, ["medium", "chemical", "none", "none", "low", "medium", "industrial", "no"]),
  /* ---- boxes and paper ---- */
  op("reship", "direct_reuse", "whole", { ...BOX, mats: ["paper"] }, "Reuse {o} for shipping or storage", "A sound box can carry or store goods several more times.", ["Remove old labels and tape", "Check the corners", "Re-tape and reuse"], ["tape"], ["tape"], 1, 10, ["full", "none", "minor", "medium", "low", "high", "none", "yes"]),
  op("mulch", "adaptive_reuse", "whole", { mats: ["paper"] }, "Lay {o} as sheet mulch in a garden bed", "Cardboard suppresses weeds and decomposes into soil.", ["Remove tape and labels", "Lay flat and wet it", "Cover with compost or mulch"], [], ["mulch"], 1, 30, ["medium", "none", "minor", "short", "low", "low", "none", "no"]),
  op("card-shelf", "upcycling", "whole", { ...BOX, mats: ["paper"] }, "Build {o} into modular cardboard shelving", "Layered corrugated board is rigid enough for light shelving.", ["Cut panels to a pattern", "Laminate and glue the layers", "Seal the edges"], ["craft knife", "ruler"], ["glue"], 3, 180, ["high", "manual", "moderate", "medium", "low", "medium", "none", "no"]),
  op("playhouse", "creative_transformation", "whole", { ...BOX, mats: ["paper"] }, "Make {o} into a child's playhouse", "Large boxes become short-lived but well-used play structures.", ["Cut a door and windows", "Decorate", "Compost or recycle it afterwards"], ["craft knife"], ["paint"], 1, 90, ["medium", "manual", "minor", "short", "low", "low", "none", "yes"]),
  op("scratcher", "adaptive_reuse", "whole", { ...BOX, mats: ["paper"] }, "Cut {o} into a cat scratcher", "Layered corrugated strips make a cheap scratching surface.", ["Cut strips", "Pack them into a frame", "Present to the cat"], ["craft knife"], [], 1, 30, ["high", "manual", "none", "short", "low", "low", "none", "yes"]),
  op("dividers", "adaptive_reuse", "whole", { ...BOX, mats: ["paper"] }, "Fold {o} into drawer dividers", "Interlocking card strips organise a drawer without new materials.", ["Measure the drawer", "Cut and slot strips", "Fit and fill"], ["scissors"], [], 1, 30, ["high", "manual", "none", "medium", "low", "medium", "none", "yes"]),
  op("pulp", "upcycling", "whole", { mats: ["paper"] }, "Pulp {o} into handmade paper", "Soaked and blended fibres can be pressed into new sheets.", ["Tear and soak the board", "Blend into pulp", "Press and dry into sheets"], ["blender", "mould and deckle"], ["water"], 3, 240, ["medium", "mechanical", "minor", "short", "low", "medium", "none", "no"]),
  op("seed-pots", "adaptive_reuse", "whole", { mats: ["paper"] }, "Fold {o} into biodegradable seedling pots", "Paper pots can be planted directly into soil.", ["Cut strips", "Fold around a former", "Fill with soil and sow seed"], ["scissors"], ["soil", "seed"], 1, 30, ["medium", "manual", "minor", "short", "low", "low", "none", "no"]),
  op("paper-recycle", "recycling", "whole", { mats: ["paper"] }, "Flatten {o} for fibre recycling", "Clean paper fibre re-enters pulping about five to seven times.", ["Remove tape and labels", "Flatten and keep dry", "Place in paper collection"], [], [], 1, 10, ["high", "industrial", "none", "none", "low", "medium", "regional", "partly"]),
  /* ---- furniture and wood ---- */
  op("reglue", "repair", "whole", FUR, "Re-glue and reinforce the joints of {o}", "Most chair failures are joint failures, which are cheap to fix.", ["Disassemble the failed joint and scrape old glue", "Re-glue with wood glue and clamp", "Add a corner block for strength"], ["clamps", "chisel"], ["wood glue", "corner blocks"], 2, 120, ["full", "manual", "minor", "extended", "medium", "high", "none", "yes"]),
  op("refinish", "repair", "whole", FUR, "Strip and refinish {o}", "A new finish protects the wood and removes cosmetic damage.", ["Sand to bare wood", "Apply stain or oil", "Apply a protective coat"], ["sandpaper", "brush"], ["finish"], 2, 240, ["full", "manual", "moderate", "long", "medium", "high", "none", "yes"]),
  op("recover-seat", "repair", "whole", FUR, "Re-cover the seat of {o}", "New fabric over the existing foam gives a comfortable seat again.", ["Remove the old cover", "Cut and staple new fabric", "Refit the seat"], ["staple gun", "scissors"], ["fabric"], 2, 90, ["full", "manual", "moderate", "long", "medium", "high", "none", "yes"]),
  op("plant-stand", "adaptive_reuse", "whole", { forms: ["furniture"], mats: ["wood"] }, "Convert {o} into a plant stand", "A damaged seat can still hold a pot at a useful height.", ["Remove the damaged parts", "Level and stabilise the frame", "Seal and place"], ["saw", "sandpaper"], ["sealant"], 2, 90, ["high", "manual", "minor", "long", "low", "medium", "none", "partly"]),
  op("wall-shelf", "upcycling", "whole", { forms: ["furniture"], mats: ["wood"] }, "Saw {o} into wall-mounted shelves", "Seat and back panels become shelf boards.", ["Disassemble and sort the panels", "Cut and sand to length", "Fit brackets and mount"], ["saw", "drill"], ["brackets", "screws"], 3, 180, ["high", "mechanical", "moderate", "long", "medium", "medium", "none", "partly"]),
  op("coat-rack", "upcycling", "whole", { forms: ["furniture"], mats: ["wood"] }, "Make {o} into a wall coat rack", "A leg or backrest rail carries hooks.", ["Cut the rail", "Fit hooks", "Mount to studs"], ["saw", "drill"], ["hooks", "screws"], 2, 90, ["high", "mechanical", "minor", "long", "low", "medium", "none", "partly"]),
  op("low-stool", "upcycling", "whole", { forms: ["furniture"], mats: ["wood"] }, "Cut down {o} into a low stool", "Shortening the legs gives a stable stool.", ["Mark and cut legs", "Re-join and reinforce", "Sand and finish"], ["saw", "clamps"], ["wood glue"], 3, 150, ["high", "mechanical", "minor", "long", "low", "medium", "none", "partly"]),
  op("timber-salvage", "component_reuse", "whole", { mats: ["wood"] }, "Salvage the timber of {o} for small woodworking", "Solid wood offcuts are valuable stock for small builds.", ["Remove fasteners", "Plane or sand the faces", "Store by thickness"], ["pliers", "plane or sander"], [], 2, 90, ["high", "mechanical", "none", "long", "medium", "high", "none", "yes"]),
  op("wood-chip", "material_recovery", "whole", { mats: ["wood"] }, "Chip the wood of {o} into garden mulch", "Untreated wood returns to the soil as mulch.", ["Remove metal and finish", "Chip the wood", "Spread as mulch"], ["saw", "chipper"], [], 2, 90, ["medium", "mechanical", "none", "short", "low", "low", "local", "no"]),
  op("remanufacture-frame", "remanufacturing", "whole", FUR, "Remanufacture {o} with new panels on the original frame", "Keep the structural frame and replace the failed parts to a like-new standard.", ["Strip the frame", "Fit new panels and fixings", "Finish and inspect"], ["workshop tools"], ["new panels"], 4, 360, ["high", "mechanical", "moderate", "extended", "high", "high", "regional", "yes"]),
  /* ---- garments and textiles ---- */
  op("mend", "repair", "whole", GAR, "Mend seams and patch the holes of {o}", "Visible mending extends wear for years.", ["Mark weak seams and holes", "Re-stitch and patch", "Press and wear"], ["needle and thread"], ["thread", "patch fabric"], 1, 60, ["full", "manual", "minor", "long", "medium", "high", "none", "yes"]),
  op("alter", "repair", "whole", GAR, "Alter {o} to fit again", "Altering fit often lets an unworn item be worn again.", ["Try on and pin the changes", "Re-cut and re-stitch", "Press"], ["sewing machine"], ["thread"], 3, 120, ["full", "manual", "minor", "long", "medium", "high", "none", "yes"]),
  op("tote", "upcycling", "whole", { mats: ["textile"] }, "Sew {o} into a tote bag", "Sturdy fabric becomes a reusable carrier.", ["Cut panels and straps", "Sew seams", "Reinforce the handles"], ["sewing machine or needle"], ["thread"], 2, 90, ["high", "manual", "minor", "long", "low", "medium", "none", "partly"]),
  op("rags", "adaptive_reuse", "whole", { mats: ["textile"] }, "Cut {o} into cleaning cloths", "Cotton rags replace disposable wipes.", ["Cut into squares", "Hem if desired", "Wash and reuse"], ["scissors"], [], 1, 20, ["medium", "manual", "none", "short", "low", "medium", "none", "yes"]),
  op("quilt", "upcycling", "whole", { mats: ["textile"] }, "Piece {o} into a patchwork quilt or cushion cover", "Combining fabric scraps keeps them in use as a durable home textile.", ["Cut squares", "Piece and sew", "Quilt and bind"], ["sewing machine"], ["batting", "thread"], 3, 480, ["high", "manual", "moderate", "extended", "medium", "medium", "none", "partly"]),
  op("rag-rug", "upcycling", "whole", { mats: ["textile"] }, "Braid {o} into a rag rug", "Strips of fabric braided and stitched make a washable rug.", ["Cut strips", "Braid", "Coil and stitch"], ["scissors", "needle"], ["thread"], 2, 300, ["high", "manual", "minor", "long", "low", "medium", "none", "partly"]),
  op("pet-bed", "adaptive_reuse", "whole", { mats: ["textile"] }, "Stuff {o} into a pet bed", "Soft worn fabric makes comfortable bedding.", ["Sew a pouch", "Stuff with offcuts", "Close the seam"], ["needle"], ["thread"], 1, 60, ["high", "manual", "minor", "medium", "low", "low", "none", "partly"]),
  op("t-yarn", "upcycling", "whole", { mats: ["textile"] }, "Cut {o} into continuous fabric yarn", "A spiral cut makes yarn for knitting or crochet.", ["Cut a continuous strip", "Stretch to curl it", "Knit or crochet"], ["scissors"], [], 2, 90, ["high", "manual", "none", "long", "low", "medium", "none", "partly"]),
  op("overdye", "upcycling", "whole", { mats: ["textile"] }, "Overdye {o} to renew its colour", "New dye covers stains and faded areas.", ["Wash", "Dye in a bath", "Fix and rinse"], ["pot"], ["dye"], 3, 120, ["full", "chemical", "moderate", "medium", "medium", "medium", "none", "no"]),
  op("textile-recycle", "industrial_recovery", "whole", { mats: ["textile"] }, "Send {o} to fibre-to-fibre textile recycling", "Textile recyclers shred and respin fibres, subject to fibre blend.", ["Remove hard trims", "Take to a textile take-back point", "Recycler sorts by fibre"], [], [], 1, 30, ["medium", "industrial", "none", "none", "low", "medium", "regional", "partly"]),
  op("stuffing", "adaptive_reuse", "whole", { mats: ["textile"] }, "Shred {o} into stuffing for cushions", "Soft fabric offcuts replace new fill.", ["Cut into small pieces", "Stuff", "Close"], ["scissors"], [], 1, 45, ["medium", "manual", "none", "medium", "low", "medium", "none", "partly"]),
  /* ---- devices and electronics ---- */
  op("wipe-resell", "direct_reuse", "whole", DEV, "Wipe the data and resell {o}", "A working device is the highest-value use of its embodied material.", ["Back up and factory-reset", "Clean and test every function", "Sell or give to a verified buyer"], ["phone camera"], [], 1, 90, ["full", "none", "none", "long", "high", "high", "regional", "yes"]),
  op("refurbisher", "remanufacturing", "whole", DEV, "Route {o} to a certified refurbisher", "Refurbishers test, repair and warranty devices to a like-new standard.", ["Wipe data", "Ship to the programme", "Refurbisher grades and resells"], [], [], 1, 45, ["full", "mechanical", "minor", "extended", "high", "high", "regional", "yes"]),
  op("lite-os", "repair", "whole", { forms: ["device"], re: /laptop|notebook|computer|macbook/ }, "Install a lightweight operating system on {o}", "Old hardware often runs well on a lighter OS.", ["Back up data", "Create installation media", "Install and configure"], ["USB stick"], [], 3, 90, ["full", "manual", "none", "long", "medium", "high", "none", "yes"]),
  op("home-server", "adaptive_reuse", "whole", { forms: ["device"], re: /laptop|notebook|computer|macbook|phone/ }, "Repurpose {o} as a home file or media server", "A low-power always-on server is a common second job.", ["Install a server OS", "Configure storage and backups", "Place with ventilation"], ["network cable"], [], 3, 120, ["full", "manual", "none", "long", "medium", "high", "none", "yes"]),
  op("dashboard", "adaptive_reuse", "whole", { forms: ["device"] }, "Use {o} as a dedicated dashboard or photo frame", "A screen with a single job needs very little hardware.", ["Reset and install a kiosk app", "Mount it", "Connect to a power source"], ["stand or wall mount"], ["mount"], 2, 60, ["full", "manual", "minor", "long", "low", "medium", "none", "yes"]),
  op("camera-use", "adaptive_reuse", "whole", { forms: ["device"], re: /phone|mobile/ }, "Use {o} as a monitoring camera", "The camera and radio hardware suit a fixed camera role.", ["Reset and install a camera app", "Mount and power", "Secure the account"], ["mount"], ["mount"], 3, 60, ["full", "manual", "minor", "long", "low", "medium", "none", "yes"]),
  op("ewaste", "recycling", "whole", DEV, "Take {o} to a certified e-waste take-back", "Certified recyclers manage hazardous and valuable materials.", ["Wipe data", "Remove removable batteries if safe", "Deposit at an authorised point"], [], [], 1, 45, ["medium", "industrial", "none", "none", "medium", "medium", "regional", "partly"]),
  op("ewaste-metals", "industrial_recovery", "whole", DEV, "Send {o} to a precious-metal recovery refiner", "Refiners recover gold, copper and other metals from boards and connectors.", ["Collect through an authorised programme", "Separate boards and metals", "Refine"], [], [], 1, 30, ["medium", "industrial", "none", "none", "high", "medium", "industrial", "no"]),
  op("parts-sell", "component_reuse", "whole", DEV, "Harvest tested parts of {o} and sell them as spares", "Tested screens, drives and modules sustain other repairs.", ["Test each module", "Remove and label", "List as spares"], ["screwdriver set", "anti-static mat"], [], 3, 150, ["medium", "manual", "none", "long", "high", "high", "regional", "yes"]),
  /* ---- component scope ---- */
  op("c-battery-replace", "repair", "component", { kinds: ["battery"] }, "Replace the worn {c} so {o} stays in use", "A fresh battery restores the main reason the device was retired.", ["Obtain a certified replacement", "Replace using manufacturer guidance", "Recycle the old battery"], ["screwdriver set", "spudger"], ["replacement battery"], 3, 60, ["high", "manual", "minor", "long", "medium", "high", "regional", "yes"], { whole: true }),
  op("c-battery-recycle", "material_recovery", "component", { kinds: ["battery"] }, "Route the {c} to a certified battery recycler", "Lithium cells need dedicated recycling to recover cobalt, nickel and copper.", ["Tape the terminals", "Take to a certified drop-off", "Recycler recovers the metals"], [], [], 1, 30, ["medium", "industrial", "none", "none", "medium", "medium", "regional", "no"]),
  op("c-battery-second", "remanufacturing", "component", { kinds: ["battery"] }, "Send the {c} to a certified second-life battery programme", "Cells with remaining capacity can serve in stationary storage.", ["Enrol the part with a certified programme", "Testing grades capacity", "Cells are repackaged"], [], [], 1, 30, ["medium", "industrial", "none", "long", "medium", "medium", "industrial", "partly"]),
  op("c-screen-replace", "repair", "component", { kinds: ["display"] }, "Replace the {c} to revive {o}", "Screen failure is common and repairable.", ["Source a compatible screen", "Replace per service guide", "Test"], ["screwdriver set", "suction cup"], ["replacement screen"], 3, 90, ["high", "manual", "moderate", "long", "medium", "high", "regional", "yes"], { whole: true }),
  op("c-display-monitor", "component_reuse", "component", { kinds: ["display"] }, "Convert the {c} into a standalone monitor", "A driver board turns a laptop panel into an external display.", ["Identify the panel model", "Buy a matching driver board", "Mount in a frame"], ["screwdriver set"], ["driver board", "frame"], 4, 180, ["high", "manual", "moderate", "long", "medium", "high", "none", "yes"]),
  op("c-display-recover", "industrial_recovery", "component", { kinds: ["display"] }, "Send the {c} to a specialist display-panel recovery line", "Specialists separate glass, polarisers and electronics.", ["Deliver to an authorised e-waste channel", "Panel is separated", "Glass and metals enter recovery"], [], [], 1, 30, ["medium", "industrial", "none", "none", "low", "medium", "industrial", "no"]),
  op("c-storage-upgrade", "repair", "component", { kinds: ["storage"] }, "Upgrade or replace the {c} to extend the life of {o}", "A faster drive often fixes a slow device.", ["Back up data", "Install the new drive", "Restore"], ["screwdriver set"], ["new drive"], 2, 60, ["high", "manual", "moderate", "long", "medium", "high", "regional", "yes"], { whole: true }),
  op("c-storage-ext", "component_reuse", "component", { kinds: ["storage"] }, "Securely wipe the {c} and reuse it as external storage", "An enclosure turns an internal drive into portable storage.", ["Securely erase", "Fit an enclosure", "Format and use"], ["screwdriver"], ["drive enclosure"], 2, 40, ["full", "manual", "minor", "long", "medium", "high", "none", "yes"]),
  op("c-board-recover", "industrial_recovery", "component", { kinds: ["circuit_board"] }, "Send the {c} to circuit-board metal recovery", "Boards hold copper, gold and tin recoverable at specialist smelters.", ["Remove the board", "Deliver through an authorised channel", "Smelter recovers metals"], ["screwdriver"], [], 1, 30, ["medium", "industrial", "none", "none", "high", "medium", "industrial", "no"]),
  op("c-board-reuse", "component_reuse", "component", { kinds: ["circuit_board"] }, "Test and keep the {c} as a spare for repairs", "Working boards and modules serve other repairs.", ["Remove and test", "Label", "Store in an anti-static bag"], ["anti-static bag"], ["anti-static bag"], 3, 60, ["full", "manual", "none", "long", "medium", "high", "none", "yes"]),
  op("c-metal-remelt", "recycling", "component", { kinds: ["metal_part", "structure"], mats: ["metal"] }, "Send the {c} to scrap-metal remelting", "Metals are remelted with large energy savings versus primary production.", ["Remove non-metal parts", "Take to a scrap dealer", "Remelted into new stock"], ["screwdriver"], [], 1, 40, ["high", "industrial", "none", "none", "medium", "high", "regional", "partly"]),
  op("c-metal-hardware", "component_reuse", "component", { kinds: ["metal_part", "structure"], mats: ["metal"] }, "Repurpose the {c} as brackets or workshop stock", "Aluminium and steel sections have many structural uses.", ["Cut to size", "Deburr", "Use as stock"], ["hacksaw", "file"], [], 2, 60, ["high", "mechanical", "none", "long", "medium", "high", "none", "partly"]),
  op("c-poly-recycle", "recycling", "component", { kinds: ["polymer_part", "container", "closure", "other"], mats: ["plastic"] }, "Send the {c} to polymer recycling", "Separating polymer parts keeps the stream clean.", ["Remove from the object", "Sort by polymer type", "Deliver to recycling"], [], [], 1, 25, ["medium", "industrial", "none", "none", "low", "medium", "regional", "partly"]),
  op("c-poly-filament", "upcycling", "component", { kinds: ["polymer_part", "container"], mats: ["plastic"] }, "Process the {c} into 3D-printer filament or pellets", "Clean single-polymer parts can be shredded and extruded.", ["Identify polymer type", "Shred and wash", "Extrude"], ["shredder", "extruder"], [], 4, 240, ["medium", "thermal", "moderate", "long", "medium", "medium", "local", "no"]),
  op("c-poly-labels", "component_reuse", "component", { kinds: ["polymer_part", "container", "closure"], mats: ["plastic"] }, "Cut the {c} into plant labels and markers", "Flat polymer cut into strips makes durable garden markers.", ["Cut into strips", "Write with permanent marker", "Use in the garden"], ["scissors"], ["marker"], 1, 15, ["high", "manual", "none", "medium", "low", "low", "none", "partly"]),
  op("c-closure-collect", "recycling", "component", { kinds: ["closure"] }, "Collect the {c} for a closure-recycling scheme", "Separately collected closures can be recycled as a distinct stream.", ["Keep the closure", "Collect with others", "Deliver to the scheme"], [], [], 1, 10, ["medium", "industrial", "none", "none", "low", "medium", "local", "partly"], { comm: true }),
  op("c-closure-spare", "component_reuse", "component", { kinds: ["closure"] }, "Keep the {c} as a spare closure", "A matching closure fits other containers.", ["Clean", "Store", "Reuse"], [], [], 1, 5, ["full", "none", "none", "medium", "low", "low", "none", "yes"]),
  op("c-glass-tumbler", "upcycling", "component", { kinds: ["glass_body"] }, "Cut and polish the {c} into a drinking glass", "Scored glass bodies can be cut and fire-polished.", ["Score and cleave", "Sand the edge", "Wash"], ["glass cutter", "wet sandpaper"], ["sandpaper"], 4, 90, ["high", "mechanical", "minor", "long", "low", "medium", "none", "partly"]),
  op("c-glass-cullet", "recycling", "component", { kinds: ["glass_body"] }, "Crush the {c} into cullet for glass remelting", "Cullet lowers furnace energy for new glass.", ["Sort by colour", "Crush safely", "Deliver to a glass recycler"], ["gloves", "goggles"], [], 2, 30, ["high", "industrial", "none", "none", "low", "high", "regional", "partly"]),
  op("c-wood-salvage", "component_reuse", "component", { kinds: ["wood_part", "structure"], mats: ["wood"] }, "Salvage the {c} as timber stock", "Solid wood parts become stock for small projects.", ["Remove fasteners", "Clean up", "Store"], ["pliers", "sander"], [], 2, 60, ["high", "mechanical", "none", "long", "medium", "high", "none", "yes"]),
  op("c-fabric-squares", "component_reuse", "component", { kinds: ["fabric"], mats: ["textile"] }, "Cut the {c} into reusable squares", "Fabric squares are used for patches, wraps and craft.", ["Cut", "Hem", "Store"], ["scissors"], [], 1, 30, ["medium", "manual", "none", "medium", "low", "medium", "none", "yes"]),
  op("c-cushion-fill", "component_reuse", "component", { kinds: ["cushion"] }, "Reuse the {c} filling in other cushions", "Foam or fibre fill keeps its function.", ["Remove the cover", "Check for damage", "Refit elsewhere"], ["scissors"], [], 1, 30, ["medium", "manual", "none", "medium", "low", "medium", "none", "yes"]),
  op("c-fastener-stock", "component_reuse", "component", { kinds: ["fastener"] }, "Sort the {c} into hardware stock", "Screws, brackets and buttons are reused across repairs.", ["Remove", "Sort by size", "Store"], ["pliers"], [], 1, 20, ["full", "manual", "none", "long", "low", "medium", "none", "yes"]),
  op("c-wire-copper", "material_recovery", "component", { kinds: ["wiring"] }, "Strip the {c} for copper recovery", "Clean copper has high scrap value.", ["Remove cables", "Strip insulation", "Deliver to a metal recycler"], ["wire strippers"], [], 2, 45, ["medium", "mechanical", "none", "none", "medium", "medium", "regional", "no"]),
  op("c-rubber-gasket", "component_reuse", "component", { kinds: ["rubber_part"] }, "Cut the {c} into gaskets and grips", "Rubber offcuts replace small seals.", ["Cut", "Test fit", "Use"], ["scissors"], [], 1, 20, ["high", "manual", "none", "medium", "low", "low", "none", "partly"]),
  op("c-ceramic-drain", "adaptive_reuse", "component", { kinds: ["ceramic_part"] }, "Crush the {c} as drainage material for planters", "Broken ceramic improves drainage.", ["Break safely", "Rinse", "Layer in pots"], ["gloves", "goggles"], [], 1, 20, ["medium", "mechanical", "none", "medium", "low", "low", "none", "no"]),
  op("c-sort-contam", "material_recovery", "component", { kinds: ["other"] }, "Remove and sort the {c} so the main stream stays clean", "Labels, tape and liners lower recycling yield if left on.", ["Peel or cut off", "Dispose of separately", "Send the cleaned part for recycling"], ["scissors"], [], 1, 10, ["low", "manual", "none", "none", "low", "low", "none", "no"]),
  op("c-fiber-recycle", "recycling", "component", { kinds: ["fiber_sheet"] }, "Send the {c} to fibre recycling", "Corrugated fibre is a high-yield recycling stream.", ["Flatten", "Keep dry", "Deliver to paper collection"], [], [], 1, 10, ["high", "industrial", "none", "none", "low", "medium", "regional", "partly"]),
];

export const OPERATION_COUNT = OPERATIONS.length;

export const TYPES_FOR_PROMPT = { transform: ["none", "manual", "mechanical", "thermal", "chemical", "industrial"] as Transform[], lifetime: ["none", "short", "medium", "long", "extended"] as Lifetime[], added: ["none", "minor", "moderate", "major"] as Added[], transport: ["none", "local", "regional", "industrial"] as Transport[], reversible: ["yes", "partly", "no"] as Reversible[], level: ["none", "low", "medium", "high"] as Level[] };
