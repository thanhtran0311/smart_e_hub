# Đối chiếu giao diện Smart E-Hub với mockup.html

[Mockup giao diện](../references/mockup.html) là tài liệu tham chiếu cho phần trình bày. Script nội tuyến của mockup tạo trạng thái demo cho ảnh đối chiếu. Ứng dụng hiển thị dữ liệu của dự án và tiếp tục gọi các luồng hiện có.

## Design token trong mockup

Các giá trị dưới đây tính theo gốc `16px`. Khi CSS tùy chỉnh ghi đè utility Tailwind, cột mô tả ghi giá trị hiển thị.

| Nhóm | Giá trị |
| --- | --- |
| Nền và chữ | Canvas `#f7f8fa`, màu chữ gốc `#172033`, tiêu đề và ghim đang chọn `#0f172a`, nền thẻ `#ffffff`, nền dịu `#f8fafc`, nền bản đồ `#f1f4f8`. Utility nền bản đồ ban đầu dùng `#eef3f9` và được CSS tùy chỉnh ghi đè. |
| Slate | 50 `#f8fafc`, 100 `#f1f5f9`, 200 `#e2e8f0`, 300 `#cbd5e1`, 400 `#94a3b8`, 500 `#64748b`, 600 `#475569`, 700 `#334155`, 800 `#1e293b`, 900 `#0f172a`. Viền tùy chỉnh trên nền slate nhạt dùng `#e8edf3`. |
| Blue | 50 `#eff6ff`, 100 `#dbeafe`, 200 `#bfdbfe`, 300 `#93c5fd`, 800 `#1e40af`, 900 `#1e3a8a`, 950 `#172554`. Mục sidebar đang chọn dùng `#eff4ff` với chữ `#1e3a8a`. |
| Emerald | 50 `#ecfdf5`, 100 `#d1fae5`, 200 `#a7f3d0`, 400 `#34d399`, 500 `#10b981`, 600 `#059669`, 700 `#047857`, 800 `#065f46`, 900 `#064e3b`. |
| Amber | 50 `#fffbeb`, 100 `#fef3c7`, 200 `#fde68a`, 300 `#fcd34d`, 400 `#fbbf24`, 600 `#d97706`, 800 `#92400e`, 900 `#78350f`. |
| Red | 50 `#fef2f2`, 100 `#fee2e2`, 200 `#fecaca`, 300 `#fca5a5`, 400 `#f87171`, 500 `#ef4444`, 600 `#dc2626`, 700 `#b91c1c`, 800 `#991b1b`. |
| Purple | 100 `#f3e8ff`, 300 `#d8b4fe`, 900 `#581c87`. |
| SVG bản đồ | ViewBox `800 × 600`, co giãn theo cả hai trục. Vùng xanh lá `#dcfce7` ở 65%, hai vùng xanh lam `#dbeafe` ở 60% và 50%. Đường `#cbd5e1` rộng 18, tim đường `#ffffff` rộng 6 và nét đứt `10 8`. |
| Độ trong suốt | Header giới thiệu trắng 96%, thanh trạng thái trắng 90%, nền tóm tắt đặt xe blue-50 40%, nền modal slate-900 30% và blur 4 px. |
| Font và weight | Google Fonts `Inter, sans-serif`, 400, 500, 600, 700. Log IoT dùng stack monospace mặc định của Tailwind. |
| Cỡ chữ / line-height | `10/15`, `11/16.5`, `12/16`, `13/16` (sidebar), `14/20`, `16/24` (body) hoặc `16/26` (đoạn giới thiệu), `18/28`, `20/28`, `24/32` px. Tựa giới thiệu dùng `clamp(32px, 4vw, 52px)` và line-height `1.12`. |
| Tracking | Gốc `-0.01em`, tựa giới thiệu `-0.045em`, heading trong workspace `-0.025em`, nhãn nhóm sidebar `0.08em`. Utility `tracking-wide` và `tracking-wider` là `0.025em` và `0.05em`. |
| Khoảng cách | Thang gap/padding thực dùng `2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 32, 40, 48, 80px`. Hero padding `80px 24px`, gap dọc `24px`. Header app padding ngang `28px`. Sidebar `20px`, thanh trạng thái `12px 28px`, bản đồ `20px`, vùng chi tiết Hub và trang nghiệp vụ desktop `32px`. |
| Bo góc | `4, 6, 8, 10, 12, 16, 9999px`. Bo `10px` cho logo, sidebar và CTA giới thiệu. Thẻ và bảng trắng thường bo `12px`. Modal và nền log IoT bo `16px`. |
| Bóng | Thẻ, ghim bản đồ và đa số nút app có `box-shadow: none` sau ghi đè. Khi còn áp dụng, `shadow-sm` là `0 1px 2px 0 rgb(0 0 0 / 5%)`. Modal có `0 20px 25px -5px rgb(0 0 0 / 10%)` và `0 8px 10px -6px rgb(0 0 0 / 10%)`. Markup nguồn cũng có các utility `shadow`, `shadow-md` và `shadow-inner`. |
| Kích thước | Header giới thiệu `65px` gồm viền, header app `72px`, logo `40px` và `36px`, avatar `32px`, tìm kiếm `192px`, sidebar `240px` → `216px` → `192px`, hàng nav tối thiểu `40px`, CTA tối thiểu `46px`, scrollbar `5px`. Giới thiệu rộng tối đa `1100px`, cụm hero `920px`, tựa `780px`, đoạn mô tả `650px`, modal `448px`. Bản đồ và inspector chia `8/12` và `4/12` trên desktop. |
| Icon | Lucide SVG, viewBox `24 × 24`, stroke `2`, đầu nét và góc bo. Icon nhỏ `14px`, điều hướng và nút `16px`, đóng modal `20px`. Nguồn dùng `compass, activity, x, map-pin, search, bell, bike, plug-zap, bar-chart-3, arrow-left-right, zap, wrench, sliders, radio, home, parking-square, navigation, battery-charging, locate-fixed, git-Commit, check-circle-2, unlock, lock, wallet, download`. |
| Breakpoint | Utility Tailwind có hiệu lực từ `640px` (sm), `768px` (md), `1024px` (lg). CSS bổ sung ghi đè ở `max-width: 1024px` và `max-width: 640px`. Mockup 390 px vẫn dành `192px` cho sidebar, để lại `198px` cho nội dung. |

