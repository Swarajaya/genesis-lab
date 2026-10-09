import type { Material } from "./engine";

/**
 * Types for the Experiment 05 circularity engine.
 * Rule of the architecture: AI proposes and interprets, the deterministic engine validates and scores.
 */

export type { Material };

/** Where a value came from. Shown next to every uncertain metric in the UI. */
export type Provenance = "USER_INPUT" | "VISION" | "MODEL_ESTIMATE" | "DATABASE" | "HEURISTIC" | "UNKNOWN";

export const PROVENANCE_LABEL: Record<Provenance, string> = {
  USER_INPUT: "USER INPUT",
  VISION: "VISION INFERENCE",
  MODEL_ESTIMATE: "MODEL ESTIMATE",
  DATABASE: "DATABASE",
  HEURISTIC: "HEURISTIC",
  UNKNOWN: "UNKNOWN",
};

export const MATERIAL_LABEL: Record<Material, string> = {
  plastic: "Polymer",
  glass: "Glass",
  paper: "Fibre / paper",
  metal: "Metal",
  textile: "Textile",
  wood: "Wood",
  electronics: "Electronics",
  rubber: "Rubber",
  ceramic: "Ceramic",
  other: "Other",
};

export const COMPONENT_KINDS = [
  "structure", "container", "closure", "fabric", "glass_body", "circuit_board", "battery", "display", "storage",
  "metal_part", "polymer_part", "fastener", "wood_part", "fiber_sheet", "rubber_part", "ceramic_part", "wiring", "cushion", "other",
] as const;
export type ComponentKind = (typeof COMPONENT_KINDS)[number];

export const OBJECT_FORMS = ["container", "box", "furniture", "garment", "device", "generic"] as const;
export type ObjectForm = (typeof OBJECT_FORMS)[number];

