/** Bounds-checked little-endian reader shared by browser and server. */
export class BinaryReader {
  private view: DataView;
  offset = 0;
  constructor(readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  get length() { return this.bytes.byteLength; }
  seek(offset: number) {
    if (!Number.isInteger(offset) || offset < 0 || offset > this.length) throw new Error('Invalid binary offset');
    this.offset = offset;
  }
  private take(size: number) {
    if (this.offset + size > this.length) throw new Error('Truncated binary data');
    const start = this.offset; this.offset += size; return start;
  }
  u8() { return this.view.getUint8(this.take(1)); }
  i8() { return this.view.getInt8(this.take(1)); }
  u16() { return this.view.getUint16(this.take(2), true); }
  i16() { return this.view.getInt16(this.take(2), true); }
  u32() { return this.view.getUint32(this.take(4), true); }
  text(size: number) { const start = this.take(size); return String.fromCharCode(...this.bytes.subarray(start, start + size)); }
}

export function readChunks(bytes: Uint8Array, signature: string) {
  const reader = new BinaryReader(bytes);
  if (reader.text(4) !== signature) throw new Error(`Expected ${signature} file signature`);
  const version = reader.u16();
  const chunks = new Map<string, Uint8Array>();
  while (reader.offset < reader.length) {
    const name = reader.text(4), length = reader.u32(), start = reader.offset;
    reader.seek(start + length);
    if (chunks.has(name)) throw new Error(`Duplicate ${name} chunk`);
    chunks.set(name, bytes.subarray(start, start + length));
  }
  return { version, chunks };
}

export function requiredChunk(chunks: Map<string, Uint8Array>, name: string) {
  const bytes = chunks.get(name);
  if (!bytes) throw new Error(`Missing ${name} chunk`);
  return bytes;
}
