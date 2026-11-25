# Schema dữ liệu (`data/*.json`)

Các tệp JSON là dữ liệu khởi tạo chỉ đọc. `loadStore()` nạp 21 tệp qua HTTP. Bản demo có 5 Hub, 26 xe dùng chung, 3 xe cá nhân, 1 phiên sạc đang chạy và 1 lịch tương lai tại cùng một cổng Metro. Các danh sách lệnh và lịch sử giao dịch bắt đầu trống.

## Quy ước chung

- Mỗi file là **một mảng object**, mỗi object có `id` duy nhất. Riêng `config.json` là một object.
- Tham chiếu chéo **chỉ bằng `xxxId`** (không lồng object của file khác).
- Trong seed, `@now` là lúc khởi tạo demo, `@now+75m` là 75 phút sau đó. Khi nạp hoặc reset, bộ lưu trữ chuyển các giá trị này thành số mili giây Unix. Khi tải lại, các thời điểm đã lưu được giữ nguyên. Tiền tính bằng đồng, pin theo phần trăm, công suất theo kW và điện năng theo kWh.
- **Không lưu số liệu tự tính** (`slotsFree`, `chargersFree`, `avgBattery`, `status` của Hub). Các số này phải tính từ `parking-spaces`, `charging-points`, `vehicles`.
- Xe dùng chung, ô, cổng và lịch sạc giữ `version` và `updatedAt` để kiểm tra lại khi xác nhận giao dịch. Mẫu đặt gửi version của tài nguyên đang hiển thị.
- [Mã trạng thái](../src/utils/status.js) định nghĩa giá trị trong snapshot và nhóm trạng thái dùng chung. [Ánh xạ lớp](submission-3/class-model-fixes.md) đối chiếu với tên trong PDF.
- Các ngưỡng nghiệp vụ chính và tham số mô phỏng nằm trong `config.json`.

## Tiền tố ID

| Tiền tố | Thực thể |
| --- | --- |
| `H-` | Hub |
| `P-` | Ô đỗ |
| `CHG-` | Cổng sạc |
| `E-` / `S-` | Xe đạp điện / scooter dùng chung |
| `PV-` | Xe điện cá nhân |
| `U-` | Người dùng |
| `RES-` | Đơn đặt trước (xe hoặc ô đỗ) |
| `TRP-` | Lượt thuê |
| `SCH-` | Lịch sạc |
| `CSS-` | Phiên sạc |
| `DSP-` | Lệnh điều phối |
| `INC-` | Sự cố |
| `WO-` | Phiếu bảo trì |
| `SIM-` | Kịch bản mô phỏng |
| `REC-` | Khuyến nghị |
| `TEL-` | Gói tin telemetry |
| `NTF-` | Thông báo |
| `LOG-` | Nhật ký |

## Danh mục 21 file

| File | Vai trò | UC |
| --- | --- | --- |
| `hubs.json` | Hub, tọa độ sơ đồ, vĩ độ/kinh độ demo, cờ `offline` của heartbeat và `lastTelemetryAt` | UC01, UC08, UC14 |
| `parking-spaces.json` | Ô đỗ dùng chung và ô đỗ cá nhân | UC01, UC04, UC05 |
| `charging-points.json` | Cổng sạc, chuẩn kết nối, `powerKw` | UC06, UC07, UC10, UC11 |
| `vehicles.json` | Xe dùng chung: pin, vị trí đỗ, `nextTripAt` | UC01–UC04, UC09, UC10 |
| `private-vehicles.json` | Xe điện cá nhân của sinh viên | UC05, UC06, UC07 |
| `users.json` | Tài khoản demo và vai trò (nguồn duy nhất) | Đăng nhập |
| `tariffs.json` | Dữ liệu biểu giá tham chiếu. Demo tính chi phí từ cấu hình hiện hành | UC07 |
| `teams.json` | Đội vận chuyển và đội kỹ thuật | UC09, UC11 |
| `reservations.json` | Đơn đặt xe và đơn đặt ô đỗ (`noShow` là cờ, không phải trạng thái) | UC02, UC05 |
| `trips.json` | Lượt thuê: nhận xe, trả xe, cước giả lập | UC03, UC04 |
| `charging-schedules.json` | Lịch sạc (UC06) và hàng đợi của mô-đun lập lịch (UC10) | UC06, UC10 |
| `charging-sessions.json` | Phiên sạc thực tế: SoC, kW, kWh, chi phí tạm tính | UC07 |
| `dispatch-orders.json` | Lệnh điều phối luân chuyển | UC09, UC13 |
| `incidents.json` | Sự cố xe / cổng sạc từ 3 nguồn | UC03, UC04, UC11, UC14 |
| `work-orders.json` | Phiếu bảo trì và cách ly tài sản | UC11 |
| `simulation-scenarios.json` | Kịch bản mẫu và kết quả từng lần chạy What-if | UC12 |
| `recommendations.json` | Khuyến nghị và quyết định áp dụng / từ chối / hoàn tác | UC13 |
| `telemetry-events.json` | Gói tin cảm biến và kết quả APPLIED / IGNORED_DUPLICATE / IGNORED_STALE / REJECTED_CORRUPT / TIMEOUT | UC14 |
| `notifications.json` | Thông báo cho người dùng và vai trò | Dùng chung |
| `audit-logs.json` | Nhật ký thao tác phục vụ truy vết | NFR Observability |
| `config.json` | Bảng 3 — tham số cấu hình nghiệp vụ | Dùng chung |

