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

Xem [Implementation View](docs/submission-3/development-view.md), [tài liệu 44 lớp và 184 phương thức](docs/submission-3/class-and-method-descriptions.md) và [ánh xạ dữ liệu](docs/submission-3/class-model-fixes.md).
