export type ExperimentSlug = "blood" | "nutrition" | "gamezero" | "trust" | "object" | "expiry";

export interface ExperimentMeta {
  slug: ExperimentSlug;
  index: number;
  name: string;
  short: string;
  shortDomain: "HEALTH" | "SUSTAINABILITY" | "AI" | "CYBER" | "CLIMATE" | "FINTECH";
  domain: string;
  tagline: string;
  objective: string;
  tenSeconds: string;
  hue: string;
  /** The five-stage flow shown on every experiment page. */
  flow: [string, string, string, string, string];
  impact: string;
  primarySdgs: number[];
  secondarySdgs: number[];
  why: string;
  sdgReason: Record<number, string>;
  notice?: string;
  href: string;
}

export const EXPERIMENTS: ExperimentMeta[] = [
  {
    slug: "blood",
    index: 1,
    name: "Digital Blood Bank Without Blood Types",
    short: "Blood Network",
    shortDomain: "HEALTH",
    domain: "Healthcare & Infrastructure",
    tagline: "Compatibility is a network, not a label.",
    objective: "Rank donor units by multi-factor compatibility, logistics and urgency instead of just a blood group.",
    tenSeconds: "A blood group is one label. Real matching also weighs antibodies, antigens, distance, shelf life and urgency. Describe a patient and watch a living network rank every donor unit with reasons.",
    hue: "#ff6b7a",
    flow: ["Recipient & constraints", "Compatibility engine", "Living network", "Ranked donors", "Faster, safer matching"],
    impact: "Shows how emergency matching can use far more than ABO/Rh, treating blood supply as logistics-aware infrastructure.",
    primarySdgs: [3],
    secondarySdgs: [9],
    why: "Delays and mismatches in transfusion cost lives. Making the full compatibility picture visible helps reason about supply, risk and speed together.",
    sdgReason: { 3: "Supports faster, better-informed transfusion decisions in emergencies.", 9: "Treats the blood supply as infrastructure with logistics and inventory visibility." },
    notice: "Educational / simulation prototype — not for clinical use.",
    href: "/experiments/blood",
  },
  {
    slug: "nutrition",
    index: 2,
    name: "AI Nutrition From Waste",
    short: "Waste to Meal",
    shortDomain: "SUSTAINABILITY",
    domain: "Health + Climate",
    tagline: "Turn leftovers into balanced meals.",
    objective: "Convert ingredients that would be thrown away into meals with an estimated nutrition profile and waste avoided.",
    tenSeconds: "Type what is about to be wasted, or photograph it. The AI identifies the ingredients and designs real meals; nutrition is computed from reference values and clearly marked as an estimate.",
    hue: "#9be86a",
    flow: ["Waste", "Ingredients", "Nutrition", "Meal", "Waste avoided"],
    impact: "Every meal cooked from would-be waste keeps food, money and emissions out of the bin.",
    primarySdgs: [2, 12],
    secondarySdgs: [3, 13],
    why: "A large share of food is wasted while people go hungry. Small kitchen decisions add up.",
    sdgReason: { 2: "Turns food that would be discarded into usable meals.", 12: "Reduces household and retail food waste.", 3: "Surfaces approximate nutrition to support healthier eating.", 13: "Avoided food waste avoids associated emissions." },
    notice: "Nutrition values are estimates, not dietary advice.",
    href: "/experiments/nutrition",
  },
  {
    slug: "gamezero",
    index: 3,
    name: "GameZero",
    short: "GameZero",
    shortDomain: "AI",
    domain: "AI & Intelligent Systems",
    tagline: "An AI that learns a game from one example.",
    objective: "Infer hidden game rules from demonstrations, reject contradicted hypotheses, then play.",
    tenSeconds: "The rules of this board are hidden, even from the AI. Make a move. The agent forms hypotheses, runs its own experiments, rejects whatever reality contradicts, and then plays to win.",
    hue: "#7aa2ff",
    flow: ["Demonstrate", "Hypothesize & test", "Reject & refine", "Learned rules", "Plays the game"],
    impact: "Demonstrates sample-efficient, explainable learning where every belief can be audited.",
    primarySdgs: [9],
    secondarySdgs: [17],
    why: "AI that learns from few examples and explains its reasoning is cheaper to build and easier to trust.",
    sdgReason: { 9: "Sample-efficient, explainable machine learning is innovation infrastructure.", 17: "Transparent reasoning is easier to audit and share." },
    href: "/experiments/gamezero",
  },
  {
    slug: "trust",
    index: 4,
    name: "Trust Without Identity",
    short: "Zero-Knowledge Proof",
    shortDomain: "CYBER",
    domain: "Cybersecurity & Digital Safety",
    tagline: "Prove it without revealing it.",
    objective: "Prove age >= 18 with a real zero-knowledge range proof, without revealing the date of birth.",
    tenSeconds: "Enter a date of birth. Your browser builds a cryptographic proof that you are 18 or older and sends only that proof to the verifier. The verifier learns the answer and nothing else.",
    hue: "#b48bff",
    flow: ["Private data", "Proof generation", "Verifier", "Valid / invalid", "Privacy preserved"],
    impact: "Shows how services can check eligibility without collecting or leaking identity documents.",
    primarySdgs: [16],
    secondarySdgs: [10, 9],
    why: "Every copy of a personal document is a breach waiting to happen. Proving a fact instead of handing over the data removes the risk.",
    sdgReason: { 16: "Strengthens digital trust and protects personal privacy.", 10: "Lets people prove eligibility without handing over full identity.", 9: "Privacy-preserving verification is core digital infrastructure." },
    notice: "Demonstration cryptography, not production-grade.",
    href: "/experiments/trust",
  },
  {
    slug: "object",
    index: 5,
    name: "One Object, 100 Lives",
    short: "Life Tree",
    shortDomain: "CLIMATE",
    domain: "Climate & Sustainable Technology",
    tagline: "Every object has more than one future.",
    objective: "Generate and rank up to 100 second-life pathways for an object, with transparent assumptions.",
    tenSeconds: "Name an object or photograph it. The AI invents up to 100 distinct second lives. A transparent scoring model ranks them and grows a 3D tree from the object at its center.",
    hue: "#5fe3a1",
    flow: ["Object", "Material identified", "100 pathways", "Ranked life tree", "Waste & CO2e avoided"],
    impact: "Keeps materials in use longer and makes the environmental reasoning visible, assumption by assumption.",
    primarySdgs: [12, 13],
    secondarySdgs: [11],
    why: "The cheapest emission is the one never produced. Reuse and recovery start with seeing the options.",
    sdgReason: { 12: "Extends product life and keeps materials in use.", 13: "Reuse and recovery avoid emissions from new production.", 11: "Reduces municipal waste volume." },
    notice: "Environmental figures are indicative estimates with stated assumptions.",
    href: "/experiments/object",
  },
  {
    slug: "expiry",
    index: 6,
    name: "EXPIRY",
    short: "Programmable Money Engine",
    shortDomain: "FINTECH",
    domain: "Fintech & Digital Economy",
    tagline: "Money is no longer just an amount. It is a set of executable rules.",
    objective: "A deterministic policy engine for programmable money: compile rules, enforce them on every transaction, expire on a real timestamp and log everything in a hash-chained ledger.",
    tenSeconds: "Describe a rule in plain language, compile it into a structured policy, issue money bound to purpose, recipient, limit and a real expiry, then watch a deterministic engine approve or reject every transaction with an exact rule trace.",
    hue: "#f2c260",
    flow: ["Compile policy", "Money object", "Transaction request", "Verification", "State + ledger"],
    impact: "Shows how aid and benefits can be bound to their intended use and time window.",
    primarySdgs: [8],
    secondarySdgs: [1, 10],
    why: "Aid that is spent on its intended purpose reaches the people it was meant for.",
    sdgReason: { 8: "Programmable money can direct funds to their intended economic use.", 1: "Purpose-bound aid can protect benefits for people in need.", 10: "Targeted, rule-bound transfers can improve inclusion." },
    href: "/experiments/expiry",
  },
];

export const bySlug = (slug: string) => EXPERIMENTS.find((e) => e.slug === slug);
