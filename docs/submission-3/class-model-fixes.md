# Ánh xạ lớp logic vào dữ liệu MVP

Tên lớp dưới đây theo [PDF Submit 3](../references/submission-3.pdf). Chữ ký của từng phương thức có trong [tài liệu lớp và phương thức](class-and-method-descriptions.md).

Các thực thể chạy dưới dạng instance của [lớp Domain](../../src/domain/entities.js). `SharedVehicle` và `PrivateVehicle` kế thừa `Vehicle`. Dữ liệu lưu giữ nguyên các khóa JSON, mã trạng thái và tham chiếu bằng ID. Khi đọc dữ liệu cũ hoặc sao chép bản nháp, [store khôi phục kiểu lớp](../../src/infrastructure/operational-snapshot.js) theo collection, riêng `reservations` dựa thêm vào trường `type`.

| Lớp hoặc nhóm lớp | Dữ liệu và hành vi trong SPA |
| --- | --- |
| `User`, `AuthService`, `OperationalStore` | `users`, `userId` và `src/infrastructure/store.js`. Vai trò dạng mảng để tài khoản `dual01` demo được hai phân hệ. |
| `Vehicle`, `SharedVehicle`, `PrivateVehicle` | UML dùng kế thừa từ `Vehicle`. Snapshot lưu `vehicles` và `privateVehicles` riêng với thuộc tính pin `soc` và liên kết theo ID. |
| `Reservation`, `ParkingReservation`, `Trip` | `reservations` phân biệt `VEHICLE` và `PARKING`. `CONFIRMED` biểu diễn đơn đã giữ. `CHECKING_IN`, `UNLOCKED`, `CONSUMED` theo dõi bàn giao xe. Đơn đỗ có `CHECKED_IN` và trường cọc. `trips` lưu bằng chứng trả xe. |
| `ParkingSpace`, `ChargingPort` | `slots`, `ports` và các trường quan sát cảm biến. `holdId` giữ sức chứa trả xe hoặc điều phối. `STOPPED` của cổng nghĩa là đã ngắt điện và còn chờ rút cáp. |
| `ChargingSchedule`, `ChargingSession` | `schedules`, `sessions`. `PLUGGED` và `STOPPED` tách các bước cắm và rút cáp để phản ánh hiện trạng. |
| `ChargingPlan`, `ChargingCommand`, `DeviceControlGateway` | `plans`, `deviceCommands`. Kết quả `SUCCESS` của thiết kế ánh xạ sang `DONE`. MVP có thêm `PENDING` trước khi gửi, `TIMEOUT` và `SKIPPED`. |
| `Sensor`, `TelemetryEvent` | `sensors`, `telemetry`. Heartbeat thuộc Hub. Gói ô/cổng/xe cập nhật quan sát tại thiết bị và có thể báo sai khác với trạng thái giao dịch. |
| `DispatchOrder`, `WorkOrder`, `Incident` | `orders`, `workOrders`, `incidents`. `teamId` nối đơn vị mô phỏng. Đơn điều phối ghi cả kết quả một phần, phiếu bảo trì giữ nguyên mã khi gửi lại. |
| `SimulationScenario`, `Recommendation`, `Notification`, `AuditLog` | `scenarios`, `recommendations`, `notifications`, `audit`. MVP lưu snapshot dự báo, kiểu đề xuất và kết quả áp dụng/bù. |

## Giới hạn hiện thực của demo

- `OperationalStore` giao dịch trên draft trong một phiên. Các điều kiện kiểm tra lại, thứ tự cập nhật và bước gửi sau commit mô phỏng hợp đồng thiết kế. Phản hồi thiết bị và đội vận chuyển được tạo cục bộ.
- UC10 lưu và xếp lịch điện cho cửa sổ đã xác nhận. MVP gửi lệnh bắt đầu cho cổng đủ điều kiện và giữ phiên đang cấp điện. Điều chỉnh vật lý một phiên đang chạy cần xử lý riêng qua lần ngắt an toàn.
- WorkOrder dùng mức độ sự cố làm ưu tiên và mô phỏng các mốc gửi, gửi lại và nghiệm thu. Xác thực SSO thật, điều khiển thiết bị vật lý và mô phỏng giao thông hiệu chỉnh bằng dữ liệu thực thuộc thiết kế mục tiêu.
