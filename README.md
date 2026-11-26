# Smart E-Mobility Hub

Ứng dụng SPA thuần cho bài tập lớn Công nghệ phần mềm của nhóm 5vang3sao, bao phủ UC01–UC14. HTML, CSS, JavaScript ES modules và dữ liệu mẫu chạy trên máy chủ tĩnh. Toàn bộ tài nguyên giao diện nằm trong dự án.

## Chạy trên máy cá nhân

Trong thư mục C:\Code\smart_e_hub, chạy một trong hai lệnh sau.

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

Hoặc dùng Node.js 22 trở lên.

```powershell
node tools/serve.mjs
```

Mở http://127.0.0.1:8000. Dùng cùng địa chỉ và cổng cho các lần demo để khôi phục đúng dữ liệu đã lưu. Các URL localhost, 127.0.0.1 và các cổng khác nhau có vùng localStorage riêng. ES modules và JSON được tải qua HTTP, vì vậy hãy mở ứng dụng qua máy chủ tĩnh.

Có thể nhấp đúp start-demo.bat. Script ưu tiên máy chủ Node nếu Node đã được cài, sau đó dùng Python. Dừng máy chủ bằng Ctrl+C.

## Tài khoản mô phỏng

| Tài khoản | Vai trò | Xe cá nhân | Mật khẩu |
| --- | --- | --- | --- |
| student01 | Sinh viên | PV-01 | 123456 |
| student02 | Sinh viên | PV-02 | 123456 |
| operator01 | Vận hành | — | 123456 |
| dual01 | Sinh viên và Vận hành | PV-03 | 123456 |

Nhấp tên người dùng ở góc phải để đăng xuất. Mỗi tài khoản thấy các màn hình tương ứng với quyền của mình. Router và bộ xử lý use case kiểm tra quyền từ phiên đã đăng nhập.

## Dữ liệu và điều khiển demo