export const CATEGORIES = [
  "direct_reuse", "repair", "adaptive_reuse", "upcycling", "component_reuse",
  "material_recovery", "recycling", "remanufacturing", "industrial_recovery", "creative_transformation",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_META: Record<Category, { label: string; color: string; hint: string }> = {
  direct_reuse: { label: "DIRECT REUSE", color: "#5fe3a1", hint: "Used again as it is" },
  repair: { label: "REPAIR", color: "#7be0d0", hint: "Restored to working order" },
  adaptive_reuse: { label: "ADAPTIVE REUSE", color: "#6fb8ff", hint: "Given a different job" },
  upcycling: { label: "UPCYCLING", color: "#b49bff", hint: "Rebuilt into something of higher value" },
  component_reuse: { label: "COMPONENT REUSE", color: "#e6d36a", hint: "Parts kept in use" },
  material_recovery: { label: "MATERIAL RECOVERY", color: "#ff9a6b", hint: "Materials separated and recovered" },
  recycling: { label: "RECYCLING", color: "#f2c260", hint: "Back into the material stream" },
  remanufacturing: { label: "REMANUFACTURING", color: "#4fd1c5", hint: "Rebuilt to a like-new standard" },
  industrial_recovery: { label: "INDUSTRIAL RECOVERY", color: "#ff7d95", hint: "Specialist industrial processing" },
  creative_transformation: { label: "CREATIVE TRANSFORM", color: "#e58cff", hint: "Open-ended transformation" },
};

/* ---- qualitative descriptors. Models and library rules express pathways with these bands only. ---- */
export const RETENTION = ["none", "low", "medium", "high", "full"] as const;
export const TRANSFORM = ["none", "manual", "mechanical", "thermal", "chemical", "industrial"] as const;
export const ADDED = ["none", "minor", "moderate", "major"] as const;
export const LIFETIME = ["none", "short", "medium", "long", "extended"] as const;
export const LEVEL = ["none", "low", "medium", "high"] as const;
export const TRANSPORT = ["none", "local", "regional", "industrial"] as const;
export const REVERSIBLE = ["yes", "partly", "no"] as const;
export type Retention = (typeof RETENTION)[number];
export type Transform = (typeof TRANSFORM)[number];
export type Added = (typeof ADDED)[number];
export type Lifetime = (typeof LIFETIME)[number];
export type Level = (typeof LEVEL)[number];
export type Transport = (typeof TRANSPORT)[number];
export type Reversible = (typeof REVERSIBLE)[number];

export interface Descriptors {
  retention: Retention;
  transform: Transform;
  added: Added;
  lifetime: Lifetime;
  value: Level;
  displaces: Level;
  transport: Transport;
  reversible: Reversible;
  skill: number;
  timeMinutes: number;
}

export type ConditionRating = "good" | "worn" | "damaged" | "unknown";

export interface ComponentSpec {
  id: string;
  name: string;
  kind: ComponentKind;
  material: Material;
  /** Share of total object mass, 0..1 (sums to 1 across components). */
  massFraction: number;
  massKg: number;
  condition: ConditionRating;
  /** 0..1 chance the part can be kept in use or recovered if handled properly. */
  recoverability: number;
  /** 0..1 how easily it separates from the rest. */
  separability: number;
  hazardous: boolean;
  prov: Provenance;
}

export interface MaterialShare {
  material: Material;
  share: number;
  prov: Provenance;
}

export interface ObjectProfile {
  name: string;
  form: ObjectForm;
  nameProv: Provenance;
  massKg: number;
  massProv: Provenance;
  condition: ConditionRating;
  conditionText: string;
  damage: string;
  conditionProv: Provenance;
  materials: MaterialShare[];
  components: ComponentSpec[];
  contamination: { level: "low" | "medium" | "high" | "unknown"; note: string; prov: Provenance };
  /** 0..1 */
  reusePotential: number;
  repairPotential: number;
  durability: number;
  indexProv: Provenance;
  /** 0..1 overall trust in this profile (identity source x model self-report). */
  confidence: number;
  notes: string;
  source: "model" | "reference";
  imageUsed: boolean;
}

export interface Constraint {
  id: string;
  label: string;
  effect: string;
  prov: Provenance;
}

export type Target = { kind: "whole" } | { kind: "component"; componentId: string; wholeEffect: boolean };

export interface Candidate extends Descriptors {
  key: string;
  title: string;
  category: Category;
  description: string;
  steps: string[];
  tools: string[];
  skills: string[];
  materials: string[];
  target: Target;
  community: boolean;
  source: "library" | "model";
  assumptions: string[];
  notes: string[];
}

export interface Metrics {
  materialRetained: number;
  wasteDivertedKg: number;
  lifetimeYears: number;
  emissionsKg: number;
  displacement: number;
  processingBurden: number;
  additionalInputs: number;
  transportBurden: number;
  energyBurden: number;
  transformationCost: number;
  componentRecovery: number;
  reversibility: number;
  futureRecovery: number;
  feasibility: number;
  economic: number;
}

export interface CiTerm {
  key: string;
  label: string;
  /** raw 0..1 value of the term */
  value: number;
  weight: number;
  /** signed points on the 0..100 index */
  points: number;
}

export interface ScoreCard {
  metrics: Metrics;
  environmental: number;
  circularityDim: number;
  practicality: number;
  economicDim: number;
  transformation: number;
  circularityIndex: number;
  contributors: CiTerm[];
  penalties: CiTerm[];
  composite: number;
  confidence: number;
}

export interface Pathway extends Candidate {
  id: string;
  num: number;
  rank: number;
  score: ScoreCard;
}

export interface BaselineFuture {
  title: string;
  score: ScoreCard;
  assumptions: string[];
}

export interface PipelineStats {
  generatedLibrary: number;
  generatedModel: number;
  generatedTotal: number;
  adjusted: number;
  rejected: number;
  rejectReasons: Record<string, number>;
  evaluated: number;
  duplicatesRemoved: number;
  selected: number;
  categoriesPresent: number;
  rounds: number;
}

export interface EngineEvent {
  /** epoch ms recorded by the server when the stage actually completed */
  at: number;
  code: string;
  label: string;
  detail?: string;
}

export interface ObjectNotice {
  code: string;
  message: string;
}

export interface MaterialDna {
  shares: MaterialShare[];
  recoverability: number;
  repairability: number;
  separability: number;
  durability: number;
  contaminationRisk: number;
  contaminationLevel: string;
  retentionPotential: number;
}

export interface ObjectAnalysis {
  profile: ObjectProfile;
  dna: MaterialDna;
  constraints: Constraint[];
  analysisMode: "model" | "reference";
  provider: string | null;
}

export interface ObjectRunResult {
  analysis: ObjectAnalysis;
  baseline: BaselineFuture;
  pathways: Pathway[];
  stats: PipelineStats;
  events: EngineEvent[];
  notices: ObjectNotice[];
  assumptions: string[];
  runId: string | null;
  saved: boolean;
  requested: number;
  spaceIndex: number;
  providerSummary: { analysis: string | null; search: string[] };
}
