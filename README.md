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

`api/price.ts` thử lần lượt các nguồn, nguồn nào có đủ dữ liệu thì dùng:

1. **CompSniper** — giá **đã bán** trên eBay (gói miễn phí 100 lượt/tháng, 1 lượt = 1 máy).
2. **eBay Browse API** — giá **đang rao** (đồ cũ, Mua ngay), dùng khi CompSniper hết lượt hoặc thiếu dữ liệu.
3. **Claude + tìm kiếm web** — tùy chọn, tốn phí, chỉ chạy khi có `PRICE_TOKEN`.

Mỗi nguồn đều lọc tiêu đề đúng mẫu (loại biến thể như XA2, OM-2 SP, R1s), loại máy hỏng / phụ kiện / lô, bỏ giá ngoại lai (IQR) rồi lấy trung vị.

Biến môi trường trong Vercel → Settings → Environment Variables (cần ít nhất một nguồn):

| Biến | Ghi chú |
|---|---|
| `COMPSNIPER_API_KEY` | Khóa `cs_…` từ compsniper.com |
| `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` | Keyset **Production** trên developer.ebay.com |
| `PRICE_TOKEN` | Tùy chọn; nếu đặt, nhập giống hệt vào Cài đặt trong app |
| `ANTHROPIC_API_KEY` | Tùy chọn; dự phòng bằng Claude (chỉ chạy khi có `PRICE_TOKEN`) |

Yahoo! Auction JP không còn API công khai (đóng từ 2/2018) nên không được tích hợp tự động; màn Nhập tay vẫn có link mở trang kết quả đã bán của Yahoo.

Sau khi thêm biến, Redeploy một lần.

## Thư viện mẫu máy

- `data/catalog.json` — dữ liệu gốc (4.613 mẫu, 425 mẫu có thông số), nhập một lần bằng `scripts/import-dataset.mjs`.
- `data/catalog-contrib.json` — các đóng góp sửa/thêm, mỗi dòng ghi người góp, ngày, nguồn.
- `scripts/build-catalog.mjs` chạy trước `dev`/`build`, gộp hai file thành `src/generated/catalog.json` (không commit).
- Nhãn chất lượng: Đã đối chiếu · Trích tự động từ trang hãng · Thông tin một phần · Mới có tên mẫu.
- Ảnh mẫu lấy qua `/api/image` từ Wikimedia Commons (file đóng góp → Wikidata → tìm theo tên khớp chính xác), luôn kèm tác giả và giấy phép.

### Đóng góp từ trong app

Đóng góp được lưu ngay trên máy, rồi `/api/contribute` commit vào `data/catalog-contrib.json` trên GitHub → Vercel tự build lại.

| Biến môi trường | Ý nghĩa |
|---|---|
| `GITHUB_TOKEN` | Fine-grained token, chỉ repo này, quyền Contents: Read and write |
| `GITHUB_REPO` | `zelgnuj/kho-may` |
| `CONTRIB_TOKEN` | Mã đóng góp tự đặt; nhập cùng mã trong Cài đặt → Thư viện mẫu máy |
| `GITHUB_BRANCH` | Tùy chọn, mặc định `main` |

## Cấu trúc

- `src/db.ts` — schema Dexie, kiểu dữ liệu, cài đặt
- `src/lib/` — định dạng tiền/ngày, nhận dạng loại máy, CSV, ảnh, tỷ giá, thống kê
- `src/pages/` — Kho máy, Chi tiết, Thêm/Sửa, Giá trị, Dữ liệu, Cài đặt
