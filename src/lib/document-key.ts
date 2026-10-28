/** Stable browser-side identity for locally held documents. */
export async function documentKeyFromBytes(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (!globalThis.crypto?.subtle) {
    throw new Error("This browser does not support document identity hashing.");
  }
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
