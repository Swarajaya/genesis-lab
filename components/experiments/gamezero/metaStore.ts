import { emptyLibrary, type MetaLibrary } from "@/lib/engines/gamezero/discovery/meta";

const KEY = "gamezero.meta.v1";

/** Per-browser strategy library. Wrapped in try/catch: storage can be blocked or empty. */
export function loadMeta(): MetaLibrary {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return emptyLibrary();
    const j = JSON.parse(raw) as MetaLibrary;
    return j && j.version === 1 && Array.isArray(j.games) ? j : emptyLibrary();
  } catch {
    return emptyLibrary();
  }
}

export function saveMeta(lib: MetaLibrary) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...lib, games: lib.games.slice(-12) }));
  } catch {
    /* optional */
  }
}
