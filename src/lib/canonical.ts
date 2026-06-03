import { blake3 } from '@noble/hashes/blake3.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { cborData, decodeCbor, type CborInput } from '@bcts/dcbor';

/**
 * Recursively convert a decoded CBOR node to a plain JS value.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromCborNode(node: any): unknown {
  if (node.isNull()) return null;
  if (node.isBool()) return node.asBool() as boolean;
  if (node.isMap()) {
    const result: Record<string, unknown> = {};
    for (const [k, v] of node.asMap()) {
      result[(k as any).asText() as string] = fromCborNode(v);
    }
    return result;
  }
  if (node.isArray()) {
    return (node.asArray() as unknown[]).map(fromCborNode);
  }
  if (node.isText()) return node.asText() as string;
  if (node.isNumber()) return node.asNumber() as number;
  return null;
}

/**
 * Encode a value to dCBOR canonical bytes.
 * Deterministic: same semantic value always produces same bytes.
 * Key ordering is normalized by dCBOR automatically.
 */
export function encodeDCBOR(value: unknown): Uint8Array {
  return cborData(value as CborInput);
}

/**
 * Decode dCBOR bytes back to a plain JS value.
 */
export function decodeDCBOR(bytes: Uint8Array): unknown {
  const decoded = decodeCbor(bytes);
  return fromCborNode(decoded);
}

/**
 * Compute blake3 hash from dCBOR canonical bytes, returned as hex.
 * Used for new-format (GeneralAspect) content addressing.
 */
export function blake3HashDCBOR(value: unknown): string {
  const cborBytes = encodeDCBOR(value);
  return bytesToHex(blake3(cborBytes));
}
