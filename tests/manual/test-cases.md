# Kiểm tra thủ công Smart E-Hub

Khôi phục seed trước mỗi nhóm nếu muốn có trạng thái ban đầu như nhau. Mọi thay đổi của hai vai trò phải được thực hiện trong cùng trình duyệt và cùng origin.

| Ca | Trạng thái trước | Thao tác | Kết quả cần kiểm tra |
| --- | --- | --- | --- |
| M01 | Chưa đăng nhập | Tìm Metro, lọc scooter, pin ≥70% | Danh sách Hub và xe khớp bộ lọc, bản đồ chọn đúng Hub |
| M02 | Guest | Mở URL operator trực tiếp | Hiện đăng nhập, chưa cho thực hiện thao tác vận hành |
| M03 | student01 | Mở #/operator/network-dashboard | Báo thiếu quyền, đưa về màn Sinh viên |
| M04 | Guest | Nhập sai mật khẩu, sửa lại | Lỗi trong hộp thoại, đăng nhập hợp lệ chuyển đúng phân hệ |
| M05 | E-102 AVAILABLE | Đặt xe, reload, Back, Forward | Giữ đơn và xe RESERVED, route có thể khôi phục |
| M06 | Đơn xe mới | Tăng 15 phút | Đơn EXPIRED, xe docked được xét lại trước khi mở cấp phát |
| M07 | Giữ xe còn 1 phút | Bắt đầu nhận, tăng 1 phút | Đơn tiếp tục check-in theo hạn riêng |
| M08 | CHECKING_IN | Phản hồi mở khóa timeout, sau đó thành công | Timeout giữ trạng thái, lần xác nhận mới cho tiếp tục |
| M09 | Xe đã mở khóa | Xác nhận nhận, sau đó cảm biến rời ô | Ô chỉ trống ở bước cảm biến |
| M10 | Chuyến đang chạy | Giữ ô H-02, thử mã ô sai, sửa lại | Mã sai bị từ chối, sau khóa và hoàn tất các bản ghi khớp |
| M11 | PV-01 chưa đặt ô | Đặt khung giờ hiện tại | Cọc và đơn cùng thành công, ô vật lý vẫn trống |
| M12 | Đơn ô đã giữ | Hủy, rồi tải lại | Cọc được nhả đúng một lần, ô giữ trạng thái vật lý |
| M13 | Xe cá nhân đã vào ô | Đặt CHG-01-02, quét mã, đóng relay timeout | Cổng chờ, kWh chưa tăng |
| M14 | Đã cắm | Đóng relay thành công, tăng thời gian, dừng sạc | kWh tăng, xác nhận ngắt nguồn giữ cổng đến lúc rút đầu cắm |
| M15 | Đơn đỗ đã hết giờ ân hạn | Tăng 15 rồi 1 phút | No-show EXPIRED, cọc khấu trừ một lần, lịch liên quan bị hủy |
| M16 | H-01 và H-02 online | Tạo lệnh 5 xe, xác nhận rời Hub | Đích giữ 5 chỗ, ô nguồn được giải phóng theo xác nhận |
| M17 | Lệnh đang vận chuyển | 4 xe đến, 1 xe chưa bàn giao | PARTIALLY_COMPLETED, 4 xe tại đích, chỗ thừa nhả, xe thất bại chờ kiểm tra |
| M18 | Lệnh PENDING | Hủy lệnh | Xe đủ điều kiện được mở lại, chỗ giữ đích được nhả |
| M19 | CHG-01-01 đang sạc | Áp dụng kế hoạch ưu tiên | Lưu kế hoạch và lệnh chờ cho lịch tương lai, phiên đang chạy giữ nguyên |
| M20 | Xe có đơn đặt trước | Ghi sự cố, cách ly, gửi phiếu lỗi rồi gửi lại | Chặn cấp phát, đơn AFFECTED, mã phiếu nhất quán |
| M21 | Cổng đang sạc bị báo sự cố | Cách ly ngay | PENDING_CHECK, yêu cầu dừng sạc và rút cáp an toàn trước khi tiếp tục |
| M22 | Đơn AFFECTED | Thay tài nguyên hoặc hủy, nghiệm thu sửa chữa | Trạng thái đơn có kết quả, thông báo và cọc được xử lý |
| M23 | Nhu cầu đích 500% | Chạy what-if | Có snapshot, thời gian và đánh dấu dữ liệu cũ, vận hành chưa bị thay đổi |
| M24 | Có khuyến nghị PENDING | Chọn áp dụng một phần, rồi xử lý bù | Có audit, lệnh PENDING có thể hủy, lệnh đã chạy cần đối soát |
| M25 | Snapshot đã có | Thay đổi xe qua điều phối rồi áp dụng khuyến nghị cũ | Revalidation chặn phần không còn hợp lệ |
| M26 | Có gói telemetry hợp lệ | Gửi lại, gửi cũ, gửi sai | Log phân loại, dữ liệu mới nhất được bảo toàn |
| M27 | H-01 online | Phát offline, thử commit, sau đó phát live | Dữ liệu cũ có thời điểm, commit bị chặn đến khi có live |
| M28 | Đang có chuyến/lịch | Reload và đăng xuất/đăng nhập | Trạng thái nghiệp vụ giữ trong cùng origin |
| M29 | Rộng 390px | Mở menu, đổi trang, thao tác form | Nội dung vừa màn, bảng cuộn riêng, nút có thể chạm |
| M30 | Phiên đã thay đổi | Chọn reset, hủy xác nhận, sau đó xác nhận | Hủy giữ dữ liệu, xác nhận nạp seed và thoát tài khoản |
| M31 | Xe E-102 đã mở khóa | Operator cho Hub mất kết nối rồi Sinh viên xác nhận nhận xe | Chưa tạo chuyến cho đến khi Hub và chốt được đối chiếu lại |
| M32 | Đã giữ chốt trả | Báo hỏng chốt, dùng Đổi chốt trả xe | Chốt lỗi được nhả sau khi giữ được chốt thay thế |
| M33 | Một xe có hai khung đỗ liền nhau | Giữ xe ở ô đầu sau giờ, thử check-in ô thứ hai rồi xác nhận xe rời ô đầu | Ban đầu bị chặn, sau xác nhận rời ô mới được check-in |
| M34 | Lệnh điều phối PENDING | Báo sự cố ô đích rồi thử xác nhận xe rời Hub | Xe vẫn ở Hub nguồn và lệnh vẫn PENDING |
| M35 | Có hai cổng đã cắm trong khung giờ | Chọn một cổng mô phỏng timeout rồi áp dụng kế hoạch | Hai lệnh có kết quả riêng, cổng timeout giữ trạng thái chưa cấp điện |
| M36 | CHG-01-01 gặp lỗi ngắt sạc | Operator yêu cầu ngắt điện, student02 rút cáp rồi Operator cách ly | Ghi mã lỗi/lệnh, chỉ cách ly sau xác nhận ngắt và rút |
| M37 | Cảm biến ô/cổng chưa đăng ký | Phát gói hợp lệ, tăng hai phút, phát gói mới | Timeout riêng cảm biến, Hub vẫn trực tuyến và cảm biến phục hồi từ gói mới |
| M38 | What-if đã có đề xuất chuyển hướng | Lưu mẫu, chạy lại, áp dụng đề xuất rồi mở Thông báo bằng Sinh viên | Hiện dự báo xe, ô, sạc và thông báo đúng người nhận |

Các ca cạnh tranh version, ghi localStorage lỗi và rollback được kiểm tra tự động bằng Node trong student.test.mjs, operator.test.mjs và store.test.mjs. Kết quả kiểm tra thực tế được ghi trong docs/final/verification.md.
