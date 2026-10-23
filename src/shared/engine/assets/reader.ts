/** Byte access supplied by a platform adapter. */
export type AssetReader = (name: string) => Promise<Uint8Array>;
