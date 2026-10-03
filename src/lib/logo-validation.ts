// Shared between the Business Profile logo upload action and the signup
// flow (logo is now mandatory at signup -- see src/app/actions/auth.ts).

export const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2MB -- plenty for a logo, small enough to embed in every page/receipt that shows it
export const ALLOWED_LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/jpg"]);

export async function encodeLogoFile(
  file: File,
): Promise<{ data: string; contentType: string } | { error: string }> {
  if (!ALLOWED_LOGO_TYPES.has(file.type)) {
    return { error: "Logo must be a PNG or JPG image." };
  }
  if (file.size > MAX_LOGO_BYTES) {
    return { error: "Logo must be 2MB or smaller." };
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  return { data: buffer.toString("base64"), contentType: file.type };
}
