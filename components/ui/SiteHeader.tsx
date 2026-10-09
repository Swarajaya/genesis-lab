"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="5" fill="#7be0d0" />
      <ellipse cx="16" cy="16" rx="14" ry="5.5" fill="none" stroke="#7be0d0" strokeOpacity=".55" strokeWidth="1" />
      <ellipse cx="16" cy="16" rx="14" ry="5.5" fill="none" stroke="#7be0d0" strokeOpacity=".35" strokeWidth="1" transform="rotate(60 16 16)" />
      <ellipse cx="16" cy="16" rx="14" ry="5.5" fill="none" stroke="#7be0d0" strokeOpacity=".35" strokeWidth="1" transform="rotate(120 16 16)" />
    </svg>
  );
}

const LINKS = [
  { href: "/lab", label: "Lab" },
  { href: "/architecture", label: "Architecture" },
];

export function SiteHeader() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-void/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Genesis Lab home">
          <Logo />
          <span className="text-sm font-medium tracking-[0.22em]">GENESIS&nbsp;LAB</span>
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-1">
          {LINKS.map((l) => {
            const active = path === l.href || (l.href === "/lab" && path.startsWith("/experiments"));
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-full px-3 py-1.5 text-xs tracking-wide transition ${active ? "bg-white/10 text-text" : "text-dim hover:text-text"}`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-8 text-xs text-faint sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>Genesis Lab. Six domains. Six experiments. One live innovation laboratory.</p>
        <p>Simulation prototypes for demonstration. Not medical, financial or security advice.</p>
      </div>
    </footer>
  );
}
