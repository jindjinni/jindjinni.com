// Browser-side helper for photos going to storage. Each file may be at most 4 MB, but modern cameras give far bigger pictures
// (a 4K photo is often 3-6 MB, an 8K one 10-20 MB). So instead of shrinking every picture to a small fixed size, we keep as many
// pixels as will fit: the picture is saved at its full size when it already fits, otherwise at the largest size (and at a high
// JPEG quality) that fits in 4 MB. PDFs, GIFs and pictures that already fit go as they are, untouched.

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
/** What we aim for: a little under the limit, because the upload adds a few bytes of its own. */
export const FIT_TARGET_BYTES = Math.floor(3.8 * 1024 * 1024);
/** 8K (7680 x 4320). Nothing bigger is kept. */
export const MAX_PIXELS = 7680 * 4320;
/** First JPEG quality tried (0 to 1). High enough that small print stays crisp. */
const START_QUALITY = 0.9;

/**
 * The next size to try after a picture came out `size` bytes when `target` was wanted. A JPEG's size follows its pixel count,
 * so the side shrinks by the square root of the ratio, with a little margin so the next try lands under the target.
 */
export function nextScale(scale: number, size: number, target: number): number {
  if (!(size > 0) || !(target > 0)) return scale * 0.8;
  const next = scale * Math.sqrt(target / size) * 0.96;
  return Math.max(0.2, Math.min(scale * 0.95, next));
}

/** "8K", "4K", "Full HD" ... for the longest side of a picture, in plain words. */
export function resolutionLabel(width: number, height: number): string {
  const long = Math.max(width, height);
  if (long >= 7000) return "8K";
  if (long >= 3700) return "4K";
  if (long >= 2500) return "QHD";
  if (long >= 1800) return "Full HD";
  if (long >= 1200) return "HD";
  return "low resolution";
}

type Source = Blob | ImageBitmap;

/**
 * Re-saves a picture as a JPEG of at most `target` bytes, keeping as many pixels as that allows. Returns null when the picture
 * can't be opened or can't be made small enough. A JPEG that already fits is returned as it is.
 */
export async function fitImageToBytes(source: Source, name: string, target = FIT_TARGET_BYTES): Promise<File | null> {
  const blobIn = typeof Blob !== "undefined" && source instanceof Blob ? source : null;
  if (blobIn && blobIn.size <= target && (blobIn.type === "image/jpeg" || blobIn.type === "image/webp")) {
    return new File([blobIn], name, { type: blobIn.type });
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = blobIn ? await createImageBitmap(blobIn) : (source as ImageBitmap);
  } catch {
    return null;
  }
  try {
    let scale = Math.min(1, Math.sqrt(MAX_PIXELS / (bitmap.width * bitmap.height)));
    let blob: Blob | null = null;
    for (let i = 0; i < 7; i++) {
      blob = await encode(bitmap, scale, START_QUALITY);
      if (!blob) {
        // this device can't make a canvas that big: try a smaller one
        scale *= 0.7;
        continue;
      }
      if (blob.size <= target) break;
      scale = nextScale(scale, blob.size, target);
    }
    if (blob && blob.size > target) blob = await encode(bitmap, scale, 0.7);
    if (!blob || blob.size > target) return null;
    return new File([blob], name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } finally {
    if (blobIn) bitmap.close?.();
  }
}

async function encode(bitmap: ImageBitmap, scale: number, quality: number): Promise<Blob | null> {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality));
  } catch {
    return null;
  }
}

export async function prepareUploadFile(file: File): Promise<File | { error: string }> {
  const isImage = file.type.startsWith("image/");
  if (isImage && file.type !== "image/gif" && file.size > FIT_TARGET_BYTES) {
    const fitted = await fitImageToBytes(file, file.name);
    if (fitted) file = fitted;
  }
  if (file.size > MAX_UPLOAD_BYTES) return { error: "That file is over 4 MB. Choose a smaller file or a lower-resolution photo." };
  return file;
}
