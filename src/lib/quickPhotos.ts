/** Ảnh vừa chụp từ nút + chờ được gắn vào một máy mới (trang Thêm máy lấy ra một lần) */
let held: Blob[] = [];
export function holdPhotos(b: Blob[]) { held = b; }
export function takeHeldPhotos(): Blob[] { const b = held; held = []; return b; }
