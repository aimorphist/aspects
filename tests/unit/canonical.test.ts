import { test, expect, describe } from "bun:test";
import { encodeDCBOR, decodeDCBOR, blake3HashDCBOR } from "../../src/lib/canonical.js";
import { blake3HashAspect, blake3HashAspectCanonical } from "../../src/utils/hash.js";
import type { GeneralAspect, PersonalityAspect } from "../../src/lib/types.js";

// ---------------------------------------------------------------------------
// 1. encodeDCBOR + decodeDCBOR roundtrips
// ---------------------------------------------------------------------------

describe("encodeDCBOR / decodeDCBOR roundtrip", () => {
  test("roundtrips a plain object", () => {
    const obj = { name: "test", value: 42 };
    const bytes = encodeDCBOR(obj);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
    const back = decodeDCBOR(bytes) as Record<string, unknown>;
    expect(back["name"]).toBe("test");
    expect(back["value"]).toBe(42);
  });

  test("roundtrips an array", () => {
    const arr = [1, 2, 3];
    const bytes = encodeDCBOR(arr);
    const back = decodeDCBOR(bytes) as number[];
    expect(back).toEqual([1, 2, 3]);
  });

  test("roundtrips a string", () => {
    const bytes = encodeDCBOR("hello");
    const back = decodeDCBOR(bytes);
    expect(back).toBe("hello");
  });

  test("roundtrips a number", () => {
    const bytes = encodeDCBOR(99);
    const back = decodeDCBOR(bytes);
    expect(back).toBe(99);
  });
});

// ---------------------------------------------------------------------------
// 2. blake3HashDCBOR determinism
// ---------------------------------------------------------------------------

describe("blake3HashDCBOR determinism", () => {
  test("same input produces same hash", () => {
    const obj = { kind: "aspect", version: "1.0.0" };
    expect(blake3HashDCBOR(obj)).toBe(blake3HashDCBOR(obj));
  });

  test("different inputs produce different hashes", () => {
    expect(blake3HashDCBOR({ a: 1 })).not.toBe(blake3HashDCBOR({ a: 2 }));
  });
});

// ---------------------------------------------------------------------------
// 3. dCBOR hash differs from JSON-canonical hash for the same data
// ---------------------------------------------------------------------------

describe("dCBOR vs JSON-canonical hash differ", () => {
  test("blake3HashDCBOR and blake3HashAspect produce different hashes", () => {
    const obj: PersonalityAspect = {
      schemaVersion: 1,
      name: "test",
      version: "1.0.0",
      displayName: "Test",
      tagline: "A test aspect",
      prompt: "Be helpful.",
    };
    const dcborHash = blake3HashDCBOR(obj);
    const jsonHash = blake3HashAspect(obj);
    expect(dcborHash).not.toBe(jsonHash);
  });
});

// ---------------------------------------------------------------------------
// 4. Key ordering does not affect dCBOR hash
// ---------------------------------------------------------------------------

describe("key ordering invariance", () => {
  test("{a:1, b:2} and {b:2, a:1} produce same dCBOR hash", () => {
    const h1 = blake3HashDCBOR({ a: 1, b: 2 });
    const h2 = blake3HashDCBOR({ b: 2, a: 1 });
    expect(h1).toBe(h2);
  });
});

// ---------------------------------------------------------------------------
// 5 & 6. blake3HashAspectCanonical routing
// ---------------------------------------------------------------------------

describe("blake3HashAspectCanonical routing", () => {
  const legacyAspect: PersonalityAspect = {
    schemaVersion: 1,
    name: "legacy",
    version: "1.0.0",
    displayName: "Legacy",
    tagline: "A legacy aspect",
    prompt: "Do stuff.",
  };

  const generalAspect: GeneralAspect = {
    schemaVersion: 1,
    name: "general",
    version: "1.0.0",
    displayName: "General",
    tagline: "A general aspect",
    implements: ["builtin/personality@1.0.0"],
    data: { prompt: "Do general stuff." },
  };

  test("routes legacy aspects to JSON-canonical hash", () => {
    const result = blake3HashAspectCanonical(legacyAspect);
    // JSON-canonical (base58) vs dCBOR (hex): base58 chars don't include 0-f only
    // Just verify it's a non-empty string
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  test("routes GeneralAspects to dCBOR hash", () => {
    const result = blake3HashAspectCanonical(generalAspect);
    // dCBOR hash returned as hex (lowercase hex chars only)
    expect(result).toMatch(/^[0-9a-f]+$/);
  });

  test("legacy hash from blake3HashAspectCanonical matches blake3HashAspect", () => {
    const canonical = blake3HashAspectCanonical(legacyAspect);
    const direct = blake3HashAspect(legacyAspect);
    expect(canonical).toBe(direct);
  });
});
