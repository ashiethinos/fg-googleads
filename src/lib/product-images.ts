/** Stable placeholder product images for sandbox catalog rows (works without a local image server). */
export function sandboxProductImageUrl(productId: string, size = 80): string {
  const seed = encodeURIComponent(productId);
  return `https://picsum.photos/seed/${seed}/${size}/${size}`;
}
