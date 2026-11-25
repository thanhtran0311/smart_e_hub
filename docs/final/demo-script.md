# Kịch bản demo Smart E-Hub

Thời lượng khoảng 10–15 phút. Chạy máy chủ theo README, dùng một tab và chọn Điều khiển demo → Khôi phục dữ liệu mẫu trước khi bắt đầu. Các tài khoản dùng mật khẩu 123456.

## Thuê xe và kiểm chứng trạng thái vật lý

1. Từ trang giới thiệu, chọn phân hệ Sinh viên và đăng nhập bằng student01. Trên bản đồ, tìm Metro hoặc H-01, thử bộ lọc xe và mức pin rồi chọn lại H-01.
2. Đặt E-102. Màn Hành trình của tôi xuất hiện đơn với hạn giữ 15 phút.
3. Nhập E-102 vào mã quét, chọn Bắt đầu nhận xe. Chọn phản hồi thành công và Nhận phản hồi mở khóa.
4. Xác nhận đã nhận xe. Ô nguồn vẫn đang chứa xe. Nhấn Cảm biến xác nhận xe rời ô. Lúc này ô mới được giải phóng.
5. Tải lại trang để chứng minh chuyến được giữ. Chọn Ký túc xá Khu A ở Hub muốn trả xe, nhấn Giữ chỗ trả xe.
6. Giữ mã xe và ô đã được gán, chọn phản hồi thành công, nhấn Xác minh chốt & khóa xe. Sau đó nhấn Đối soát & hoàn tất chuyến.
7. Chuyến có trạng thái Hoàn tất. Sang bản đồ H-02 để thấy E-102 và số chỗ trống thay đổi.
8. Đăng xuất student01, đăng nhập operator01 trong cùng tab. Dashboard hiển thị cùng kết quả của chuyến vừa làm. Có thể xuất bản chụp JSON hoặc CSV.

## Điều phối một phần

1. Trong Điều phối xe, chọn nguồn H-01 và đích H-02.
2. Chọn 5 xe đủ pin, chọn đội vận chuyển rồi Phát hành lệnh. Đích đã giữ trước 5 chỗ, xe nguồn chuyển sang điều phối.
3. Nhấn Xác nhận xe đã rời Hub. Mỗi xe có hai lựa chọn xác nhận bàn giao.
4. Nhấn Đã đến cho 4 xe. Nhấn Chưa bàn giao cho xe thứ 5.
5. Lệnh hiển thị Hoàn tất một phần, 4/5 xe đã đến. Chỗ giữ không sử dụng được giải phóng. Xe chưa bàn giao chờ kiểm tra.
6. Quay lại dashboard để đối chiếu sức chứa. Xe đang ở ngoài Hub được giữ trong hồ sơ lệnh để tiếp tục đối soát.

## Đỗ và sạc xe cá nhân

1. Đăng nhập student01 và mở Đỗ xe & sạc pin. Chọn H-01, PV-01, một ô cá nhân trống, khung giờ từ phút hiện tại đến sau một giờ.
2. Nhấn Giữ chỗ. Số dư khả dụng giảm 50.000 đồng, khoản đang giữ tăng tương ứng. Ô vật lý vẫn trống.
3. Nhấn Xác nhận xe vào ô. Ô chuyển có xe, khoản giữ được giải phóng.
4. Mở Đăng ký lịch sạc theo chỗ đỗ. Chọn CHG-01-02, giữ giờ hiện tại trong khung đỗ, nhấn Xác nhận lịch sạc.
5. Nhập mã sạc hiện trên lịch rồi Xác nhận cắm đầu sạc. Cổng đang chờ cấp điện.
6. Chọn Thiết bị không phản hồi rồi Kiểm tra an toàn & đóng relay. UI báo lỗi và giữ trạng thái đã cắm. Đổi phản hồi sang thành công, thử lại.
7. Mở Điều khiển demo, tăng 1 phút rồi đóng hộp thoại. Phiên hiển thị kWh và chi phí tạm tính. Các chỉ số cũng cập nhật mỗi 15 giây.
8. Chọn Dừng sạc an toàn. Sau xác nhận ngắt điện, nhấn Xác nhận đã rút đầu cắm. Cổng được giải phóng.
9. Nhấn Xác nhận xe rời ô để hoàn tất đỗ xe.

