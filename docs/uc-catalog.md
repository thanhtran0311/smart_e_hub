# Danh mục Use Case: tên chính thức, trang, route

## Chốt tên gọi

Báo cáo Submit 2 (bản v2) đã dùng **tên Use Case theo Submission 2** trong toàn bộ mục lục và phần mô tả. Vì vậy tài liệu này lấy **tên S2 làm chuẩn chính thức** cho code, sơ đồ, test case và bài nộp.

Mockup dùng nhãn ngắn hơn trên sidebar — nhãn đó **chỉ dùng cho giao diện**, không dùng trong tài liệu thiết kế.

Ngoài ra, theo nhận xét của giảng viên (mục 7 bảng đối chiếu v2), **không dùng chữ "thông minh"/"tối ưu"** cho UC10; dùng "lịch sạc đề xuất theo quy tắc ưu tiên".

## Bảng 14 Use Case

| UC | Tên chính thức (S2) | Nhãn sidebar (mockup) | Trang | Hash route |
| --- | --- | --- | --- | --- |
| UC01 | Tìm kiếm và tra cứu Hub & Phương tiện | Tra cứu & Đặt xe | `student/hub-search` | `#/student/hub-search` |
| UC02 | Đặt trước phương tiện | (cùng màn UC01) | `student/hub-search` | `#/student/hub-search` |
| UC03 | Mở khóa và Nhận phương tiện | Nhận & Trả xe | `student/pickup-return` | `#/student/pickup-return` |
| UC04 | Trả phương tiện và Kết thúc hành trình | (cùng màn UC03) | `student/pickup-return` | `#/student/pickup-return` |
| UC05 | Đặt trước vị trí đỗ xe | Đỗ & Sạc xe cá nhân | `student/parking-charging` | `#/student/parking-charging` |
| UC06 | Đăng ký lịch sạc pin | (cùng màn UC05) | `student/parking-charging` | `#/student/parking-charging` |
| UC07 | Kích hoạt và Theo dõi phiên sạc | (cùng màn UC05) | `student/parking-charging` | `#/student/parking-charging` |
| UC08 | Giám sát mạng lưới Hub | Giám sát mạng lưới | `operator/network-dashboard` | `#/operator/network-dashboard` |
| UC09 | Điều phối phương tiện giữa các Hub | Điều phối luân chuyển | `operator/vehicle-dispatch` | `#/operator/vehicle-dispatch` |
| UC10 | Quản lý trạm sạc và Điều phối lịch sạc | Lập lịch sạc theo quy tắc ưu tiên | `operator/charging-schedule` | `#/operator/charging-schedule` |
| UC11 | Cách ly sự cố và Yêu cầu bảo trì | Xử lý sự cố kỹ thuật | `operator/incidents` | `#/operator/incidents` |
| UC12 | Mô phỏng kịch bản What-If | Mô phỏng What-if | `operator/what-if` | `#/operator/what-if` |
| UC13 | Đánh giá và Áp dụng khuyến nghị điều phối | (cùng màn UC12) | `operator/what-if` | `#/operator/what-if` |
| UC14 | Thu thập và Xử lý dữ liệu Telemetry IoT | Đồng bộ cảm biến IoT | `operator/telemetry` | `#/operator/telemetry` |

## Ghi chú áp dụng

- **Đăng nhập là giả lập SSO**: tài khoản demo khai trong `users.json`, không xây xác thực thật. Ghi rõ trong báo cáo.
- **Actor** phải theo đúng Quy ước (a) và Bảng 2 của v2: `CSDL`, `Resource Validator`, `Simulation Engine`, `Mô-đun lập lịch sạc`, `Event Processor` là **thành phần nội bộ**, không phải Actor. `VNU-SSO`, `IoT/Bộ điều khiển`, `Đội vận chuyển`, `Đơn vị bảo trì` là Actor.
- **Nghiệp vụ ví/tiền cọc đã bị bỏ** theo Quy ước (f): không tạm giữ cọc, không trừ tiền, không phạt tiền. Chi phí chỉ hiển thị ở chế độ giả lập. Vì vậy không có lớp `Wallet` trong sơ đồ lớp.
- **Giao diện là ứng dụng web** và demo trên trình duyệt. Báo cáo v2 còn vài chỗ ghi "Mobile App" (UC01, UC02, UC05, UC06) — cần sửa thành "ứng dụng web" để khớp `deployment-view`.
