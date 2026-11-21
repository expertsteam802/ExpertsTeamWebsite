/**
 * Turns an uploaded image into a small square PNG data URL with a circular mask,
 * so the site logo, favicon and search/social preview all look round.
 */
export async function toCircularLogoDataUrl(file: File, size = 256): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Pick an image file (PNG, JPG or WebP).");
  if (file.size > 8 * 1024 * 1024) throw new Error("Pick a logo image smaller than 8MB.");

  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser could not process that image.");

  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.beginPath();
  // Keep a small transparent margin so the circular crop fits inside logo artwork.
  ctx.arc(size / 2, size / 2, (size / 2) * 0.95, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  const scale = Math.max(size / bitmap.width, size / bitmap.height);
  const width = bitmap.width * scale;
  const height = bitmap.height * scale;
  ctx.drawImage(bitmap, (size - width) / 2, (size - height) / 2, width, height);
  ctx.restore();
  bitmap.close();

  const dataUrl = canvas.toDataURL("image/png");
  if (dataUrl.length > 900_000) throw new Error("That image is too detailed — try a simpler logo.");
  return dataUrl;
}
