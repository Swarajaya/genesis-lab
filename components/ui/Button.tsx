"use client";
import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "ghost" | "danger";

const styles: Record<Variant, string> = {
  primary: "bg-signal text-[#04110e] hover:bg-[#9af0e2] shadow-[0_0_40px_-8px_rgba(123,224,208,0.6)]",
  ghost: "border border-line bg-white/[0.03] text-text hover:bg-white/[0.07] hover:border-white/20",
  danger: "border border-bad/40 bg-bad/10 text-bad hover:bg-bad/20",
};

const base = "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium tracking-wide transition duration-300 disabled:opacity-40 disabled:pointer-events-none";

export function Button({ variant = "primary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type="button" className={`${base} ${styles[variant]} ${className}`} {...props} />;
}

export function LinkButton({ href, variant = "primary", className = "", children, ...rest }: { href: string; variant?: Variant; className?: string; children: ReactNode } & Record<string, unknown>) {
  return (
    <Link href={href} className={`${base} ${styles[variant]} ${className}`} {...rest}>
      {children}
    </Link>
  );
}
