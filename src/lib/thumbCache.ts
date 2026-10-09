/** URL ảnh thu nhỏ đang giữ trong bộ nhớ (tách riêng để db.ts gọi được khi xoá ảnh) */
export const thumbUrls = new Map<string, string>();

export function forgetThumb(photoId: string) {
  const u = thumbUrls.get(photoId);
  if (u) URL.revokeObjectURL(u);
  thumbUrls.delete(photoId);
}
