# Smart E-Hub

Bộ khung thư mục cho MVP Smart E-Mobility Hub của nhóm 5vang3sao.
Dựa trên đề bài, Submission 1, Submission 2 và mockup nhóm cung cấp.

## Trạng thái hiện tại

- Chỉ tạo cấu trúc dự án; chưa triển khai chức năng hay giao diện mới.
- Các file HTML, CSS, JS, sơ đồ và tài liệu thiết kế là file trống để nhóm điền sau.
- `data/` có 22 file JSON, mỗi file chỉ chứa `[]` (riêng `config.json` là `{}`); schema quy ước ghi ở `docs/data-schema.md`.
- Mockup và ba PDF trong `docs/references/` là bản sao nguyên vẹn, chỉ đổi tên cho dễ tìm.
- `index.html` hiện trống nên mở lên sẽ chưa thấy giao diện. Muốn xem mẫu cũ, mở `docs/references/mockup.html`; mẫu này có thể cần Internet cho thư viện/font bên ngoài.
- Chưa cài thư viện, chưa có lệnh build, chưa có backend hay database.

## Cách chạy demo

Bản thật sẽ nạp `data/*.json` và các trang trong `src/pages/` bằng JavaScript, nên **không mở trực tiếp qua `file://`** (trình duyệt sẽ chặn `fetch`).

- Cách 1: chạy `start-demo.bat` (dùng `python -m http.server 8000` rồi mở `http://localhost:8000/`).
- Cách 2: mở thư mục dự án bằng VS Code và dùng extension **Live Server**.

## Hướng triển khai đề xuất

Dùng HTML, CSS và JavaScript thuần để tận dụng mockup hiện có. Cấu trúc này là đề xuất ban đầu, không phải yêu cầu bắt buộc của môn học hay quyết định công nghệ đã được nhóm duyệt.

`index.html` là khung trang chính; `src/app.js` khởi tạo ứng dụng và `src/router.js` chuyển màn hình. Các trang trong `src/pages/` dự kiến là phần nội dung được nạp vào khung chính, không phải các ứng dụng riêng. Thành phần lặp lại nằm trong `src/components/`.

Mỗi màn hình và mỗi component gồm **một cặp file**: `.html` là markup fragment (không `<!DOCTYPE>`, không `<script>`, không `<link>`), `.js` là controller export `{ id, layout, mount, unmount }`. Quy ước này ghi chi tiết trong `STRUCTURE.md`. Danh sách Use Case, tên chính thức, trang và hash route ghi trong `docs/uc-catalog.md`.

`src/services/` dành cho nghiệp vụ và cập nhật trạng thái; `src/models/` dành cho mô hình dữ liệu/lớp nếu nhóm dùng cách tổ chức hướng đối tượng. Tên lớp hiện chỉ là chỗ giữ; chưa xác định thuộc tính, phương thức hay quan hệ UML. Nhóm có thể điều chỉnh theo thiết kế Submit 3.

`src/storage/app-state.js` giữ trạng thái dùng chung giữa các màn hình; `src/storage/event-bus.js` phát sự kiện để màn hình đang mở cập nhật lại. Các service dùng cùng trạng thái để tránh mỗi màn hình giữ một bản dữ liệu riêng.

## JSON và lưu thay đổi trong bản demo

- `data/*.json`: dữ liệu ban đầu để nạp khi khởi tạo hoặc đặt lại demo.
- `src/storage/json-loader.js`: chỗ dành cho việc đọc các file JSON sau này.
- `src/storage/local-storage.js`: chỗ dành cho lưu/khôi phục trạng thái bằng localStorage sau này.
- Trình duyệt không tự ghi ngược thay đổi vào file JSON của dự án. localStorage chỉ giữ dữ liệu trong trình duyệt đang dùng, không đồng bộ nhiều máy/người dùng.
- Khi viết code, nên có thao tác đặt lại demo để xóa trạng thái đã lưu và nạp lại JSON gốc.
- Đây là phương án demo trên một trình duyệt. Nếu nhóm cần nhiều người thao tác đồng thời trên dữ liệu chung, cần xem lại lớp lưu trữ và bổ sung backend; cấu trúc hiện tại chưa giải quyết yêu cầu đó.
- Các tài khoản, ví và thanh toán trong demo chỉ là dữ liệu giả; không tích hợp thanh toán thật. Đăng nhập là **giả lập SSO**, không phải xác thực thật.

## Vai trò các thư mục

