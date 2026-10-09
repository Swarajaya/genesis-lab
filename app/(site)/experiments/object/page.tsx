import type { Metadata } from "next";
import ObjectExperiment from "@/components/experiments/ObjectExperiment";

export const metadata: Metadata = { title: "One Object, 100 Lives" };

export default function Page() {
  return <ObjectExperiment />;
}