## Trạng thái trong trình duyệt

Snapshot bổ sung `plans`, `deviceCommands` và `sensors`. Phiên schema 1 thiếu các danh sách này được nạp với mảng mặc định. Lệnh thiết bị lưu `id`, `targetId`, `command`, `result`, thời điểm tạo/gửi/hạn/phản hồi và liên kết lịch hoặc kế hoạch khi có. Trạng thái quan sát từ cảm biến ô/cổng được lưu riêng với kết quả giao dịch để giữ bằng chứng đối soát.

Tên tệp và tên collection được ánh xạ tại `src/infrastructure/store.js`. Ví dụ `parking-spaces.json` nạp vào `slots`, `charging-points.json` vào `ports`, `charging-schedules.json` vào `schedules` và `charging-sessions.json` vào `sessions`. Mỗi lần ghi tạo một bản nháp độc lập. Khi việc ghi `ehub_state` thành công, bản nháp trở thành snapshot mới. Dữ liệu chỉ chia sẻ giữa hai phân hệ trong cùng phiên trên cùng trình duyệt.

Góp ý của giảng viên và yêu cầu của bản demo đưa tiền cọc trở lại UC05. Tài khoản lưu `balance` là tổng số dư và `held` là số đang giữ. Số khả dụng bằng `balance - held`. Đơn đỗ lưu chính sách cọc theo lần đặt ở `deposit` và `depositStatus`. UC05 giữ 50.000 đồng cùng giao dịch tạo đơn. Khi nhận ô đúng hạn hoặc hủy hợp lệ, hệ thống giải phóng khoản giữ. Trường hợp quá hạn nhận ô áp dụng quy tắc mất cọc trong demo.

Một lịch đỗ có `slotId`, `start` và `end`. Cảm biến ô lưu `vehicleId` và `status`. `holdId` là giữ ô vật lý phục vụ một lượt trả hoặc lệnh điều phối đang diễn ra. Tương tự, lịch sạc tương lai liên kết cổng qua `portId`; việc cắm đầu sạc, đóng relay, dừng phiên và rút đầu cắm được ghi riêng ở UC07.

## Ánh xạ Bảng 3 (v2) sang `config.json`

| Tham số trong báo cáo | Khoá trong `config.json` | Mặc định | Dùng ở |
| --- | --- | --- | --- |
| T_HOLD | `T_HOLD_MIN` | 15 phút | UC02 |
| MIN_SOC_BOOK | `MIN_SOC_BOOK_PCT` | 30% | UC02, UC04 |
| T_CONFIRM | `T_CONFIRM_MIN` | 2 phút | UC03 |
| T_GRACE | `T_GRACE_MIN` | 15 phút | UC05, UC06 |
| MIN_SOC_RELOCATE | `MIN_SOC_RELOCATE_PCT` | 40% | UC09 |
| DEFAULT_SOC_FILTER | `DEFAULT_SOC_FILTER_PCT` | 70% | UC01 |
| HUB_FULL_RATIO | `HUB_FULL_RATIO` | 0.9 | UC08, UC14 |
| HUB_LOW_AVAIL_RATIO | `HUB_LOW_AVAIL_RATIO` | 0.1 | UC08 |
| LOW_SOC_ALERT | `LOW_SOC_ALERT_PCT` | = MIN_SOC_BOOK | UC14 |
| HUB_POWER_LIMIT | `hubPowerLimitKw.<hubId>` | theo Hub | UC06, UC10, UC13 |
| PRIORITY_WEIGHTS | `priorityWeights` | cấu hình | UC10 |
| TELEMETRY_TIMEOUT | `TELEMETRY_TIMEOUT_SEC` | **60 giây** | UC08, UC14 |
| CONTROL_TIMEOUT | `CONTROL_TIMEOUT_SEC` | 10 giây | UC07, UC10, UC11 |
| Khoảng gửi lại chuyển hướng | `REDIRECT_NOTIFICATION_INTERVAL_SEC` | 60 giây/người | UC13 |
| Tiền cọc đỗ xe | `PARKING_DEPOSIT_VND` | 50.000 đồng | UC05 |
| Đơn giá điện demo | `CHARGING_RATE_VND_KWH` | 3.000 đồng/kWh | UC07 |

## Trạng thái `PENDING_CHECK` (Quy ước (d))

Đối với đặt xe dùng chung, lúc hủy hoặc hết hạn, hệ thống đối chiếu trạng thái thực tế mới nhất:

| Thực tế | Trạng thái mới |
| --- | --- |
| Xe còn nằm đúng ô nguồn, ô ghi OCCUPIED với đúng vehicleId, tài nguyên an toàn và Hub còn dữ liệu mới | Xe về `AVAILABLE`, ô vẫn có xe |
| Thiếu bằng chứng xe còn đúng chốt, đã mở khóa, đang bị chặn hoặc dữ liệu Hub quá `TELEMETRY_TIMEOUT_SEC` | Xe `PENDING_CHECK` để Operator xác minh |
| Vị trí đang sự cố | giữ `FAULTED` / `OUT_OF_SERVICE` |

Đối với lịch đỗ và lịch sạc, việc hủy hoặc hết hạn giải phóng quyền giữ khoảng thời gian. Trạng thái vật lý hiện tại của ô hoặc cổng vẫn do cảm biến và phiên sử dụng quyết định.
