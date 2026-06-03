/**
 * Gordian Envelope integration for aspects.
 *
 * Wraps aspect data in a Gordian Envelope with metadata assertions,
 * enabling selective disclosure (elision) and digest-based integrity
 * verification. The aspect content is dCBOR-encoded as the envelope
 * subject; metadata fields become predicate-object assertions.
 *
 * @module
 */

// Use CJS require for @bcts/envelope — its ESM bundle has a broken
// transitive re-export from @bcts/crypto (hkdfHmacSha512).  The CJS
// bundle works correctly.  We pull types from the package's .d.cts for
// full type-safety.
import { createRequire } from 'node:module';
import type { Envelope as EnvelopeType } from '@bcts/envelope';
const _require = createRequire(import.meta.url);
const {
  Envelope,
  envelopeToBytes,
  envelopeFromBytes,
} = _require('@bcts/envelope') as {
  Envelope: typeof EnvelopeType & {
    new: (subject: unknown) => EnvelopeType;
  };
  envelopeToBytes: (envelope: EnvelopeType) => Uint8Array;
  envelopeFromBytes: (bytes: Uint8Array) => EnvelopeType;
};

import { blake3 } from '@noble/hashes/blake3.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { encodeDCBOR, decodeDCBOR } from './canonical';
import type { Aspect } from './types';
import { isGeneralAspect } from './types';

// ---------------------------------------------------------------------------
// Assertion predicate keys (plain strings — kept simple intentionally)
// ---------------------------------------------------------------------------

const PRED_NAME = 'name';
const PRED_VERSION = 'version';
const PRED_PUBLISHER = 'publisher';
const PRED_IMPLEMENTS = 'implements';
const PRED_KIND = 'kind';
const PRED_BLAKE3 = 'blake3';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Build an Envelope from an Aspect, attaching metadata assertions. */
function buildEnvelope(aspect: Aspect): EnvelopeType {
  // Subject: the full aspect as dCBOR bytes
  const subjectBytes = encodeDCBOR(aspect);

  let env = Envelope.new(subjectBytes)
    .addAssertion(PRED_NAME, aspect.name)
    .addAssertion(PRED_VERSION, aspect.version);

  if (aspect.publisher) {
    env = env.addAssertion(PRED_PUBLISHER, aspect.publisher);
  }

  if (isGeneralAspect(aspect)) {
    // Store implements list as a comma-joined string
    // (Envelope leaf values are scalars; arrays need encoding)
    env = env.addAssertion(PRED_IMPLEMENTS, aspect.implements.join(','));
  } else {
    env = env.addAssertion(PRED_KIND, aspect.kind ?? 'personality');
  }

  // Content-address: blake3 of the dCBOR subject bytes
  const hash = bytesToHex(blake3(subjectBytes));
  env = env.addAssertion(PRED_BLAKE3, hash);

  return env;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Wrap an aspect in a Gordian Envelope.
 *
 * The aspect content (dCBOR-encoded) is the subject; metadata fields
 * (name, version, publisher, implements/kind, blake3) become assertions.
 *
 * @returns Tagged CBOR bytes of the envelope.
 */
export function wrapAspect(aspect: Aspect): Uint8Array {
  return envelopeToBytes(buildEnvelope(aspect));
}

/**
 * Unwrap an envelope back to an Aspect.
 *
 * Extracts the dCBOR subject bytes and decodes them. The returned object
 * is the full aspect — assertion metadata is used only for verification,
 * not reconstruction.
 *
 * @throws If the bytes are not a valid envelope or the subject is not
 *   decodable dCBOR.
 */
export function unwrapAspect(envelopeBytes: Uint8Array): Aspect {
  const env = envelopeFromBytes(envelopeBytes);
  const subjectBytes = env.subject().extractBytes();
  return decodeDCBOR(subjectBytes) as Aspect;
}

/**
 * Compute the envelope digest — blake3 of the full tagged CBOR bytes.
 *
 * This is the *envelope-level* digest (covers subject + all assertions).
 * For the *content-only* hash, read the `blake3` assertion instead.
 *
 * @returns Hex-encoded blake3 hash of the envelope bytes.
 */
export function envelopeDigest(envelopeBytes: Uint8Array): string {
  return bytesToHex(blake3(envelopeBytes));
}

/**
 * Elide specific assertion fields from an aspect envelope.
 *
 * Returns a new envelope where assertions matching the given predicate
 * names are replaced with their digests. The top-level envelope digest
 * is preserved, enabling proof-of-existence without disclosure.
 *
 * @param envelopeBytes - Tagged CBOR bytes of a full aspect envelope.
 * @param fields - Predicate names to elide (e.g. `["publisher", "blake3"]`).
 * @returns Tagged CBOR bytes of the elided envelope.
 */
export function elideFields(
  envelopeBytes: Uint8Array,
  fields: string[],
): Uint8Array {
  const env = envelopeFromBytes(envelopeBytes);
  const fieldSet = new Set(fields);

  // Collect digests of assertion envelopes whose predicate matches
  const toElide = env.assertions().filter((a) => {
    const pred = a.asPredicate();
    if (!pred) return false;
    try {
      return fieldSet.has(pred.extractString());
    } catch {
      return false;
    }
  });

  if (toElide.length === 0) return envelopeBytes;

  // Elide by removing matching targets (replaces them with their digests)
  const elided = env.elideRemovingArray(toElide);
  return envelopeToBytes(elided);
}

/**
 * Verify that an elided envelope is digest-equivalent to the original.
 *
 * Two envelopes are equivalent when they share the same Gordian Envelope
 * digest (the Merkle-like digest tree root). Elision preserves this
 * property by design.
 *
 * @param elidedBytes  - Elided envelope bytes.
 * @param fullBytes    - Full (non-elided) envelope bytes.
 * @returns `true` if both envelopes share the same digest tree root.
 */
export function verifyElision(
  elidedBytes: Uint8Array,
  fullBytes: Uint8Array,
): boolean {
  const elided = envelopeFromBytes(elidedBytes);
  const full = envelopeFromBytes(fullBytes);
  return elided.digest().equals(full.digest());
}
