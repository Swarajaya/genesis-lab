import type { Metadata } from "next";
import GenesisAccess from "@/components/auth/GenesisAccess";

export const metadata: Metadata = { title: "Genesis Access", robots: { index: false } };

export default function Page() {
  return <GenesisAccess />;
}
