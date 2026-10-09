// Usage: node scripts/check-keys.mjs   (reads .env.local, then .env)
// Sends one tiny real request per GEMINI_API_KEY* and GROK_API_KEY* and prints the result.
import { readFileSync, existsSync } from "node:fs";

const file = [".env.local", ".env"].find(existsSync);
if (!file) { console.error("No .env.local or .env found in this folder."); process.exit(1); }

const env = {};
for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const providers = [
  {
    label: "GEMINI",
    prefix: "GEMINI_API_KEY",
    model: env.GEMINI_MODEL || "gemini-2.5-flash",
    call: (key, model) =>
      fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({ contents: [{ parts: [{ text: "Reply with the single word: ok" }] }], generationConfig: { maxOutputTokens: 256 } }),
      }),
  },
  {
    label: "GROK",
    prefix: "GROK_API_KEY",
    model: env.GROK_MODEL || "grok-4-fast",
    call: (key, model) =>
      fetch(`${(env.GROK_BASE_URL || "https://api.x.ai/v1").replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "Reply with the single word: ok" }], max_tokens: 16 }),
      }),
  },
];

const verdictFor = (s) =>
  s === 200 ? "WORKING"
  : s === 429 ? "RATE/QUOTA LIMITED (key is valid, limit hit)"
  : s === 400 ? "BAD REQUEST (invalid key or wrong model name)"
  : s === 401 ? "INVALID KEY"
  : s === 403 ? "BLOCKED / NO ACCESS / NO CREDITS"
  : s === 404 ? "MODEL NOT FOUND (check the *_MODEL value)"
  : "ERROR";

console.log(`File: ${file}\n`);
for (const p of providers) {
  const keys = Object.entries(env).filter(([k, v]) => new RegExp(`^${p.prefix}(_\\d+)?$`).test(k) && v);
  console.log(`== ${p.label}  model: ${p.model}  keys found: ${keys.length}`);
  if (!keys.length) { console.log("   (none set)\n"); continue; }
  let ok = 0;
  for (const [name, key] of keys) {
    const masked = key.slice(0, 4) + "..." + key.slice(-4);
    try {
      const r = await p.call(key, p.model);
      if (r.status === 200) ok++;
      console.log(`   ${name.padEnd(16)} ${masked.padEnd(12)} HTTP ${r.status}  ${verdictFor(r.status)}`);
    } catch (e) {
      console.log(`   ${name.padEnd(16)} ${masked.padEnd(12)} NETWORK ERROR: ${e.message}`);
    }
  }
  console.log(`   -> ${ok}/${keys.length} working\n`);
}
