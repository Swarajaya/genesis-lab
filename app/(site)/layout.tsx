import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "@/components/ui/SiteHeader";

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      {children}
      <SiteFooter />
    </>
  );
}
