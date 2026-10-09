import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="label">404</span>
      <h1 className="display text-4xl">This experiment does not exist</h1>
      <Link href="/lab" className="rounded-full bg-signal px-5 py-2.5 text-sm font-medium text-[#04110e]">
        Back to the lab
      </Link>
    </main>
  );
}
