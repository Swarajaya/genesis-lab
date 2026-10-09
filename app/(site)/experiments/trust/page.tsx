import type { Metadata } from "next";
import TrustExperiment from "@/components/experiments/TrustExperiment";

export const metadata: Metadata = { title: "Trust Without Identity" };

export default function Page() {
  return <TrustExperiment />;
}
