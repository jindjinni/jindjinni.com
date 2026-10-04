// Browser-side helper: phone photos and big screenshots are often over the 4 MB
// upload limit, so shrink them (JPEG, longest side 2200 px) before sending.
// PDFs, GIFs and small images go as they are.

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export async function prepareUploadFile(file: File): Promise<File | { error: string }> {
  const isImage = file.type.startsWith("image/");
  if (isImage && file.type !== "image/gif" && file.size > 1.5 * 1024 * 1024) {
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
        if (blob && blob.size < file.size) {
          file = new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
        }
      }
    } catch {
      /* send the original and let the size check speak */
    }
  }
  if (file.size > MAX_UPLOAD_BYTES) return { error: "That file is over 4 MB. Choose a smaller file or a lower-resolution photo." };
  return file;
}
