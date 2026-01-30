declare module 'hash-wasm' {
  export function blake3(data: string | Uint8Array): Promise<string>;
}
