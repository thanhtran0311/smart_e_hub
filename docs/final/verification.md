# Xác minh Smart E-Hub theo Submit 3

Kiểm tra ngày 26 tháng 11 năm 2026, múi giờ Asia/Saigon. Phạm vi là SPA cục bộ, seed trong `data/` và [PDF Submit 3](../references/submission-3.pdf).

## Kiểm thử tự động

Chạy `node --test tests/*.test.mjs` với Node.js 24.11.1. Kết quả **31 đạt, 0 lỗi, 0 bỏ qua**.

| Bộ test | Số ca | Hành vi đã kiểm tra |
| --- | --- | --- |
| `store.test.mjs` | 5 | Seed và liên kết, lỗi ghi rollback, khôi phục/reset, freshness, snapshot cũ thiếu các collection phát sinh |
| `student.test.mjs` | 13 | Đặt bằng version, tìm theo bán kính, chốt nhận và Hub offline, đổi chốt trả, đối soát sau lỗi ghi, giữ cọc, chống hai ô cùng xe, đặt sạc và timeout relay |
| `operator.test.mjs` | 13 | Phân công sau commit, ô đích lỗi, bàn giao 4/5, version lịch sạc, phản hồi độc lập từng cổng, ngắt an toàn từ hồ sơ, phiếu gửi lại, mô phỏng và khuyến nghị, phân quyền, telemetry |

## Trình duyệt

Chạy `node tests/browser-smoke.mjs` trên Edge headless qua Playwright, máy chủ Node tĩnh lắng nghe ở `http://127.0.0.1:8174/`. Kết quả **6/6 nhóm đạt**, desktop 1365 × 920 và mobile 390 × 844.

- Tìm Hub, lọc bán kính, đặt E-102, xác nhận khóa, rời ô, tải lại và trả xe.
- Giữ cọc, check-in, đặt cổng, ghi kWh, ngắt điện rồi rút cáp.
- Trang giới thiệu, đăng nhập theo vai trò, thông tin tài khoản và các nhãn điều hướng.
- Chặn route sai vai trò, tạo lệnh điều phối và bàn giao 4/5 xe.
- Áp dụng kế hoạch sạc có lệnh chờ, bỏ gói trùng, nhận gói từ ô, lưu/chạy mẫu What-if, gửi khuyến nghị, tạo sự cố và xuất CSV.
- Điều hướng mobile, kiểm tra tràn ngang, đăng xuất và mở thông báo đã gửi sau khi đăng nhập Sinh viên. Bộ thu lỗi ghi nhận 0 lỗi JavaScript hoặc HTTP trong các luồng này.

## Tài liệu thiết kế

Đã đối chiếu 44 lớp, 184 chữ ký ở Bảng 4–10 và thứ tự chữ ký giữa [tài liệu phương thức](../submission-3/class-and-method-descriptions.md) và [nguồn sơ đồ](../submission-3/diagrams/classes.puml). PlantUML xuất được chín SVG và các tệp đều đọc được dưới dạng XML. [Danh mục ca thủ công](../../tests/manual/test-cases.md) chứa các bước demo và kiểm tra bổ sung.
