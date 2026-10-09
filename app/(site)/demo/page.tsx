import type { Metadata } from "next";
import DemoClient from "@/components/DemoClient";

export const metadata: Metadata = { title: "Demo mode" };

export default function Page() {
  return <DemoClient />;
}
