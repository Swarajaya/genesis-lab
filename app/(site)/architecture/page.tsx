import type { Metadata } from "next";
import ArchitectureCenter from "@/components/architecture/ArchitectureCenter";
import { buildSnapshot } from "@/lib/ai/health";

export const metadata: Metadata = { title: "Architecture" };
// Provider status reflects the running server's environment, so never prerender it.
export const dynamic = "force-dynamic";

export default function Page() {
  return <ArchitectureCenter initial={buildSnapshot()} />;
}
