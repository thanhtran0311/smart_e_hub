# Quy ước đối chiếu Submit 3

[PDF Submit 3](../references/submission-3.pdf) là chuẩn cho tên và chữ ký của mô hình logic. Mục 2.3 giải thích việc hiện thực mô hình trên SPA cục bộ. Mục 3 dùng bảy sơ đồ, 44 lớp và 184 phương thức. Tên được lặp lại ở các hình là tham chiếu đến cùng lớp. Bảng 4–10 xác định chữ ký và mô tả phương thức. Tên `compensateCommands` theo Bảng 10 và mục 3.7.

| Nội dung | Nơi tra cứu |
| --- | --- |
| Hạ tầng chạy và kết nối | [Deployment View](deployment-view.md) |
| Cấu trúc và phụ thuộc | [Implementation View](development-view.md) |
| Lớp và chữ ký | [Phương thức theo lớp](class-and-method-descriptions.md), [PlantUML](diagrams/classes.puml) |
| Đối chiếu mô hình với SPA | [Ánh xạ mô hình](class-model-fixes.md), [schema](../data-schema.md) |
| Trạng thái và ngưỡng thực thi | [status.js](../../src/utils/status.js), [config.json](../../data/config.json) |

Mã dùng hai vai trò demo `student` và `operator` trong phiên. Đội vận chuyển và tổ bảo trì là bản ghi `teams`. Giá trị tiền cọc 50.000 đồng thuộc kịch bản UC05 hiện hành của demo và được giữ cùng giao dịch tạo đơn. Hủy hợp lệ hoặc check-in sẽ nhả khoản giữ.

Đặt xe, ô và cổng nhận version từ dữ liệu đã hiển thị. Giao dịch xác minh version cùng khung giờ và hiện trạng trước khi giữ tài nguyên. Thời điểm đo của cảm biến, thời điểm nhận và thời hạn phản hồi điều khiển được lưu riêng.

Mô hình logic có thể dùng một chữ ký dịch vụ tương ứng với vài bước UI. Ví dụ, nhận xe có bước xác minh, phản hồi mở khóa và xác nhận của sinh viên. Sau khi áp dụng lịch sạc, lệnh chờ thuộc snapshot đã commit và được xử lý theo điều kiện từng cổng.
