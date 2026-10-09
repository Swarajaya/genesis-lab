export interface Capabilities { lowPower: boolean; reducedMotion: boolean; webgl: boolean; ready: boolean }
export function useCapabilities(): Capabilities { return { lowPower: false, reducedMotion: false, webgl: false, ready: true }; }
