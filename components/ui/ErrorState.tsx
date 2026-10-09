"use client";
import { AlertTriangle } from "lucide-react";
import { Button } from "./Button";

export interface UiError {
  code: string;
  message: string;
}

const TITLES: Record<string, string> = {
  ai_no_keys: "AI is not configured",
  ai_rate_limited: "AI providers are rate limited",
  ai_all_failed: "AI is temporarily unavailable",
  ai_malformed_output: "The AI answer could not be validated",
  rate_limited: "Slow down a little",
  invalid_input: "Check your input",
  upload_too_large: "Image is too large",
  upload_unsupported: "Unsupported image",
  upload_empty: "Empty file",
  network: "Cannot reach the server",
};

export function ErrorState({ error, onRetry }: { error: UiError; onRetry?: () => void }) {
  return (
    <div role="alert" className="glass flex flex-col gap-3 rounded-2xl border-bad/30 p-5 sm:flex-row sm:items-center">
      <AlertTriangle className="h-5 w-5 shrink-0 text-bad" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text">{TITLES[error.code] ?? "Something went wrong"}</p>
        <p className="mt-0.5 text-sm text-dim">{error.message}</p>
      </div>
      {onRetry && (
        <Button variant="ghost" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
