import { describe, expect, it } from "vitest";
import { generateWorld, generateTransferWorld, worldForSeed } from "./world";
import { dynamicsId } from "./dynamics";

describe("transfer worlds", () => {
  it("reuse the movement mechanics but look different, and resolve deterministically from the seed", () => {
    for (const base of ["aa11", "bb22", "cc33", "dd44"]) {
      const a = generateWorld(base);
      const b = worldForSeed(`${base}_tf`);
      const b2 = worldForSeed(`${base}_tf`);
      expect(dynamicsId(b.rules.dynamics)).toBe(dynamicsId(a.rules.dynamics));
      expect(JSON.stringify(b.pub)).toBe(JSON.stringify(b2.pub));
      const roleChanges = (Object.keys(a.rules.terrain) as (keyof typeof a.rules.terrain)[]).filter((c) => a.rules.terrain[c] !== b.rules.terrain[c]).length;
      expect(roleChanges).toBeGreaterThanOrEqual(3);
      expect(JSON.stringify(a.pub.colors)).not.toBe(JSON.stringify(b.pub.colors));
      void generateTransferWorld;
    }
  });
  it("leaves ordinary seeds untouched", () => {
    expect(JSON.stringify(worldForSeed("plainseed"))).toBe(JSON.stringify(generateWorld("plainseed")));
  });
});