- 5 Hub, 26 xe dùng chung, xe cá nhân, ô đỗ, cổng và lịch sạc có sẵn trong data/*.json. Các Hub có mã H-01 đến H-05 tương ứng Metro, KTX A, Thư viện, Bách khoa và KTX B.
- H-01 có xe E-102 phù hợp để bắt đầu demo. H-02 có nhiều ô dùng chung để nhận xe. H-04 gần đầy và H-05 mất kết nối để trình diễn dữ liệu cũ.
- CHG-01-01 đang có phiên sạc của student02 (PV-02) và lịch tương lai của dual01 (PV-03). CHG-01-02 trống để student01 thử sạc ngay.
- E-304 tại H-03 có phiên sạc mẫu trên CHG-03-01 để demo ngắt sạc, xác nhận rút cáp rồi mở khóa. Dữ liệu này có sẵn ở phiên mới hoặc sau khi khôi phục dữ liệu mẫu.
- Nút Điều khiển demo ở cuối sidebar tăng thời gian thêm 1, 2, 15 hoặc 60 phút. Dùng chức năng này để thử hết hạn giữ xe, check-in và thay đổi chỉ số năng lượng. Nhánh khôi phục dữ liệu có hộp xác nhận.
- Mỗi 15 giây, nguồn telemetry giả lập gửi heartbeat cho các Hub trực tuyến, xử lý thời hạn và cập nhật UI. Hub đã bị ngắt kết nối thủ công giữ nguyên dữ liệu cũ đến khi phát gói hợp lệ.
- Trạng thái đã commit được lưu vào localStorage với khóa ehub_state. Các tab cùng địa chỉ demo dùng chung dữ liệu vận hành, còn tài khoản đang đăng nhập được giữ riêng theo từng tab. Tải lại tab vẫn giữ tài khoản, đơn, chuyến, lịch, cọc và đồng hồ.

## Kiến trúc đang thực thi

| Tầng | Tệp chính | Trách nhiệm |
| --- | --- | --- |
| Presentation | src/app.js, src/router.js, src/pages/, src/components/ | Shell, hash route, form, bản đồ, nhãn trạng thái và thông báo |
| Application | src/application/ | Handler Sinh viên và Operator, sạc, mô phỏng, telemetry và xử lý sau commit |
| Domain | src/domain/, src/utils/status.js | Điều kiện cấp phát, khung giờ, version, sức chứa, sự cố và thông báo |
| Infrastructure | src/infrastructure/store.js, device.js | JSON seed, lưu/khôi phục, giao dịch cục bộ, AuthService và DeviceControlGateway mô phỏng |

OperationalStore sao chép trạng thái thành draft, chạy validation và mọi thay đổi đồng bộ, ghi snapshot rồi mới công bố trạng thái mới. Nếu validation hoặc lưu trữ thất bại, trạng thái đã commit trước đó được giữ lại. Lệnh thiết bị được xác nhận qua các bước riêng để biểu diễn được timeout và bằng chứng vật lý trước khi hoàn tất nghiệp vụ.

Mã nguồn có đủ 44 lớp mang tên trong Submit 3. Controller nhận thao tác qua router và event handler. Các thực thể Domain tham chiếu bằng ID và giữ cùng định dạng JSON khi lưu. Store khôi phục kiểu lớp khi đọc dữ liệu hoặc tạo bản nháp giao dịch. Lệnh điều phối và kế hoạch sạc lưu hàng đợi trước khi xử lý phản hồi mô phỏng sau commit.

Xem [PDF Submit 3](docs/references/submission-3.pdf), [Deployment View](docs/submission-3/deployment-view.md), [Implementation View](docs/submission-3/development-view.md) và [44 lớp cùng 184 phương thức](docs/submission-3/class-and-method-descriptions.md).

## Đối chiếu use case và cách kiểm tra

| UC | Route sau dấu # | Module | Dấu hiệu hoàn tất |
| --- | --- | --- | --- |
| 01 | /student/hub-search | student.searchHubs, hub-search.js | Tìm theo tên, khu vực hoặc bán kính từ mốc demo, lọc loại xe và pin |
| 02 | /student/hub-search | student.validateBooking → confirmReservation | Xem trước kèm version, giữ xe 15 phút sau xác nhận |
| 03 | /student/pickup-return | student.beginPickup → leaveSlot | Xác nhận ngắt sạc và rút cáp trước khi mở khóa xe còn nối sạc. Ô nguồn chỉ trống sau xác nhận xe rời ô |
| 04 | /student/pickup-return | student.requestReturn → finishReturn | Chuyến hoàn tất, xe và ô đích nhất quán |
| 05 | /student/parking-charging | student.bookParking → leaveParking | Giữ cọc cùng đơn, slot đổi theo cảm biến |
| 06 | /student/parking-charging | student.bookCharging | Giữ lịch theo khung giờ, kiểm tra trùng và công suất |
| 07 | /student/parking-charging | student.plugCharger → unplugCharger | Ngắt điện rồi rút đầu cắm mới mở cổng |
| 08 | /operator/network-dashboard | networkSnapshot, operator views | Tải, công suất, kết nối và thời điểm cập nhật, xuất JSON hoặc CSV |
| 09 | /operator/vehicle-dispatch | operator dispatch | Giữ sức chứa đích và bàn giao theo từng xe |
| 10 | /operator/charging-schedule | proposeSchedule, schedule.apply, processPendingEffects | Lưu kế hoạch và lệnh, ghi phản hồi từng cổng đủ điều kiện |
| 11 | /operator/incidents | recordIncident, operator incident | Ngắt an toàn, cách ly, gửi lại phiếu cùng mã và xử lý đơn bị ảnh hưởng |
| 12 | /operator/what-if | simulation.run, simulation.template | Lưu và chạy lại mẫu, dự báo thiếu xe, đầy ô và quá tải sạc |
| 13 | /operator/what-if | recommendation apply/batch/compensate | Kiểm tra lại live state, áp dụng theo lựa chọn và audit |
| 14 | /operator/telemetry | telemetry.emit, checkSensorTimeouts | Gói Hub, xe, ô và cổng, cảnh báo lỗi và timeout từng thiết bị |

Kịch bản xuyên suốt nằm trong [docs/final/demo-script.md](docs/final/demo-script.md). Danh sách kiểm tra thủ công nằm trong [tests/manual/test-cases.md](tests/manual/test-cases.md).

## Chạy kiểm thử

Kiểm thử nghiệp vụ chỉ cần Node.js 22 trở lên và thư viện chuẩn.

```powershell
node --test tests/*.test.mjs
```

Các ca kiểm thử bao gồm tranh cùng tài nguyên, check-in sát hạn, lỗi ghi giữa giao dịch, đổi chốt trả, một xe chiếm ô, điều phối 4/5 xe, ô đích bị cách ly, lệnh sạc sau commit, phiên sạc lỗi, phiếu bảo trì gửi lại, dữ liệu mô phỏng cũ và telemetry cảm biến.

Kiểm thử trình duyệt là công cụ phát triển tùy chọn. Nó dùng Playwright và Edge đã cài trên máy. Khi Playwright được cài riêng, đặt PLAYWRIGHT_MODULE thành đường dẫn thư mục package. Với máy chủ đang chạy, thực hiện như sau.

```powershell
$env:PLAYWRIGHT_MODULE='C:/duong-dan-toi/playwright'
$env:DEMO_URL='http://127.0.0.1:8000'
node tests/browser-smoke.mjs
```

Đặt DEMO_SCREENSHOT thành đường dẫn PNG nếu cần chụp màn bản đồ. Mỗi lần kiểm thử dùng browser context riêng, có seed riêng. Kết quả lần chạy bàn giao được ghi trong docs/final/verification.md.

## Các giả định và giới hạn MVP

- Phạm vi triển khai theo bản nộp 3, mục 2.3. Xác thực, telemetry, relay, khóa xe, đội vận chuyển và bảo trì đều được mô phỏng phía client. Phân quyền trong UI phục vụ minh họa thiết kế. Dữ liệu tài khoản mẫu nằm trong tệp tĩnh.
- Demo dùng Web Locks để tuần tự hóa giao dịch giữa các tab cùng origin trong một hồ sơ trình duyệt. Mỗi giao dịch đọc lại snapshot đã commit trước khi kiểm tra version. Các trình duyệt, hồ sơ và thiết bị khác nhau có dữ liệu độc lập. Chạy demo bằng trình duyệt hỗ trợ Web Locks trên localhost hoặc 127.0.0.1.
- Kịch bản đỗ xe giữ cọc 50.000 đồng. No-show quá thời gian ân hạn khấu trừ cọc một lần. Hệ thống nhả khoản giữ khi hủy hợp lệ hoặc check-in. Các giá trị nằm trong config.json.
- What-if dự báo theo bước 15 phút trên bản chụp mạng lưới. Lượt lấy xe, tỷ lệ xe đến và nhu cầu sạc là giả định demo. Kết quả hiển thị cả độ mới của dữ liệu đầu vào.
- Phiên sạc ước tính kWh từ công suất và thời gian mô phỏng, chi phí từ cấu hình. Kết quả cần được trình bày là số liệu demo khi bảo vệ.
- Bản đồ và tọa độ tìm bán kính là dữ liệu mô phỏng khu đô thị. Phông Inter được đóng gói để chạy ngoại tuyến.
