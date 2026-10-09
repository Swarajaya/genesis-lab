/** Types shared by the server and the Architecture page. Contains no secrets, only safe metadata. */
import type { ProviderName } from "./types";

export type HealthLabel = "connected" | "failed" | "rate_limited" | "not_configured" | "not_checked";

export interface KeySlotResult {
  /** Zero-based slot number. The key itself never leaves the server. */
  slot: number;
  label: Exclude<HealthLabel, "not_configured" | "not_checked">;
  latencyMs: number;
  checkedAt: string;
  httpStatus?: number;
  message: string;
}

export interface ProviderHealth {
  provider: ProviderName;
  label: HealthLabel;
  checkedAt: string | null;
  /** Average latency of the successful requests in the last test. */
  latencyMs: number | null;
  keysTested: number;
  keysOk: number;
  keysRateLimited: number;
  keysFailed: number;
  message: string;
  slots: KeySlotResult[];
}

export interface ProviderInfo {
  name: ProviderName;
  title: string;
  primary: boolean;
  configured: boolean;
  keys: number;
  coolingSlots: number[];
  supportsImages: boolean;
  /** Host name only, e.g. api.x.ai. */
  endpointHost: string;
  endpointIsCustom: boolean;
  textModel: string;
  textModelSource: "env" | "default";
  visionModel: string | null;
  /** Environment-variable names to set. Names only, never values. */
  envHelp: string[];
  /** Related variables the server can see. Names and whether they are non-empty; never values. */
  envFound: { name: string; hasValue: boolean; read: boolean }[];
  /** Plain-English explanation of why no keys were detected, or null. */
  envHint: string | null;
}

export interface ArchitectureSnapshot {
  generatedAt: string;
  primary: ProviderName;
  limits: {
    timeoutMs: number;
    maxAttempts: number;
    formatRetries: number;
    cooldownMs: { rate_limit: number; quota: number; auth: number };
  };
  providers: ProviderInfo[];
  health: Record<ProviderName, ProviderHealth>;
  database: { configured: boolean };
}

export type CheckStatus = "pass" | "fail" | "warn" | "skipped";

export interface DiagnosticCheck {
  id: string;
  group: "Providers" | "Database" | "Application";
  label: string;
  status: CheckStatus;
  detail: string;
  latencyMs?: number;
  checkedAt: string;
}

export interface DiagnosticsReport {
  startedAt: string;
  finishedAt: string;
  checks: DiagnosticCheck[];
}