## Mô phỏng, lịch sạc và sự cố

1. Đăng nhập operator01. Vào Lịch sạc, chọn H-01 và áp dụng kế hoạch ưu tiên. Phiên đang chạy trên CHG-01-01 giữ nguyên nguồn điện. Lệnh cho lịch tương lai xuất hiện ở trạng thái chờ tới khung giờ và xác nhận cắm cáp.
2. Vào Mô phỏng What-if, chọn nguồn H-01, đích H-02, nhu cầu 500% và 60 phút. Chạy mô phỏng.
3. Kết quả nêu thời điểm chụp và độ mới của từng Hub, bao gồm H-05 offline. Xem dự báo xe, ô và sạc, lưu mẫu nếu cần chạy lại. Chọn một hoặc nhiều khuyến nghị để áp dụng. Dashboard và audit thể hiện kết quả. Khi áp dụng khuyến nghị chuyển hướng, mở Thông báo ở phiên Sinh viên.
4. Chọn Xử lý bù cho khuyến nghị đã phát hành lệnh PENDING. Lệnh được hủy và giải phóng chỗ giữ. Với lệnh đã vận chuyển, hệ thống ghi chờ kiểm tra để đối soát từng xe.
5. Vào Sự cố & bảo trì, chọn một xe AVAILABLE tại H-01 và nhập hiện tượng. Tạo hồ sơ, xác nhận cách ly an toàn.
6. Thử Mô phỏng gửi lỗi để có phiếu chờ gửi lại, sau đó Gửi phiếu bảo trì. Mã phiếu giữ nguyên. Nhấn Xác nhận sửa xong để hoàn tất.
7. Để demo đơn bị ảnh hưởng, dùng student01 đặt trước một xe rồi chuyển operator01 và báo sự cố đúng xe đó. Hồ sơ có đơn AFFECTED. Chọn thay xe hoặc hủy trước khi nghiệm thu.
8. Với cổng đang sạc, Operator chọn **Yêu cầu ngắt điện an toàn** trong hồ sơ. Phiên có sẵn tại CHG-01-01 thuộc **student02** và xe PV-02. Sau khi có xác nhận ngắt, đăng nhập student02 để xác nhận rút cáp, rồi quay về operator01 để cách ly. Xe đang được dùng và ô đang có xe cũng cần hoàn tất luồng sử dụng trước khi cách ly.

## Dữ liệu IoT và thời hạn

1. Operator mở Telemetry IoT, chọn H-01 và bộ điều khiển Hub.
2. Phát gói hợp lệ. Phát Gửi lại cùng mã gói, kết quả Đã bỏ gói trùng. Thử gói đến trễ và gói lỗi.
3. Phát Hub mất kết nối. Dashboard đánh dấu offline, hiển thị dữ liệu gần nhất. Đặt xe, điều phối và lịch sạc liên quan bị chặn khi xác nhận.
4. Phát Gói hợp lệ / khôi phục kết nối để Hub hoạt động trở lại.
   Chọn một cảm biến ô hoặc cổng, gửi gói hợp lệ rồi tăng hai phút để xem cảnh báo timeout riêng.
5. Đặt một xe mới bằng student01 rồi tăng 15 phút. Đơn giữ xe hết hạn, xe docked đủ điều kiện được mở lại.
6. Kiểm tra riêng việc check-in sát hạn bằng cách đặt xe, tăng 14 phút, bắt đầu nhận rồi tăng 1 phút. Check-in đã bắt đầu được bảo vệ trong thời hạn xác nhận riêng. Cần hoàn tất trong 2 phút kể từ khi bắt đầu nhận.

Các thao tác xác nhận cảm biến, relay, vận chuyển và sửa chữa trên đây tạo sự kiện mô phỏng để nhóm trình bày thiết kế. Kết quả dự báo và chi phí dùng tham số demo trong config.json.
