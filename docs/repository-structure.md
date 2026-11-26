# Cấu trúc Smart E-Hub

```text
smart_e_hub/
├── index.html                        Điểm vào SPA
├── start-demo.bat
├── tools/serve.mjs                   Máy chủ HTTP tĩnh cục bộ
├── assets/
│   ├── fonts/                        Font Inter phục vụ ngoại tuyến
│   ├── icons/                        Icon cục bộ
│   └── images/                       Tài nguyên bản đồ, campus-schematic.svg dùng trên SPA
├── data/                             21 tệp JSON seed và cấu hình
├── src/
│   ├── app.js, router.js             Khởi động, phiên, sự kiện và điều hướng
│   ├── components/                   Bản đồ và thành phần dùng chung
│   ├── pages/
│   │   ├── student/                  Tra cứu Hub, nhận/trả xe, đỗ/sạc
│   │   └── operator/views.js         Sáu màn hình Operator
│   ├── application/
│   │   ├── student.js, operator.js   Handler UC01–UC14
│   │   ├── charging.js              Cấp/ngắt điện và số liệu phiên
│   │   ├── device-control.js        Gắn kết quả lệnh vào hồ sơ nghiệp vụ
│   │   ├── pending-effects.js       Xử lý lệnh và phân công đã commit
│   │   ├── simulation.js            Mẫu, snapshot, dự báo và điểm nghẽn
│   │   └── telemetry.js             Gói tin, cảm biến và thời hạn dữ liệu
│   ├── domain/                       Quy tắc, sức chứa, sự cố và thông báo
│   ├── infrastructure/              OperationalStore, AuthService, DeviceControlGateway
│   ├── utils/status.js              Mã trạng thái và nhóm trạng thái hoạt động
│   └── styles/                       CSS và font
├── tests/                            Test Node, Playwright và ca thủ công
└── docs/
    ├── references/submission-3.pdf   PDF thiết kế tham chiếu
    ├── submission-3/                 Deployment, Implementation, lớp, phương thức và PlantUML
    ├── data-schema.md, uc-catalog.md
    ├── final/                        Kịch bản demo, xác minh và tài liệu bàn giao
    └── team/                         Phân công và ghi chép nhóm
```

Đường chạy chính là `index.html → src/app.js → router, UI và Application`. Giao dịch cập nhật trạng thái qua `OperationalStore`. Các module đọc cục bộ từ `data/` và lưu thay đổi trong trình duyệt.

## Kiến trúc đang thực thi

| Tầng | Tệp chính | Trách nhiệm |
| --- | --- | --- |
| Presentation | src/app.js, src/router.js, src/pages/, src/components/ | Shell, hash route, form, bản đồ, nhãn trạng thái và thông báo |
| Application | src/application/ | Handler Sinh viên và Operator, sạc, mô phỏng, telemetry và xử lý sau commit |
| Domain | src/domain/, src/utils/status.js | Điều kiện cấp phát, khung giờ, version, sức chứa, sự cố và thông báo |
| Infrastructure | src/infrastructure/store.js, device.js | JSON seed, lưu/khôi phục, giao dịch cục bộ, AuthService và DeviceControlGateway mô phỏng |

OperationalStore sao chép trạng thái thành draft, chạy validation và mọi thay đổi đồng bộ, ghi snapshot rồi mới công bố trạng thái mới. Nếu validation hoặc lưu trữ thất bại, trạng thái đã commit trước đó được giữ lại. Lệnh thiết bị được xác nhận qua các bước riêng để biểu diễn được timeout và bằng chứng vật lý trước khi hoàn tất nghiệp vụ.

Mã nguồn có đủ 44 lớp mang tên trong Submit 3. Controller nhận thao tác qua router và event handler. Các thực thể Domain tham chiếu bằng ID và giữ cùng định dạng JSON khi lưu. Store khôi phục kiểu lớp khi đọc dữ liệu hoặc tạo bản nháp giao dịch. Lệnh điều phối và kế hoạch sạc lưu hàng đợi trước khi xử lý phản hồi mô phỏng sau commit.

Xem [Implementation View](docs/submission-3/development-view.md), [tài liệu 44 lớp và 184 phương thức](docs/submission-3/class-and-method-descriptions.md) và [ánh xạ dữ liệu](docs/submission-3/class-model-fixes.md).
