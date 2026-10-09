import type { Metadata } from "next";
import LabClient from "@/components/LabClient";

export const metadata: Metadata = { title: "The Lab" };

export default function Page() {
  return <LabClient />;
}
