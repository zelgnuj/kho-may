# Roadmap — Camera Cabinet

## Đã xong

- **Chặng 0 — Nền móng:** sao lưu kèm ảnh, chống trình duyệt tự xoá dữ liệu, nhắc sao lưu, test tự động + CI.
- **Chặng 1 — Tài khoản & đồng bộ:** đăng nhập email/mật khẩu (Supabase), đồng bộ máy, ảnh, wishlist, nhật ký film giữa các thiết bị.
- Tiếng Anh / tiếng Việt, hiển thị giá trị bằng VNĐ hoặc USD.
- Trưng bày: trình diễn tự chạy toàn màn hình, ảnh chia sẻ (một máy / cả bộ sưu tập).

## Làm sau

### Lên store (app native)

- **Google Play:** đóng gói PWA thành app Android (TWA). Gần như không phải sửa code.
- **App Store:** bọc bằng Capacitor, giữ nguyên code React. Cần:
  - Mac + Xcode (hoặc build trên cloud) và tài khoản Apple Developer.
  - Trang chính sách quyền riêng tư; nút **xoá tài khoản** trong app (Apple bắt buộc khi có đăng nhập).
  - Link xác nhận email / đặt lại mật khẩu mở thẳng vào app (universal link).
  - Tính năng native để qua vòng duyệt và có ích thật: thông báo đẩy (hạn trả máy, nhắc sao lưu, wishlist về tầm giá), widget màn hình chính, chụp ảnh và chia sẻ native.
- Kiểm tra lại phí tài khoản và luật thanh toán trong app trước khi làm.

### Album ảnh theo máy / theo roll (cần app native)

Bấm vào một máy → xem các roll đã chụp bằng máy đó → xem ảnh của từng roll, lấy thẳng từ album trong ứng dụng Ảnh.

- Mỗi roll liên kết với một album trong thư viện Ảnh (PhotoKit trên iOS, MediaStore trên Android), app chỉ lưu mã định danh album.
- Ảnh đọc trực tiếp từ máy mỗi lần mở: album thêm ảnh là app thấy ngay, không tốn dung lượng cloud.
- Liên kết chỉ có hiệu lực trên thiết bị đã gắn; thiết bị khác sẽ báo "album nằm trên máy khác".
- Hỏi quyền truy cập Ảnh khi gắn album lần đầu; xử lý trường hợp người dùng chỉ cho truy cập một phần ảnh.
- Không làm được trên bản web/PWA: trình duyệt không được đọc album ảnh.
- Làm cùng đợt với bản App Store (phụ thuộc mục trên).

### Trang trưng bày công khai

Link riêng (vd `/u/ten`) cho người khác xem bộ sưu tập không cần cài app; bật/tắt từng máy, không bao giờ lộ giá, serial, nơi mua. Cần ảnh công khai riêng, giữ tên người dùng không trùng.
