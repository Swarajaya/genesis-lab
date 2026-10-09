import type { Metadata } from "next";
import GameZeroExperiment from "@/components/experiments/GameZeroExperiment";

export const metadata: Metadata = { title: "GameZero" };

export default function Page() {
  return <GameZeroExperiment />;
}