Màu, typography, khoảng cách, bo góc và bóng dùng chung nằm trong [base.css](../../src/styles/base.css). Inter được đóng gói theo các tập Latin, Latin mở rộng và tiếng Việt. Markup dùng hình học SVG của Lucide cùng [SVG bản đồ](../../assets/images/campus-schematic.svg).

## Khác biệt theo màn hình và ảnh giao diện hiện tại

Ảnh chụp trực tiếp từ ứng dụng trên Microsoft Edge. Bản desktop dùng khung **1365 × 920**. Bản di động rộng **390 px** chụp toàn bộ nội dung cuộn dọc, riêng hộp thoại đăng nhập dùng khung **390 × 844**.

Ảnh các màn nghiệp vụ có dữ liệu phát sinh từ thao tác trong kịch bản demo. Cột mô tả ghi lại các thay đổi so với giao diện trước đợt đối chiếu. [Kịch bản demo](demo-script.md)

| Màn hình | Trước khi sửa → sau khi sửa | Desktop | 390 px |
| --- | --- | --- | --- |
| Giới thiệu | Trang gốc mở thẳng bản đồ → trang giới thiệu riêng với logo BK, bốn thẻ số liệu và hai lối đăng nhập theo phân hệ. | [Ảnh](screenshots/mockup2/desktop-landing.png) | [Ảnh](screenshots/mockup2/390-landing.png) |
| Đăng nhập | Modal cũ viền và bóng đậm, lựa chọn tài khoản phía trên → modal trắng, nền mờ, nhãn phân hệ và nhóm nút ở chân form. | [Ảnh](screenshots/mockup2/desktop-login.png) | [Ảnh](screenshots/mockup2/390-login.png) |
| Tra cứu và đặt xe | Sidebar tối, banner số liệu, bản đồ xanh và bảng xe phía dưới → header và sidebar trắng, thanh trạng thái, nền SVG theo mockup, ghim dạng thẻ, bộ lọc và inspector bên phải. | [Ảnh](screenshots/mockup2/desktop-hub-search.png) | [Ảnh](screenshots/mockup2/390-hub-search.png) |
| Nhận và trả xe | Tiêu đề lớn và nút cùng một màu → hai thẻ theo nhóm nhận/trả, nút xanh lam và xanh lục, icon mở/khóa. | [Ảnh](screenshots/mockup2/desktop-pickup-return.png) | [Ảnh](screenshots/mockup2/390-pickup-return.png) |
| Đỗ và sạc xe cá nhân | Bố cục hai hàng, số dư trong thẻ lớn → ba cột theo công việc và số dư trên thanh tiêu đề. | [Ảnh](screenshots/mockup2/desktop-parking-charging.png) | [Ảnh](screenshots/mockup2/390-parking-charging.png) |
| Giám sát mạng lưới | KPI và các danh sách xếp dọc → bảng tình trạng Hub với tỷ lệ lấp đầy, pin trung bình, cổng sạc, nhãn kết nối và nút xuất báo cáo. Bản đồ và nhật ký nằm trong các mục mở rộng. | [Ảnh](screenshots/mockup2/desktop-network-dashboard.png) | [Ảnh](screenshots/mockup2/390-network-dashboard.png) |
| Điều phối luân chuyển | Form và danh sách bàn giao nối dọc → form bên trái, theo dõi bàn giao bên phải, ô chọn xe gọn hơn. | [Ảnh](screenshots/mockup2/desktop-vehicle-dispatch.png) | [Ảnh](screenshots/mockup2/390-vehicle-dispatch.png) |
| Lập lịch sạc | Phân bổ và hàng đợi cùng một thẻ → thanh công suất, bảng lịch và khung kế hoạch đã áp dụng. | [Ảnh](screenshots/mockup2/desktop-charging-schedule.png) | [Ảnh](screenshots/mockup2/390-charging-schedule.png) |
| Sự cố | Form và hồ sơ xếp dọc → hồ sơ bên trái, form lập hồ sơ bên phải, nút cách ly tông đỏ. | [Ảnh](screenshots/mockup2/desktop-incidents.png) | [Ảnh](screenshots/mockup2/390-incidents.png) |
| What-if | Cấu hình, kết quả và khuyến nghị xếp dọc → thiết lập và dự báo bên trái, khuyến nghị bên phải. | [Ảnh](screenshots/mockup2/desktop-what-if.png) | [Ảnh](screenshots/mockup2/390-what-if.png) |
| Telemetry | Form dọc và log thẻ trắng → thanh nhập liệu gọn và log nền tối dùng font monospace. | [Ảnh](screenshots/mockup2/desktop-telemetry.png) | [Ảnh](screenshots/mockup2/390-telemetry.png) |

