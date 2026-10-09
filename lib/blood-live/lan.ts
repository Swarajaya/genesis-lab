import { networkInterfaces } from "node:os";

/** Private IPv4 addresses of this machine (what a phone on the same Wi-Fi can reach). Wi-Fi/Ethernet first, virtual adapters last. */
export function lanAddresses(): string[] {
  const out: Array<{ ip: string; rank: number }> = [];
  for (const [name, list] of Object.entries(networkInterfaces())) {
    for (const i of list ?? []) {
      if (i.family !== "IPv4" || i.internal) continue;
      if (!/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(i.address)) continue;
      const virtual = /vethernet|virtualbox|vmware|docker|wsl|hyper-v|vboxnet|tailscale|loopback/i.test(name);
      out.push({ ip: i.address, rank: (virtual ? 10 : 0) + (i.address.startsWith("192.168.") ? 0 : 1) });
    }
  }
  return out.sort((a, b) => a.rank - b.rank).map((x) => x.ip);
}
