# Schema dữ liệu (`data/*.json`)

Trạng thái: **chỗ giữ chỗ**, chưa có dữ liệu. Điền theo kế hoạch ở Phần 3.

## Quy ước chung

- Mỗi file là **một mảng object**, mỗi object có `id` duy nhất. Riêng `config.json` là một object.
- Tham chiếu chéo **chỉ bằng `xxxId`** (không lồng object của file khác).
- Thời gian: chuỗi ISO 8601. Tiền: số nguyên VNĐ. Pin: 0-100. Công suất: kW. Năng lượng: kWh.
- **Không lưu số liệu tự tính** (`slotsFree`, `chargersFree`, `avgBattery`, `status` của Hub). Các số này phải tính từ `parking-spaces`, `charging-points`, `vehicles` để màn hình không mâu thuẫn nhau.
- Trạng thái viết HOA, tập trung ở `src/utils/status.js`.
- Ngưỡng nghiệp vụ (pin tối thiểu 30%, giữ chỗ 15 phút, ngắt sạc 95%, timeout cảm biến 30 giây) đặt trong `config.json`, không gõ cứng trong code.

## Tiền tố ID

| Tiền tố | Thực thể |
| --- | --- |
| `H-` | Hub |
| `P-` | Ô đỗ (parking space) |
| `CHG-` | Cổng sạc (charging point) |
| `E-` / `S-` | Xe đạp điện / scooter dùng chung |
| `PV-` | Xe điện cá nhân |
| `U-` | Người dùng |
| `W-` | Ví |
| `RES-` | Đặt chỗ (xe hoặc ô đỗ) |
| `TRP-` | Chuyến đi |
| `SCH-` | Lịch sạc |
| `CSS-` | Phiên sạc |
| `DSP-` | Lệnh điều phối |
| `INC-` | Sự cố |
| `WO-` | Phiếu bảo trì |
| `SIM-` | Kịch bản mô phỏng |
| `REC-` | Khuyến nghị |
| `TEL-` | Gói tin telemetry |
| `NTF-` | Thông báo |
| `LOG-` | Nhật ký (audit) |

## Danh mục file

| File | Vai trò | Use case |
| --- | --- | --- |
| `hubs.json` | Hub, toạ độ bản đồ, trạng thái kết nối | UC01, UC08, UC14 |
| `parking-spaces.json` | Ô đỗ xe dùng chung và ô đỗ xe cá nhân | UC01, UC04, UC05 |
| `charging-points.json` | Cổng sạc, chuẩn kết nối, công suất | UC06, UC07, UC10, UC11 |
| `vehicles.json` | Xe dùng chung, mức pin, vị trí đỗ | UC01, UC02, UC03, UC04, UC09, UC10 |
| `private-vehicles.json` | Xe điện cá nhân của sinh viên | UC05, UC06, UC07 |
| `users.json` | Tài khoản demo và vai trò (STUDENT / OPERATOR) | Đăng nhập |
| `wallets.json` | Số dư, tiền giữ cọc, lịch sử giao dịch | UC02, UC05, UC07 |
| `tariffs.json` | Biểu giá điện theo khung giờ | UC06, UC07 |
| `reservations.json` | Đặt xe dùng chung và đặt ô đỗ cá nhân | UC02, UC05 |
| `trips.json` | Chuyến đi: nhận xe, trả xe, cước | UC03, UC04 |
| `charging-schedules.json` | Lịch sạc cá nhân và hàng đợi sạc thông minh | UC06, UC10 |
| `charging-sessions.json` | Phiên sạc thực tế: SoC, kW, kWh, chi phí | UC07 |
| `dispatch-orders.json` | Lệnh điều phối luân chuyển xe giữa các Hub | UC09, UC13 |
| `incidents.json` | Sự cố xe / cổng sạc từ 3 nguồn | UC03, UC04, UC11, UC14 |
| `work-orders.json` | Phiếu bảo trì và cách ly tài sản | UC11 |
| `simulation-scenarios.json` | Kịch bản mẫu và kết quả các lần chạy What-if | UC12 |
| `recommendations.json` | Khuyến nghị điều phối và quyết định áp dụng | UC13 |
| `telemetry-events.json` | Gói tin cảm biến: VALID / STALE / CORRUPT / TIMEOUT | UC14 |
| `notifications.json` | Thông báo cho người dùng và vai trò | Dùng chung |
| `audit-logs.json` | Nhật ký thao tác, phục vụ truy vết | NFR Observability |
| `teams.json` | Đội vận chuyển và đội kỹ thuật | UC09, UC11 |
| `config.json` | Ngưỡng nghiệp vụ và trọng số điểm ưu tiên (tài khoản demo nằm ở `users.json`) | Dùng chung |