Ảnh bản đồ khi chọn Ký túc xá Khu A. [Bản đồ Hub](screenshots/hub-map.png)

## Phần còn khác mockup

- **Ở 390 px**, sidebar thật mở qua nút menu, inspector nằm dưới bản đồ và các form xếp dọc. Bảng cuộn trong khung riêng. Ảnh mockup hẹp hơn vì sidebar cố định.
- **Dữ liệu và trạng thái** khác giữa hai phiên. Ví dụ, Ga Metro có 8 xe đủ điều kiện trong dự án và 3 xe trong mockup. Mockup mở sẵn một lượt đặt xe và có log IoT, sự cố và đề xuất dựng sẵn. Ứng dụng hiển thị trạng thái rỗng hoặc nội dung đã phát sinh từ thao tác. Ô đặt xe tiếp tục dùng thao tác đặt trực tiếp của dự án. Trường đăng nhập điền sẵn tài khoản demo và vẫn có ba lựa chọn tài khoản.
- **Một số điều khiển chỉ có ở bản mẫu**, gồm khoảng cách định vị 180 m, nút nạp ví, chọn xe rồi xác nhận riêng, và các nút giả lập theo kịch bản cố định. Thanh trạng thái thật hiển thị số Hub trực tuyến. Bản đồ dùng Ga Metro làm điểm quay về và tra cứu Hub trên màn hình bản đồ.

## Kiểm chứng trong đợt đối chiếu ban đầu

Playwright chụp và đối chiếu 22 ảnh ghép. Kiểm tra thêm lối vào bản đồ công khai, lọc theo tên và theo loại xe ở cả hai kích thước.

`node tests/browser/browser-smoke.mjs` đạt cả năm nhóm trên Edge, gồm đặt–nhận–trả xe, đỗ và sạc, điều phối, lịch sạc, sự cố, telemetry và điều hướng di động. `node --test "tests/node/*.test.mjs"` đạt 20/20 ca.
