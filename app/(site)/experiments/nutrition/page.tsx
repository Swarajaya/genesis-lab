import type { Metadata } from "next";
import { NutritionExperiment } from "@/components/experiments/NutritionExperiment";

export const metadata: Metadata = { title: "AI Nutrition From Waste" };

export default function Page() {
  return <NutritionExperiment />;
}
