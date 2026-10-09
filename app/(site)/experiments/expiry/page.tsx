import type { Metadata } from "next";
import ExpiryExperiment from "@/components/experiments/ExpiryExperiment";

export const metadata: Metadata = { title: "EXPIRY" };

export default function Page() {
  return <ExpiryExperiment />;
}
