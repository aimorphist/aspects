/**
 * Tests for Gordian Envelope integration.
 *
 * Verifies wrapping, unwrapping, digest computation, elision,
 * and digest equivalence for aspect envelopes.
 */

import { test, expect, describe } from 'bun:test';
import {
  wrapAspect,
  unwrapAspect,
  envelopeDigest,
  elideFields,
  verifyElision,
} from '../../src/lib/envelope';
import type { Aspect, PersonalityAspect, GeneralAspect } from '../../src/lib/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PERSONALITY_ASPECT: PersonalityAspect = {
  schemaVersion: 1,
  name: 'test-persona',
  publisher: 'morphist',
  version: '1.0.0',
  displayName: 'Test Persona',
  tagline: 'A test personality aspect',
  category: 'assistants',
  tags: ['test'],
  prompt: 'You are a helpful test assistant.',
};

const GENERAL_ASPECT: GeneralAspect = {
  schemaVersion: 1,
  name: 'test-general',
  publisher: 'morphist',
  version: '2.0.0',
  displayName: 'Test General',
  tagline: 'A general-purpose aspect',
  implements: ['builtin/personality@1.0.0'],
  data: { prompt: 'You are a general test assistant.' },
};

const MINIMAL_ASPECT: PersonalityAspect = {
  schemaVersion: 1,
  name: 'minimal',
  version: '0.1.0',
  displayName: 'Minimal',
  tagline: 'Bare minimum',
  prompt: 'Hello.',
};

// ---------------------------------------------------------------------------
// 1. Wrap / unwrap roundtrip
// ---------------------------------------------------------------------------

describe('wrapAspect / unwrapAspect', () => {
  test('personality aspect roundtrips', () => {
    const bytes = wrapAspect(PERSONALITY_ASPECT);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);

    const restored = unwrapAspect(bytes);
    expect(restored).toEqual(PERSONALITY_ASPECT);
  });

  test('general aspect roundtrips', () => {
    const bytes = wrapAspect(GENERAL_ASPECT);
    const restored = unwrapAspect(bytes);
    expect(restored).toEqual(GENERAL_ASPECT);
  });

  test('minimal aspect (no publisher) roundtrips', () => {
    const bytes = wrapAspect(MINIMAL_ASPECT);
    const restored = unwrapAspect(bytes);
    expect(restored).toEqual(MINIMAL_ASPECT);
  });
});

// ---------------------------------------------------------------------------
// 2. Deterministic output
// ---------------------------------------------------------------------------

describe('determinism', () => {
  test('same aspect produces identical envelope bytes', () => {
    const a = wrapAspect(PERSONALITY_ASPECT);
    const b = wrapAspect(PERSONALITY_ASPECT);
    expect(a).toEqual(b);
  });

  test('envelope digest is deterministic', () => {
    const a = envelopeDigest(wrapAspect(PERSONALITY_ASPECT));
    const b = envelopeDigest(wrapAspect(PERSONALITY_ASPECT));
    expect(a).toBe(b);
  });

  test('different aspects produce different envelope bytes', () => {
    const a = wrapAspect(PERSONALITY_ASPECT);
    const b = wrapAspect(GENERAL_ASPECT);
    expect(a).not.toEqual(b);
  });

  test('different aspects produce different digests', () => {
    const a = envelopeDigest(wrapAspect(PERSONALITY_ASPECT));
    const b = envelopeDigest(wrapAspect(GENERAL_ASPECT));
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// 3. Envelope digest
// ---------------------------------------------------------------------------

describe('envelopeDigest', () => {
  test('returns a 64-char hex string (blake3)', () => {
    const digest = envelopeDigest(wrapAspect(PERSONALITY_ASPECT));
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// 4. Elision
// ---------------------------------------------------------------------------

describe('elideFields', () => {
  test('eliding fields preserves envelope digest equivalence', () => {
    const full = wrapAspect(PERSONALITY_ASPECT);
    const elided = elideFields(full, ['publisher', 'blake3']);
    expect(verifyElision(elided, full)).toBe(true);
  });

  test('elided bytes are smaller than full bytes', () => {
    const full = wrapAspect(PERSONALITY_ASPECT);
    const elided = elideFields(full, ['blake3']);
    // Elided replaces an assertion with a 32-byte digest, which is shorter
    // than the full blake3 hex string assertion
    expect(elided.length).toBeLessThan(full.length);
  });

  test('eliding non-existent field returns identical bytes', () => {
    const full = wrapAspect(PERSONALITY_ASPECT);
    const elided = elideFields(full, ['nonexistent']);
    expect(elided).toEqual(full);
  });

  test('subject is still extractable from elided envelope', () => {
    const full = wrapAspect(PERSONALITY_ASPECT);
    const elided = elideFields(full, ['publisher', 'blake3']);
    const restored = unwrapAspect(elided);
    expect(restored).toEqual(PERSONALITY_ASPECT);
  });
});

// ---------------------------------------------------------------------------
// 5. Verify elision
// ---------------------------------------------------------------------------

describe('verifyElision', () => {
  test('full envelope verifies against itself', () => {
    const full = wrapAspect(PERSONALITY_ASPECT);
    expect(verifyElision(full, full)).toBe(true);
  });

  test('different aspects do not verify', () => {
    const a = wrapAspect(PERSONALITY_ASPECT);
    const b = wrapAspect(GENERAL_ASPECT);
    expect(verifyElision(a, b)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. Assertion metadata is present
// ---------------------------------------------------------------------------

describe('envelope assertions', () => {
  test('envelope contains expected assertion count for personality aspect', () => {
    // personality with publisher: name, version, publisher, kind, blake3 = 5
    const { envelopeFromBytes } = require('@bcts/envelope');
    const env = envelopeFromBytes(wrapAspect(PERSONALITY_ASPECT));
    expect(env.assertions().length).toBe(5);
  });

  test('envelope contains expected assertion count for general aspect', () => {
    // general with publisher: name, version, publisher, implements, blake3 = 5
    const { envelopeFromBytes } = require('@bcts/envelope');
    const env = envelopeFromBytes(wrapAspect(GENERAL_ASPECT));
    expect(env.assertions().length).toBe(5);
  });

  test('envelope contains expected assertion count for minimal aspect', () => {
    // minimal (no publisher): name, version, kind, blake3 = 4
    const { envelopeFromBytes } = require('@bcts/envelope');
    const env = envelopeFromBytes(wrapAspect(MINIMAL_ASPECT));
    expect(env.assertions().length).toBe(4);
  });
});
