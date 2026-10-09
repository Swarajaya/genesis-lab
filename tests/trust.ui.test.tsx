import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import React from "react";
vi.mock("next/dynamic", () => ({ default: () => () => null }));
import TrustExperiment from "@/components/experiments/TrustExperiment";
import { TrustFallback } from "@/components/3d/trust/TrustVisual";

describe("Experiment 04 UI (server render smoke test)", () => {
  it("renders the new product, with no demo/judge/age-first UI", () => {
    const html = renderToString(React.createElement(TrustExperiment));
    expect(html).toContain("TRUST WITHOUT IDENTITY");
    expect(html).toContain("Private credential vault");
    expect(html).toContain("Policy compiler");
    expect(html).toContain("Security event stream");
    expect(html).toContain("Proof explorer");
    expect(html).toContain("Attack current proof".slice(0, 6));
    expect(html).not.toMatch(/Judge mode|Demo mode|Prove age|Date of birth<\/label>/i);
  });
  it("2D fallback renders for every phase", () => {
    for (const p of [0, 1, 2, 3, 4, 5]) expect(renderToString(React.createElement(TrustFallback, { phase: p, verdict: p === 5 ? "valid" : "none" }))).toContain("PRIVACY BOUNDARY");
  });
});
