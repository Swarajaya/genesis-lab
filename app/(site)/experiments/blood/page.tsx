import type { Metadata } from "next";
import BloodExperiment from "@/components/experiments/BloodExperiment";

export const metadata: Metadata = { title: "Digital Blood Bank Without Blood Types" };

export default function Page() {
  return <BloodExperiment />;
}
