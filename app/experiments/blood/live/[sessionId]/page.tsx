import type { Metadata } from "next";
import ParticipantClient from "@/components/experiments/blood-live/ParticipantClient";

export const metadata: Metadata = { title: "Live Blood Network", robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <ParticipantClient sessionId={sessionId} />;
}
