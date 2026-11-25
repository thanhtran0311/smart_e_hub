# Implementation View

Tham chiếu [PDF Submit 3](../references/submission-3.pdf), mục 2 và Hình 2, trang in 4–6. [Sơ đồ SVG](diagrams/exported/submit3-implementation.svg), [nguồn PlantUML](diagrams/development.puml).

| Tầng | Tệp hoặc thư mục | Trách nhiệm |
| --- | --- | --- |
| Presentation | [app.js](../../src/app.js), [router.js](../../src/router.js), [pages](../../src/pages), [components](../../src/components), [styles](../../src/styles) | Shell, điều hướng theo vai trò, nhập và hiển thị dữ liệu cho UC01–UC14. |
| Application | [student.js](../../src/application/student.js), [operator.js](../../src/application/operator.js), [charging.js](../../src/application/charging.js), [simulation.js](../../src/application/simulation.js), [telemetry.js](../../src/application/telemetry.js), [pending-effects.js](../../src/application/pending-effects.js), [device-control.js](../../src/application/device-control.js) | Thực thi use case, xác nhận lại version/hiện trạng, điều phối hậu commit và quản lý kết quả nghiệp vụ. |
| Domain | [resources.js](../../src/domain/resources.js), [student-rules.js](../../src/domain/student-rules.js), [incidents.js](../../src/domain/incidents.js), [notifications.js](../../src/domain/notifications.js), [status.js](../../src/utils/status.js) | Quy tắc sức chứa, khung giờ, an toàn, hiện trạng, sự cố và thông báo. |
| Infrastructure | [store.js](../../src/infrastructure/store.js), [device.js](../../src/infrastructure/device.js), [data](../../data) | Seed JSON, trạng thái, adapter lưu trữ, mock xác thực, heartbeat và phản hồi điều khiển. |

Presentation gửi thao tác qua handler Application. Application kiểm tra Domain và ghi vào draft của `OperationalStore.transaction()`. Store lưu draft trước khi công bố snapshot. Nếu ghi thất bại, snapshot trước đó tiếp tục có hiệu lực.

Luồng điều phối vận chuyển và lịch sạc lưu việc cần làm trong giao dịch tạo lệnh. `processPendingEffects()` đọc những lệnh đã commit, ghi xác nhận phân công mô phỏng hoặc xử lý phản hồi từng cổng. Với lịch sạc tương lai, lệnh có thể chờ đến khi đã vào khung giờ, cáp đã cắm, thiết bị sẵn sàng và công suất còn đủ.

Một số trang gọi hàm đọc của Domain để dựng giao diện. Các lớp nghiệp vụ trong PDF được biểu diễn bằng object JSON, liên kết ID và hàm. Xem [ánh xạ lớp và phương thức](class-and-method-descriptions.md) và [schema thực thi](../data-schema.md).
