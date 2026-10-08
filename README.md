# Kho máy

Web app (PWA) quản lý bộ sưu tập máy ảnh film. Cài được lên màn hình chính điện thoại, chạy cả khi không có mạng.

## Tính năng (bản 0.1)

- Kho máy: lưới / danh sách / kệ trưng bày, tìm kiếm, lọc theo loại (PNS, Rangefinder, SLR, Half-frame, Máy số…), sắp xếp
- Chi tiết máy: ảnh, trạng thái, film đang lắp, giá thị trường + lịch sử, giá mua, ống kính, nhật ký bảo dưỡng
- Cập nhật giá bán tự động: mở sẵn eBay (đã bán), Yahoo! Auction JP, Google; nhập 1–3 giá, app lấy giá giữa
- Giá trị bộ sưu tập theo thời gian, theo loại máy, theo hãng
- Nhập CSV từ CamDex (tự nhận dạng loại máy, tách ngày mua / nơi mua / ống kính từ ghi chú)
- Xuất CSV, sao lưu / khôi phục JSON (kèm ảnh nếu muốn)
- Tỷ giá ¥ / $ → VNĐ tự động (open.er-api.com) hoặc nhập tay

Dữ liệu lưu trên thiết bị (IndexedDB). Mỗi bản ghi có `id`, `updatedAt`, `deletedAt` để sau này đồng bộ lên tài khoản.

## Chạy trên máy

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # bản production trong dist/
```

## Deploy

Vercel: Import repo → Framework "Vite" → Deploy (`vercel.json` đã có rewrite cho router).

### Tự tra giá thị trường

`api/price.ts` lấy giá từ **eBay Browse API** (tin đang rao bán, đồ cũ, Mua ngay), lọc tin hỏng / phụ kiện / biến thể khác tên, bỏ giá ngoại lai rồi lấy trung vị. Đây là giá rao, thường cao hơn giá thực bán.

Biến môi trường trong Vercel → Settings → Environment Variables:

| Biến | Bắt buộc | Ghi chú |
|---|---|---|
| `EBAY_CLIENT_ID` | có | App ID (Client ID) của keyset **Production** trên developer.ebay.com |
| `EBAY_CLIENT_SECRET` | có | Cert ID (Client Secret) của keyset Production |
| `PRICE_TOKEN` | không | Nếu đặt, nhập giống hệt vào Cài đặt trong app |
| `ANTHROPIC_API_KEY` | không | Bật dự phòng bằng Claude + tìm kiếm web khi eBay thiếu dữ liệu (tốn phí; chỉ chạy khi có `PRICE_TOKEN`) |

Sau khi thêm biến, Redeploy một lần.

## Cấu trúc

- `src/db.ts` — schema Dexie, kiểu dữ liệu, cài đặt
- `src/lib/` — định dạng tiền/ngày, nhận dạng loại máy, CSV, ảnh, tỷ giá, thống kê
- `src/pages/` — Kho máy, Chi tiết, Thêm/Sửa, Giá trị, Dữ liệu, Cài đặt