| Thư mục | Mục đích |
| --- | --- |
| `src/pages/` | Nội dung màn hình Sinh viên và Vận hành theo mockup (mỗi trang là cặp `.html` + `.js`) |
| `src/components/` | Header, sidebar, hộp đăng nhập, thông báo và bản đồ sơ đồ dùng chung (mỗi component là cặp `.html` + `.js`) |
| `src/styles/` | `base.css` (font, reset, scrollbar), `layout.css` (khung trang), `components.css` (thành phần và màu trạng thái) |
| `src/services/` | Xử lý nghiệp vụ, tách khỏi HTML |
| `src/models/` | Các lớp/mô hình dữ liệu dự kiến |
| `src/storage/` | Đọc JSON, trạng thái chung, event bus và lưu trình duyệt |
| `src/utils/` | Hàm hỗ trợ kiểm tra dữ liệu, thời gian, định dạng và sinh mã |
| `data/` | Dữ liệu JSON ban đầu, chưa có dữ liệu thực |
| `assets/fonts/` | Font Inter bản offline (thay Google Fonts) |
| `assets/images/` | Logo, favicon |
| `assets/vendor/` | `tailwind.js`, `lucide.js` bản offline (thay CDN, để demo không cần Internet) |
| `docs/references/` | Đề bài, hai bản submit và mockup gốc |
| `docs/submission-3/` | Deployment view, Development view, sơ đồ lớp và mô tả mọi phương thức |
| `docs/final/` | Kịch bản demo, báo cáo cuối kỳ nguồn Markdown, ảnh màn hình và slide |
| `docs/team/` | Phân công, biên bản họp và đánh giá chéo cuối kỳ |
| `tests/manual/` | Test case, gồm luồng chính, thay thế và lỗi |
| `tests/unit/` | Chỗ dành cho test nghiệp vụ khi bắt đầu triển khai |

Các file `.gitkeep` chỉ giữ thư mục rỗng khi đưa lên Git. Xem `STRUCTURE.md` để tra toàn bộ cây thư mục, `docs/data-schema.md` cho schema JSON và `docs/uc-catalog.md` cho bảng Use Case.

## Đối chiếu chức năng

| Use case | Màn hình trong `src/pages/` | Service dự kiến chính |
| --- | --- | --- |
| UC01 Tra cứu Hub và tài nguyên | `student/hub-search.html` | `hub-service.js` |
| UC02 Đặt xe | `student/hub-search.html` | `reservation-service.js`, `wallet-service.js` |
| UC03 Nhận xe, UC04 Trả xe | `student/pickup-return.html` | `trip-service.js`, `incident-service.js` |
| UC05 Đặt chỗ đỗ | `student/parking-charging.html` | `parking-service.js`, `reservation-service.js`, `wallet-service.js` |
| UC06 Đặt lịch sạc, UC07 Phiên sạc | `student/parking-charging.html` | `charging-service.js`, `wallet-service.js` |
| UC08 Giám sát mạng lưới | `operator/network-dashboard.html` | `monitoring-service.js`, `hub-service.js` |
| UC09 Điều phối xe | `operator/vehicle-dispatch.html` | `dispatch-service.js` |
| UC10 Lịch sạc thông minh | `operator/charging-schedule.html` | `charging-scheduler-service.js`, `charging-service.js` |
| UC11 Xử lý sự cố | `operator/incidents.html` | `incident-service.js`, `notification-service.js` |
| UC12 Mô phỏng What-if | `operator/what-if.html` | `simulation-service.js` |
| UC13 Áp dụng khuyến nghị | `operator/what-if.html` | `recommendation-service.js`, `dispatch-service.js`, `charging-scheduler-service.js` |
| UC14 Telemetry giả lập | `operator/telemetry.html` | `telemetry-service.js` |

`auth-service.js` dự kiến phục vụ đăng nhập demo/chọn vai trò. `notification-service.js` dự kiến dùng chung cho thông báo, gồm gợi ý điều hướng. `audit-log-service.js` ghi nhật ký thao tác theo yêu cầu phi chức năng về khả năng quan sát hệ thống. Không xem việc chọn vai trò trong trình duyệt là cơ chế phân quyền an toàn cho hệ thống thực tế.

## Lưu ý cho báo cáo

Các sơ đồ `.puml` là chỗ giữ cho nguồn PlantUML; nhóm có thể dùng công cụ UML khác và xuất hình vào `docs/submission-3/diagrams/exported/`. Tài liệu Markdown là bản nháp làm việc; bài nộp vẫn cần đúng định dạng mà đề/LMS yêu cầu.

Bài nộp cuối kỳ là 01 file PDF, nội dung bắt buộc liệt kê trong `docs/final/final-report.md`. Hãy hoàn thiện thiết kế lớp và phương thức dựa trên nghiệp vụ đã thống nhất, không coi tên file hiện tại là thiết kế hoàn chỉnh. Khi dùng AI để phát triển tiếp, cập nhật khai báo trong `docs/ai-usage.md`.
