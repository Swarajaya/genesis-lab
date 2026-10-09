export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export type ImageMime = "image/jpeg" | "image/png" | "image/webp";

export class UploadError extends Error {
  constructor(public readonly code: "too_large" | "unsupported" | "empty") {
    super(code);
  }
}

/** Detect the real image type from magic bytes. The client-declared MIME is never trusted. */
export function sniffImage(bytes: Uint8Array): ImageMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  )
    return "image/webp";
  return null;
}

export async function readImageFile(file: File): Promise<{ mime: ImageMime; bytes: Uint8Array; base64: string }> {
  if (file.size === 0) throw new UploadError("empty");
  if (file.size > MAX_IMAGE_BYTES) throw new UploadError("too_large");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length > MAX_IMAGE_BYTES) throw new UploadError("too_large");
  const mime = sniffImage(bytes);
  if (!mime) throw new UploadError("unsupported");
  return { mime, bytes, base64: Buffer.from(bytes).toString("base64") };
}
