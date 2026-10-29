// Creator logo uploads: the image is center-cropped and resized to 512×512 in
// the browser, then stored by api/upload.js, which returns its public URL.
const SIZE = 512;
const MAX_INPUT = 10 * 1024 * 1024;
export const LOGO_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

export class UploadError extends Error {}

/** A square, 512px version of `file`, small enough to upload quickly. */
export async function prepareLogo(file: File): Promise<Blob> {
  if (!LOGO_ACCEPT.split(",").includes(file.type)) throw new UploadError("Use a PNG, JPG, WEBP or GIF image.");
  if (file.size > MAX_INPUT) throw new UploadError("That image is over 10 MB.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new UploadError("That file couldn’t be read as an image.");
  }
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = Math.min(SIZE, side);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const encode = (type: string, q?: number) => new Promise<Blob | null>((r) => canvas.toBlob(r, type, q));
  // WEBP keeps transparency at a fraction of PNG's size; older Safari falls back to PNG
  const blob = (await encode("image/webp", 0.9)) ?? (await encode("image/png"));
  if (!blob) throw new UploadError("That image couldn’t be processed.");
  return blob;
}

/** Uploads a prepared logo and returns its public URL. */
export async function uploadLogo(blob: Blob): Promise<string> {
  let res: Response;
  try {
    res = await fetch("/api/upload", { method: "POST", headers: { "content-type": blob.type }, body: blob });
  } catch {
    throw new UploadError("Upload failed. Check your connection and try again.");
  }
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !data.url) {
    throw new UploadError(data.error || (res.status === 404 ? "Logo uploads aren’t available here." : "Upload failed. Please try again."));
  }
  return data.url;
}
