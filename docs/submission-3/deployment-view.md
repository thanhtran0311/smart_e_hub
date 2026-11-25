# Deployment View

Tham chiếu [PDF Submit 3](../references/submission-3.pdf), mục 1 và Hình 1, trang in 2–4. [Sơ đồ SVG](diagrams/exported/submit3-deployment.svg), [nguồn PlantUML](diagrams/deployment.puml).

| Node hoặc artifact | Vai trò trong MVP |
| --- | --- |
| Máy cá nhân | Chạy trình duyệt và máy chủ tĩnh cục bộ. Sinh viên và Operator dùng cùng ứng dụng. |
| Máy chủ tĩnh | Phục vụ `index.html`, `src/`, `assets/` và `data/*.json` qua HTTP. Dùng Python `http.server` hoặc [máy chủ Node](../../tools/serve.mjs). |
| Trình duyệt | Chạy HTML, CSS và ES modules. JSON chỉ được đọc để tạo seed. |
| Web Storage | `localStorage` chứa snapshot theo khóa `ehub_state`, riêng cho từng origin và trình duyệt. |
| Mock VNU-SSO và IoT | Lời gọi nội bộ kiểm tra tài khoản demo, trả phản hồi thiết bị và mô phỏng heartbeat/telemetry. |

1. Chạy `node tools/serve.mjs` hoặc `python -m http.server 8000 --bind 127.0.0.1` tại thư mục dự án.
2. Mở `http://127.0.0.1:8000/`. Dùng cùng địa chỉ và cổng để nhận lại snapshot lưu trước đó.
3. Nút **Khôi phục dữ liệu mẫu** tạo lại snapshot từ seed và áp dụng thời điểm demo hiện tại cho các mốc tương đối.

Giao dịch dữ liệu và phản hồi thiết bị chạy trong một phiên trình duyệt. Việc làm mới sau khi commit đọc snapshot cục bộ. Mọi font, icon và bản đồ của MVP được tải từ các tệp trong dự án.
