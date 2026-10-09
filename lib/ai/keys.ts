/**
 * Collect numbered keys (PREFIX_1, PREFIX_2, ... any count) plus a plain PREFIX.
 * Keys stay inside the server process. This module must never be imported by client code.
 */
export function collectKeys(prefix: string, env: Record<string, string | undefined> = process.env): string[] {
  const numbered: { n: number; key: string }[] = [];
  const re = new RegExp(`^${prefix}_(\\d+)$`);
  for (const [name, value] of Object.entries(env)) {
    const m = re.exec(name);
    const v = value?.trim();
    if (m && v) numbered.push({ n: Number(m[1]), key: v });
  }
  numbered.sort((a, b) => a.n - b.n);
  const keys = numbered.map((x) => x.key);
  const plain = env[prefix]?.trim();
  if (plain && !keys.includes(plain)) keys.push(plain);
  return keys;
}
