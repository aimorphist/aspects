/**
 * Smoke tests for @bcts/dcbor Bun compatibility.
 *
 * Gate check: verify @bcts/dcbor 1.0.0-beta.0 works with Bun before
 * committing to it for canonical hashing.
 */

import { test, expect, describe } from "bun:test";
import {
  cbor,
  cborData,
  decodeCbor,
  cborEquals,
  extractCbor,
} from "@bcts/dcbor";

// ---------------------------------------------------------------------------
// 1. Import works
// ---------------------------------------------------------------------------

describe("import", () => {
  test("package imports without error", () => {
    expect(cbor).toBeDefined();
    expect(cborData).toBeDefined();
    expect(decodeCbor).toBeDefined();
    expect(cborEquals).toBeDefined();
    expect(extractCbor).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 2. Basic encode/decode roundtrip
// ---------------------------------------------------------------------------

describe("roundtrip", () => {
  test("simple object roundtrips through dCBOR", () => {
    const obj = { name: "test", version: "1.0.0" };
    const encoded = cborData(obj);
    expect(encoded).toBeInstanceOf(Uint8Array);
    expect(encoded.length).toBeGreaterThan(0);

    const decoded = decodeCbor(encoded);
    // extractCbor converts CborMap back to JS value
    const extracted = extractCbor(decoded) as ReturnType<typeof extractCbor>;
    expect(extracted).toBeDefined();

    // The decoded CBOR map should have the same keys/values
    // Use cborEquals to verify the round-trip is identical
    const reEncoded = decoded.toData();
    expect(reEncoded).toEqual(encoded);
  });
});

// ---------------------------------------------------------------------------
// 3. Deterministic output
// ---------------------------------------------------------------------------

describe("deterministic", () => {
  test("same object encoded twice produces identical bytes", () => {
    const obj = { name: "test", version: "1.0.0" };
    const encoded1 = cborData(obj);
    const encoded2 = cborData(obj);
    expect(encoded1).toEqual(encoded2);
  });
});

// ---------------------------------------------------------------------------
// 4. Key ordering — dCBOR canonical key sorting
// ---------------------------------------------------------------------------

describe("key ordering", () => {
  test("{z: 1, a: 2} and {a: 2, z: 1} produce identical bytes", () => {
    const forward = cborData({ z: 1, a: 2 });
    const reversed = cborData({ a: 2, z: 1 });
    expect(forward).toEqual(reversed);
  });
});

// ---------------------------------------------------------------------------
// 5. Nested objects
// ---------------------------------------------------------------------------

describe("nested objects", () => {
  test("realistic aspect-like structure encodes and decodes", () => {
    const aspect = {
      kind: "aspect",
      id: "did:key:z6Mktest",
      meta: {
        name: "TestAspect",
        version: "0.1.0",
        tags: ["schema", "test"],
      },
      payload: {
        fields: [
          { name: "field1", type: "string", required: true },
          { name: "field2", type: "number", required: false },
        ],
      },
    };

    const encoded = cborData(aspect);
    expect(encoded).toBeInstanceOf(Uint8Array);
    expect(encoded.length).toBeGreaterThan(0);

    const decoded = decodeCbor(encoded);
    const reEncoded = decoded.toData();
    expect(reEncoded).toEqual(encoded);
  });
});

// ---------------------------------------------------------------------------
// 6. Type preservation
// ---------------------------------------------------------------------------

describe("type preservation", () => {
  test("number roundtrips", () => {
    const encoded = cborData(42);
    const decoded = decodeCbor(encoded);
    expect(decoded.asNumber()).toBe(42);
  });

  test("negative number roundtrips", () => {
    const encoded = cborData(-7);
    const decoded = decodeCbor(encoded);
    expect(decoded.asNumber()).toBe(-7);
  });

  test("string roundtrips", () => {
    const encoded = cborData("hello world");
    const decoded = decodeCbor(encoded);
    expect(decoded.asText()).toBe("hello world");
  });

  test("boolean true roundtrips", () => {
    const encoded = cborData(true);
    const decoded = decodeCbor(encoded);
    expect(decoded.asBool()).toBe(true);
  });

  test("boolean false roundtrips", () => {
    const encoded = cborData(false);
    const decoded = decodeCbor(encoded);
    expect(decoded.asBool()).toBe(false);
  });

  test("null roundtrips", () => {
    const encoded = cborData(null);
    const decoded = decodeCbor(encoded);
    expect(decoded.isNull()).toBe(true);
  });

  test("array roundtrips", () => {
    const arr = [1, "two", true, null];
    const encoded = cborData(arr);
    const decoded = decodeCbor(encoded);
    expect(decoded.isArray()).toBe(true);
    const items = decoded.asArray();
    expect(items?.length).toBe(4);
    expect(items![0]!.asNumber()).toBe(1);
    expect(items![1]!.asText()).toBe("two");
    expect(items![2]!.asBool()).toBe(true);
    expect(items![3]!.isNull()).toBe(true);
  });

  test("nested object roundtrips via cborEquals", () => {
    const obj = { x: { y: 99 } };
    const a = cbor(obj);
    const b = cbor(obj);
    expect(cborEquals(a, b)).toBe(true);
  });
});
