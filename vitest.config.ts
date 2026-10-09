import { defineConfig } from "vitest/config";
import path from "node:path";
const r = (p: string) => path.resolve(__dirname, p);
export default defineConfig({
  resolve: { alias: [{ find: "server-only", replacement: r("tests/shims/empty.ts") }, { find: "@/hooks/useCapabilities", replacement: r("tests/shims/useCapabilities.ts") }, { find: /^@\//, replacement: r("./") + "/" }] },
  esbuild: { jsx: "automatic", tsconfigRaw: { compilerOptions: { jsx: "react-jsx" } } },
  test: { include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"], testTimeout: 90_000 },
});
