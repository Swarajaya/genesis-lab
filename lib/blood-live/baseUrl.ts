export const isLocalHost = (u: string) => /^(https?:\/\/)?(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(u);

/**
 * Address the phone should open. Priority: manual override, a real (non-localhost) NEXT_PUBLIC_APP_URL,
 * the page's own origin when it is not localhost, then this computer's LAN address, then whatever origin we have.
 */
export function chooseBase(opts: { override?: string; env?: string; origin?: string; lan?: string[]; port?: string; protocol?: string }): string {
  const { override, env, origin, lan, port, protocol } = opts;
  if (override?.trim()) return override.trim();
  if (env && !isLocalHost(env)) return env;
  if (origin && !isLocalHost(origin)) return origin;
  if (lan?.length) return `${protocol || "http:"}//${lan[0]}${port ? `:${port}` : ""}`;
  return env || origin || "";
}
