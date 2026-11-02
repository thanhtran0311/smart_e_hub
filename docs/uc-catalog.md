# Danh mục Use Case: tên chính thức, trang, route

## Cần chốt

S1, S2 và mockup đang dùng **ba tên khác nhau** cho cùng một Use Case. Đề xuất: lấy **tên hiển thị trong mockup** làm chuẩn (vì đó là chữ giảng viên thấy khi demo), giữ tên S1/S2 trong ngoặc khi cần đối chiếu báo cáo.

| UC | S1 | S2 | Mockup (đề xuất dùng) | Trang | Hash route |
| --- | --- | --- | --- | --- | --- |
| UC01 | Tra cứu vị trí Hub & Tình trạng tài nguyên | Tìm kiếm và tra cứu Hub & Phương tiện | Tra cứu & Đặt xe | `student/hub-search` | `#/student/hub-search` |
| UC02 | Đặt trước phương tiện dùng chung | Đặt trước phương tiện | (cùng màn UC01) | `student/hub-search` | `#/student/hub-search` |
| UC03 | Mở khóa & Nhận phương tiện | Mở khóa và Nhận phương tiện | Nhận & Trả xe | `student/pickup-return` | `#/student/pickup-return` |
| UC04 | Trả phương tiện & Khóa xe | Trả phương tiện và Kết thúc hành trình | (cùng màn UC03) | `student/pickup-return` | `#/student/pickup-return` |
| UC05 | Đặt trước vị trí đỗ xe cá nhân | Đặt trước vị trí đỗ xe | Đỗ & Sạc xe cá nhân | `student/parking-charging` | `#/student/parking-charging` |
| UC06 | Đăng ký lịch sạc phương tiện | Đăng ký lịch sạc pin | (cùng màn UC05) | `student/parking-charging` | `#/student/parking-charging` |
| UC07 | Kích hoạt & Kết thúc phiên sạc cá nhân | Kích hoạt và Theo dõi phiên sạc | (cùng màn UC05) | `student/parking-charging` | `#/student/parking-charging` |
| UC08 | Giám sát trạng thái toàn mạng lưới Hub | Giám sát mạng lưới Hub | Giám sát mạng lưới | `operator/network-dashboard` | `#/operator/network-dashboard` |
| UC09 | Lập lệnh điều phối luân chuyển xe | Điều phối phương tiện giữa các Hub | Điều phối luân chuyển | `operator/vehicle-dispatch` | `#/operator/vehicle-dispatch` |
| UC10 | Lập & Điều chỉnh lịch sạc thông minh | Quản lý trạm sạc và Điều phối lịch sạc | Lập lịch sạc thông minh | `operator/charging-schedule` | `#/operator/charging-schedule` |
| UC11 | Xử lý sự cố kỹ thuật (Xe / Cổng sạc) | Cách ly sự cố và Yêu cầu bảo trì | Xử lý sự cố kỹ thuật | `operator/incidents` | `#/operator/incidents` |
| UC12 | Thiết lập & Chạy kịch bản mô phỏng What-if | Mô phỏng kịch bản What-If | Mô phỏng What-if | `operator/what-if` | `#/operator/what-if` |
| UC13 | Đánh giá & Áp dụng khuyến nghị điều phối | Đánh giá và Áp dụng khuyến nghị điều phối | (cùng màn UC12) | `operator/what-if` | `#/operator/what-if` |
| UC14 | Cập nhật dữ liệu cảm biến | Thu thập và Xử lý dữ liệu Telemetry IoT | Đồng bộ cảm biến IoT | `operator/telemetry` | `#/operator/telemetry` |

## Ghi chú

- Ba UC lệch tên rõ nhất: **UC10**, **UC14** (cả tên lẫn phạm vi). Riêng UC01 cũng khác về phạm vi (S1 chỉ tra cứu, S2 gồm cả tìm xe).
- Tên UC xuất hiện trong: tiêu đề trang, sidebar, `docs/submission-3/class-and-method-descriptions.md`, `classes.puml`, test case và file PDF cuối. Chốt trước khi viết trang để không phải sửa lại 4 nơi + xuất lại PDF.
- Đăng nhập là **giả lập SSO**: tài khoản demo khai trong `users.json`, không xây xác thực thật. Ghi rõ trong báo cáo.