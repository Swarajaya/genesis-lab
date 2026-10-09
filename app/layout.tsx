import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Genesis Lab", template: "%s · Genesis Lab" },
  description: "Six domains. Six experiments. One live innovation laboratory.",
};

export const viewport: Viewport = { themeColor: "#04060a", colorScheme: "dark" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-full focus:bg-signal focus:px-4 focus:py-2 focus:text-sm focus:text-black">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
