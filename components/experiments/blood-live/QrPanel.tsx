"use client";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { Glass } from "@/components/ui/Glass";

import { chooseBase, isLocalHost } from "@/lib/blood-live/baseUrl";

/** Safe participant URL only: session id in the path. No keys, tokens or secrets are ever encoded. */
export function participantUrl(base: string, sessionId: string): string {
  return `${base.replace(/\/+$/, "")}/experiments/blood/live/${sessionId}`;
}

export function QrPanel({ sessionId, code, connected, participants, lastDevice, lan, port, protocol }: { lan?: string[]; port?: string; protocol?: string; sessionId: string; code: string; connected: number; participants: number; lastDevice: { code: string; up: boolean; key: number } | null }) {
  const [override, setOverride] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim() || "";
  const base = chooseBase({ override, env, origin, lan, port, protocol });
  const url = base ? participantUrl(base, sessionId) : "";
  const local = base ? isLocalHost(base) : false;

  useEffect(() => {
    if (!url) return;
    let off = false;
    import("qrcode").then((Q) => Q.toDataURL(url, { margin: 1, width: 440, errorCorrectionLevel: "M", color: { dark: "#05080d", light: "#f4f7fb" } })).then((d) => !off && setQr(d)).catch(() => !off && setQr(null));
    return () => {
      off = true;
    };
  }, [url]);

  const metric = useMemo(
    () => [
      ["Connected devices", connected],
      ["Live participants", participants],
    ] as const,
    [connected, participants],
  );

  return (
    <Glass className="relative overflow-hidden p-5">
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#b48bff]/10 blur-3xl" aria-hidden />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-light tracking-tight text-text">LIVE BLOOD NETWORK</h3>
          <p className="label mt-1">Scan to join · Session {code}</p>
        </div>
        <span className="whitespace-nowrap rounded-full border border-[#b48bff]/40 bg-[#b48bff]/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#d9c6ff]">Connected: {connected}</span>
      </div>

      <div className="mx-auto mt-4 w-full max-w-[17rem] rounded-2xl bg-[#f4f7fb] p-3 shadow-[0_0_60px_-12px_rgba(180,139,255,0.55)]">
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt={`QR code to join live session ${code}`} className="aspect-square w-full" />
        ) : (
          <div className="aspect-square w-full animate-pulse rounded-lg bg-black/10" aria-hidden />
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {metric.map(([l, v]) => (
          <div key={l} className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2">
            <div className="label !text-[9px]">{l}</div>
            <motion.div key={v} initial={{ opacity: 0.2, y: 5 }} animate={{ opacity: 1, y: 0 }} className="font-mono text-xl text-text">
              {v}
            </motion.div>
          </div>
        ))}
      </div>

      {lastDevice && (
        <motion.p key={lastDevice.key} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={`mt-3 rounded-lg border px-3 py-2 text-center font-mono text-[11px] uppercase tracking-[0.14em] ${lastDevice.up ? "border-ok/30 bg-ok/10 text-ok" : "border-white/10 bg-white/[0.03] text-dim"}`} role="status">
          {lastDevice.up ? "Device connected" : "Device disconnected"} · {lastDevice.code}
        </motion.p>
      )}

      <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-dim">
        <div className="label !text-[9px]">Phone opens</div>
        <a href={url || undefined} target="_blank" rel="noreferrer" className="mt-1 block break-all font-mono text-[12px] text-text underline decoration-white/20 underline-offset-2">{url || "…"}</a>
        {local ? (
          <p className="mt-2 text-warn">This address only works on this computer. Type your computer’s Wi-Fi address below (for example http://192.168.1.20:3000) so the QR points to it.</p>
        ) : (
          <p className="mt-2 text-faint">Phone must be on the same Wi-Fi as this computer. On Windows, allow “Node.js” on Private networks when the firewall asks. A deployed (https) site works on any network.</p>
        )}
        <input aria-label="Phone base URL" placeholder="http://192.168.1.20:3000" value={override} onChange={(e) => setOverride(e.target.value)} className="mt-2 !py-1.5 !text-xs" />
      </div>
    </Glass>
  );
}
