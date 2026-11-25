# Lớp và phương thức theo Submit 3

Nguồn là [PDF Submit 3](../references/submission-3.pdf), mục 3, trang in 6–24. Bảy sơ đồ chứa 44 lớp và Bảng 4–10 mô tả 184 phương thức. Ký hiệu `+` là công khai và `-` là riêng.

Mỗi bảng giữ chữ ký và mô tả của thiết kế logic. Dòng **MVP** chỉ ra nơi tìm hành vi tương ứng trong repo. Các quan hệ và thuộc tính nằm trong [nguồn PlantUML](diagrams/classes.puml).

Hình 7 ghi `rollbackCommands`, còn Bảng 10 mô tả `compensateCommands`. Nguồn bên dưới dùng chữ ký trong Bảng 10 và cách giải thích tại mục 3.7 về xử lý bù sau khi phát lệnh.

## 3.1 Tra cứu Hub, xác thực và giám sát mạng lưới (UC01, UC08)

Đối chiếu Bảng 4, trang in 7–9. [Sơ đồ 1](diagrams/exported/submit3-31.svg).

### `User`

**MVP** · Object người dùng trong users. OperationalStore.user trả phiên hợp lệ và AuthService.requireRole kiểm tra vai trò.

| Chữ ký | Mô tả |
| --- | --- |
| `+getUserId(): String` | Trả về định danh của người dùng. |
| `+getRole(): UserRole` | Trả về vai trò dùng để phân quyền. |
| `+hasPermission(permission: String): boolean` | Kiểm tra vai trò hiện tại có quyền thực hiện thao tác được yêu cầu hay không. |

### `Hub`

**MVP** · Bản ghi hubs cùng hubMetrics và isHubOnline. Sức chứa dựa trên ô vật lý, cảm biến và chỗ đang giữ.

| Chữ ký | Mô tả |
| --- | --- |
| `+reserveInboundSpaces(count: int): void` | Giữ số chỗ cần thiết tại Hub đích cho xe sắp được điều phối tới. |
| `+calculateLoadLevel(fullRatio: double, lowAvailRatio: double): HubLoadLevel` | Xác định mức tải từ tỷ lệ lấp đầy và tỷ lệ xe khả dụng theo ngưỡng cấu hình. |
| `+isOffline(telemetryTimeoutSeconds: int, currentTime: long): boolean` | So thời điểm hiện tại với lần nhận telemetry gần nhất để phát hiện mất kết nối. |
| `+getAvailableVehicleCount(): int` | Trả số xe hiện có thể đặt tại Hub. |
| `+getEmptySpaceCount(): int` | Trả số ô đỗ trống tại Hub. |
| `+updateTelemetryHeartbeat(timestamp: long): void` | Ghi nhận thời điểm Hub gửi dữ liệu gần nhất. |

### `ParkingSpace`

**MVP** · Bản ghi slots cùng slotAvailable, quan sát cảm biến và chuyển trạng thái trong giao dịch.

| Chữ ký | Mô tả |
| --- | --- |
| `+canReleaseToAvailable(): boolean` | Đối chiếu thông tin cảm biến và trạng thái lỗi để quyết định có thể giải phóng ô hay chưa. |
| `+updateSensorStatus(occupied: boolean, timestamp: long): void` | Ghi giá trị cảm biến có xe và thời điểm quan sát. |
| `+markReserved(): void` | Đánh dấu ô đã được giữ chỗ. |
| `+markOccupied(): void` | Đánh dấu ô đang có xe. |
| `+markAvailable(): void` | Đưa ô về trạng thái trống sau khi đã đối soát. |
| `+markPendingCheck(): void` | Chặn sử dụng ô trong lúc chờ xác minh hiện trạng. |
| `+markFaulted(): void` | Đánh dấu ô bị lỗi để ngừng cấp phát. |

### `AuthService`

**MVP** · authenticate và requireRole trong store.js. OperationalStore.login/logout lưu phiên demo bằng userId.

| Chữ ký | Mô tả |
| --- | --- |
| `+authenticateVnuSso(ssoToken: String): User` | Xác thực token VNU-SSO và trả về người dùng tương ứng. |
| `+validateSession(token: String): boolean` | Kiểm tra token còn đại diện cho một phiên hợp lệ hay không. |
| `+logout(token: String): void` | Kết thúc phiên đăng nhập gắn với token. |

### `HubService`

**MVP** · searchHubs, getNearbyHubs, hubMetrics và receivePacket cấp Hub.

| Chữ ký | Mô tả |
| --- | --- |
| `+getNearbyHubs(lat: double, lon: double, radiusKm: double): List<Hub>` | Tìm các Hub trong bán kính tính từ tọa độ người dùng. |
| `+getHubDetail(hubId: String): Hub` | Lấy thông tin chi tiết của Hub theo mã. |
| `+getHubVehicles(hubId: String, filterCriteria: FilterCriteria): List<Vehicle>` | Trả danh sách xe tại Hub thỏa bộ lọc tìm kiếm. |
| `+filterHubs(zone: String, minAvailableVehicles: int, minBatteryFilter: double): List<Hub>` | Lọc Hub theo khu vực, số xe khả dụng và mức pin yêu cầu. |
| `+updateHubTelemetry(hubId: String, currentPowerKw: double, timestamp: long): boolean` | Cập nhật công suất Hub theo dữ liệu có dấu thời gian và trả kết quả cập nhật. |

### `MonitoringService`

**MVP** · networkSnapshot, cảnh báo telemetry và xuất dashboard JSON/CSV.

| Chữ ký | Mô tả |
| --- | --- |
| `+getNetworkOverviewSnapshot(): Map<String, Object>` | Tổng hợp số liệu hiện tại của các Hub cho màn hình vận hành. |
| `+evaluateHubLoadStatus(hubId: String): HubLoadLevel` | Xác định mức cảnh báo của một Hub. |
| `+checkNetworkAnomalies(currentTime: long): List<String>` | Rà soát các bất thường của mạng lưới tại thời điểm kiểm tra. |
| `+exportNetworkReport(format: String): byte[]` | Xuất số liệu giám sát theo định dạng được chọn. |
| `+triggerRebalanceAlertIfNeeded(hubId: String): boolean` | Phát cảnh báo khi lượng xe ở Hub cần được cân bằng lại. |

### `OperationalStore`

**MVP** · state, transaction(), config trong snapshot và localStorage. Giao dịch đồng bộ trong một phiên demo.

| Chữ ký | Mô tả |
| --- | --- |
| `+getRealtimeNetworkStatus(): NetworkSnapshot` | Đọc trạng thái vận hành mới nhất đã được commit để các nghiệp vụ đối chiếu. |
| `+readConfig(key: String, hubId: String): ConfigValue` | Đọc tham số theo khóa cấu hình và phạm vi Hub. |
| `+beginTransaction(): Transaction` | Mở giao dịch để nhóm các cập nhật tài nguyên, hỗ trợ commit hoặc rollback. |

## 3.2 Đặt, nhận và trả xe dùng chung (UC02–UC04)

Đối chiếu Bảng 5, trang in 10–13. [Sơ đồ 2](diagrams/exported/submit3-32.svg).

### `Vehicle`

**MVP** · Lớp cơ sở trong UML. MVP lưu xe dùng chung và xe cá nhân thành hai collection, tham chiếu bằng ID.

Lớp chỉ khai báo thuộc tính trong sơ đồ.

### `SharedVehicle`

**MVP** · vehicles, bookVehicle, confirmPickup, changeOrder và finishReturn.

| Chữ ký | Mô tả |
| --- | --- |
| `+reserve(reservationId: String): void` | Gắn xe với đơn đã xác nhận và chuyển xe sang RESERVED. |
| `+markInUse(tripId: String): void` | Gắn xe với lượt thuê và chuyển sang IN_USE. |
| `+markRelocating(): void` | Chuyển xe sang RELOCATING khi lệnh điều phối được xác nhận. |
| `+classifyAfterReturn(hasIssue: boolean, latestSoc: OptionalInt): void` | Sau khi trả xe, chọn PENDING_CHECK nếu có sự cố hoặc thiếu số liệu, WAITING_CHARGE nếu pin thấp, hoặc AVAILABLE khi đủ điều kiện. |

### `PrivateVehicle`

**MVP** · privateVehicles cùng kiểm tra ownerId/userId khi tạo đơn đỗ.

| Chữ ký | Mô tả |
| --- | --- |
| `+boolean belongsTo(String studentId)` | Kiểm tra xe cá nhân có thuộc sinh viên được chỉ định hay không. |

### `Reservation`

**MVP** · reservations loại VEHICLE, liên kết xe, chốt, thời hạn và lượt thuê.

| Chữ ký | Mô tả |
| --- | --- |
| `+boolean isActive(DateTime at)` | Kiểm tra đơn còn hiệu lực tại thời điểm xét. |
| `+boolean belongsTo(String studentId)` | Kiểm tra sinh viên có phải chủ đơn hay không. |
| `+boolean matches(String vehicleId, String pickupHubId)` | Đối chiếu mã xe và Hub nhận với thông tin trên đơn. |
| `+void confirm()` | Ghi nhận trạng thái đặt xe đã xác nhận. |
| `+void cancel(String reason)` | Hủy đơn và lưu lý do. |
| `+void expire()` | Đánh dấu đơn hết hạn giữ xe. |
| `+void consume(String tripId)` | Ghi nhận đơn đã dùng để nhận xe và liên kết với lượt thuê. |

### `Trip`

**MVP** · trips, bằng chứng khóa/chốt, yêu cầu trả xe và lịch sử.

| Chữ ký | Mô tả |
| --- | --- |
| `+void start(DateTime at)` | Ghi nhận thời điểm bắt đầu lượt thuê. |
| `+void requestEnd(String returnHubId, String returnPositionId, DateTime at)` | Lưu yêu cầu kết thúc tại Hub và chốt trả đã chọn. |
| `+void attachParkingEvidence(String evidenceId)` | Gắn bằng chứng xe đã vào chốt với lượt thuê. |
| `+void reportIssue(String description)` | Ghi nhận mô tả sự cố do người dùng báo. |
| `+void markPendingVerification(String reason)` | Đưa lượt thuê vào diện chờ đối soát và lưu lý do. |
| `+void confirmEnded(DateTime at)` | Ghi nhận lượt thuê đã kết thúc tại thời điểm xác nhận. |
| `+boolean isActive()` | Kiểm tra lượt thuê còn đang diễn ra hay không. |
| `+long durationMinutes(DateTime at)` | Tính thời lượng lượt thuê theo phút tại thời điểm xét. |

### `VehicleService`

**MVP** · searchHubs, pickupVehicle, deviceResult và phân loại khi trả. Xe còn nối sạc cần xác nhận ngắt và rút cáp trước khi mở khóa.

| Chữ ký | Mô tả |
| --- | --- |
| `+List<SharedVehicle> findAvailableVehicles(String hubId, int minBattery)` | Tìm xe dùng chung khả dụng tại Hub đạt mức pin yêu cầu. |
| `+SharedVehicle getVehicleSnapshot(String vehicleId)` | Đọc trạng thái hiện tại của xe dùng chung. |
| `+void validateVehicleAtHub(String vehicleId, String hubId)` | Đối chiếu vị trí xe với Hub được yêu cầu. |
| `+void stopChargingSafely(String vehicleId)` | Yêu cầu dừng cấp điện an toàn trước khi bàn giao xe đang sạc. |
| `+void unlockVehicle(String vehicleId, String commandId)` | Gửi lệnh mở khóa kèm mã lệnh để đối chiếu phản hồi. |
| `+boolean verifyUnlock(String vehicleId, int timeoutSeconds)` | Kiểm tra thiết bị đã xác nhận mở khóa trong thời hạn hay chưa. |
| `+void lockVehicle(String vehicleId, String commandId)` | Gửi lệnh khóa xe tại chốt. |
| `+boolean verifyLock(String vehicleId, int timeoutSeconds)` | Kiểm tra xác nhận khóa trong thời hạn cho phép. |
| `+void classifyReturnedVehicle(String vehicleId, boolean issueReported)` | Lấy dữ liệu pin và báo cáo sự cố để phân loại xe sau khi trả. |

### `ReservationService`

**MVP** · bookVehicle, beginPickup, cancelBooking, closeVehicleBooking, expireStudentHolds và confirmPickup.

| Chữ ký | Mô tả |
| --- | --- |
| `+BookingPreview validateBooking(String studentId, String vehicleId, String hubId)` | Kiểm tra tài khoản, xe và mức pin rồi trả bản xem trước kèm version. Xe vẫn khả dụng ở bước này. |
| `+Reservation confirmReservation(String studentId, String vehicleId, String hubId, long expectedVersion)` | Khóa xe, kiểm tra lại tài khoản, pin và version. Giữ xe và tạo đơn có hạn T_HOLD trong một giao dịch, rollback nếu có xung đột. |
| `+Reservation validatePickup(String reservationId, String studentId, String vehicleId, String hubId, DateTime at)` | Xác minh chủ đơn, xe, Hub và thời hạn trước khi bàn giao. |
| `+void cancelReservation(String reservationId, String studentId, String reason)` | Kiểm tra chủ đơn, hủy đơn và khởi động đối soát xe. |
| `+void expireReservation(String reservationId, DateTime at)` | Khi quá hạn, ghi nhận đơn hết hiệu lực, đối soát xe và thông báo cho sinh viên. |
| `+void consumeReservation(String reservationId, String tripId)` | Liên kết đơn đã sử dụng với lượt thuê tương ứng. |
| `+void reconcileVehicleHold(String reservationId)` | Đọc trạng thái thực của xe và chốt. Chỉ giải phóng xe khi đúng chốt, đã khóa và an toàn. |
| `+Reservation getActiveReservation(String studentId)` | Tìm đơn đặt xe còn hiệu lực của sinh viên. |

### `TripService`

**MVP** · beginPickup, unlockAck, confirmPickup, requestReturn, lockReturn và finishReturn. requestReturn nhận chốt thay thế trước khi có bằng chứng khóa.

| Chữ ký | Mô tả |
| --- | --- |
| `+void requestPickup(String reservationId, String vehicleCode, String commandId)` | Đối chiếu đơn và mã xe, chuẩn bị ngắt sạc nếu cần và yêu cầu mở khóa. |
| `+Trip startTrip(String reservationId, String studentId, String vehicleCode, String commandId)` | Sau khi thiết bị xác nhận mở khóa và sinh viên xác nhận trong T_CONFIRM, tạo lượt đi và cập nhật đơn cùng trạng thái xe. |
| `+void requestReturnHub(String tripId, String hubId)` | Kiểm tra Hub sinh viên chọn để trả xe. |
| `+String holdReturnPosition(String tripId, String hubId)` | Giữ một vị trí trả bằng cập nhật nguyên tử và trả mã vị trí. |
| `+void changeReturnPosition(String tripId, String positionId)` | Chuyển sang vị trí trả thay thế khi vị trí ban đầu không phù hợp. |
| `+boolean verifyParkingEvidence(String tripId)` | Đối chiếu bằng chứng xe đã vào đúng vị trí trả. |
| `+void reportTripIssue(String tripId, String description)` | Ghi sự cố vào lượt thuê để xử lý khi trả xe. |
| `+Trip endTrip(String tripId, String commandId)` | Điều phối kiểm tra vị trí và khóa xe trước khi kết thúc lượt thuê. |
| `+void finalizeTrip(String tripId, DateTime endedAt)` | Ghi thời điểm kết thúc và hoàn tất cập nhật lượt thuê sau khi xác minh. |
| `+Trip reconcilePendingTrip(String tripId)` | Đối soát lượt thuê đang chờ để khôi phục kết quả sau lỗi ghi nhận và tránh chốt hai lần. |
| `+Trip getTripSummary(String tripId, String studentId)` | Trả bản tóm tắt lượt đi của sinh viên theo mã lượt thuê. |

### `DeviceControlGateway`

**MVP** · requestControl nhận mã lệnh, thiết bị và hành động. Thời điểm phản hồi giả lập lấy theo CONTROL_TIMEOUT_SEC.

| Chữ ký | Mô tả |
| --- | --- |
| `+requestControl(commandId: String, targetId: String, command: ControlCommand): ControlStatus` | Gửi yêu cầu đến thiết bị hoặc bộ mô phỏng theo mã lệnh và đích. Trả kết quả thành công, lỗi hoặc hết thời gian chờ. |

## 3.3 Đặt ô đỗ và sạc xe cá nhân (UC05–UC07)

Đối chiếu Bảng 6, trang in 14–17. [Sơ đồ 3](diagrams/exported/submit3-33.svg).

### `ParkingService`

**MVP** · bookParking, checkInParking, closeParking, leaveParking và danh sách xe/Hub trên màn đặt ô.

| Chữ ký | Mô tả |
| --- | --- |
| `+getVehicles(studentId: String): List<PrivateVehicle>` | Liệt kê xe cá nhân của sinh viên để chọn xe đặt ô. |
| `+getHubs(): List<Hub>` | Liệt kê Hub cho sinh viên chọn nơi đỗ. |
| `+checkAvailability(hubId: String, slotId: String, window: TimeWindow): AvailabilityResult` | Kiểm tra sơ bộ ô còn trống trong khoảng thời gian yêu cầu. |
| `+confirmReservation(studentId: String, vehicleId: String, slotId: String, window: TimeWindow): ParkingReservation` | Khóa ô, kiểm tra lại version, lỗi và trùng giờ rồi tạo đơn cùng hạn check-in trong một giao dịch. |
| `+cancelReservation(reservationId: String): void` | Hủy đơn đỗ và đối soát hiện trạng ô trước khi giải phóng. |
| `+checkIn(reservationId: String): boolean` | Xác minh đơn và ghi nhận xe đã đến ô đỗ. |
| `+expireOverdueReservations(): List<ParkingReservation>` | Đánh dấu đơn quá T_GRACE chưa check-in là hết hạn, hủy lịch sạc liên quan và trả danh sách đơn đã xử lý. |
| `+reconcileSlot(slot: ParkingSpace): SpaceStatus` | Dùng cảm biến để xác định ô trống, cần đối soát hoặc đang lỗi. |

### `ParkingReservation`

**MVP** · reservations loại PARKING, hạn nhận ô, trạng thái hiện diện và thông tin cọc bổ sung của MVP.

| Chữ ký | Mô tả |
| --- | --- |
| `+markCheckedIn(): void` | Chuyển đơn sang trạng thái đã check-in. |
| `+cancel(): void` | Ghi nhận đơn đỗ bị hủy. |
| `+expire(): void` | Ghi nhận đơn hết hạn check-in. |
| `+isWithinGrace(now: DateTime): boolean` | Kiểm tra thời điểm hiện tại còn trong thời gian ân hạn hay không. |

### `ChargingScheduleService`

**MVP** · bookCharging, chargingWindowAvailable, closeSchedule, hủy theo đơn đỗ và kiểm tra hiện trạng cổng.

| Chữ ký | Mô tả |
| --- | --- |
| `+getActiveBookings(studentId: String): List<ParkingReservation>` | Tìm đơn đỗ còn hiệu lực của sinh viên để lập lịch sạc. |
| `+getChargers(hubId: String, connectorType: String): List<ChargingPort>` | Liệt kê các cổng có đầu nối tương thích tại Hub. |
| `+checkAvailability(portId: String, window: TimeWindow): AvailabilityResult` | Kiểm tra khả năng đặt cổng trong khung giờ yêu cầu. |
| `+confirmSchedule(reservationId: String, portId: String, window: TimeWindow): ChargingSchedule` | Khóa cổng và bản ghi công suất theo giờ, kiểm tra đơn đỗ, xung đột lịch và giới hạn công suất rồi lưu lịch kèm mã nhận sạc. |
| `+cancelSchedule(scheduleId: String): void` | Hủy lịch và đối soát cổng trước khi giải phóng. |
| `+cancelScheduleByReservationExpiry(reservationId: String): void` | Hủy các lịch gắn với đơn đỗ hết hạn. |
| `+reconcilePort(port: ChargingPort): PortStatus` | Đối chiếu tình trạng cắm sạc và lỗi thiết bị để xác định trạng thái cổng. |

### `ChargingSchedule`

**MVP** · schedules cùng chuyển trạng thái ở student.js và charging.js.

| Chữ ký | Mô tả |
| --- | --- |
| `+markScheduled(): void` | Ghi nhận lịch đã được chấp thuận. |
| `+markCharging(): void` | Chuyển lịch sang đang sạc sau xác nhận cấp nguồn. |
| `+complete(): void` | Ghi nhận lịch đã hoàn thành. |
| `+cancel(): void` | Đánh dấu lịch bị hủy. |
| `+expire(): void` | Đánh dấu lịch đã hết hiệu lực. |

### `ChargingPort`

**MVP** · ports, hiện trạng cáp/relay, quan sát telemetry và liên kết lịch.

| Chữ ký | Mô tả |
| --- | --- |
| `+markReserved(): void` | Giữ cổng cho lịch đã xác nhận. |
| `+markOccupiedWaiting(): void` | Ghi nhận xe đã chiếm cổng và đang chờ cấp nguồn. |
| `+markCharging(): void` | Ghi nhận cổng đang sạc sau xác nhận của thiết bị. |
| `+markChargedFull(): void` | Đánh dấu xe đã sạc đầy tại cổng. |
| `+markAvailable(): void` | Mở lại cổng cho lần sử dụng sau khi đã xác nhận rút đầu sạc và cổng an toàn. |
| `+markPendingCheck(): void` | Tạm chặn cổng để đối soát khi trạng thái thực tế chưa rõ. |
| `+markFaulted(): void` | Đánh dấu cổng lỗi và ngừng cấp phát. |

### `ChargingSessionService`

**MVP** · plugCharger, energize, deenergize, chargeReading và deviceResult.

| Chữ ký | Mô tả |
| --- | --- |
| `+startSession(code: String, hubId: String): ChargingSession` | Đối soát mã, Hub, xe, lịch và khung giờ. Chỉ ghi nhận bắt đầu sạc sau khi thiết bị xác nhận cấp điện. |
| `+requestControl(targetId: String, command: ControlCommand): ControlStatus` | Gửi yêu cầu điều khiển qua gateway và nhận kết quả theo thời hạn cấu hình. |
| `+updateSessionReading(sessionId: String, batteryPct: int, powerKw: double, energyKwh: double): void` | Đưa số liệu pin, công suất và điện năng mới vào phiên. |
| `+stopSession(sessionId: String, reason: String): ChargingSession` | Yêu cầu dừng sạc và chốt số liệu phiên theo kết quả thiết bị. |
| `+handleControlFailure(sessionId: String, command: ControlCommand): void` | Xử lý lệnh thất bại hoặc timeout, ghi lỗi và chuyển vận hành đối soát. |
| `+handleElectricalFault(sessionId: String, faultCode: String): void` | Lưu số liệu cuối, đánh dấu lỗi, cảnh báo người dùng và chuyển sự cố cho UC11. |

### `ChargingSession`

**MVP** · sessions lưu điện năng, chi phí, trạng thái, mã lỗi và mã lệnh gần nhất.

| Chữ ký | Mô tả |
| --- | --- |
| `+markCharging(startedAt: DateTime): void` | Ghi thời điểm phiên bắt đầu cấp điện. |
| `+updateReading(batteryPct: int, powerKw: double, energyKwh: double): void` | Cập nhật mức pin, công suất và điện năng tích lũy. |
| `+complete(endedAt: DateTime, finalEnergyKwh: double): void` | Chốt thời điểm kết thúc và điện năng cuối của phiên. |
| `+markFaulted(faultCode: String): void` | Đánh dấu phiên gặp sự cố và lưu mã lỗi. |

## 3.4 Điều phối xe giữa các Hub (UC09)

Đối chiếu Bảng 7, trang in 17–18. [Sơ đồ 4](diagrams/exported/submit3-34.svg).

### `RebalanceController`

**MVP** · Màn Điều phối xe và nhóm dispatch của operatorCommand.

| Chữ ký | Mô tả |
| --- | --- |
| `+getEligibleVehicles(sourceHubId: String, destHubId: String): DispatchPreview` | Nhận cặp Hub và trả dữ liệu xem trước về xe đủ điều kiện cùng sức chứa đích. |
| `+createDispatchOrder(sourceHubId: String, destHubId: String, vehicleVersions: Map<String, long>, destCapacityVersion: long, transporterId: String): ApiResponse` | Chuyển lựa chọn của nhân viên, các version và đội vận chuyển cho dịch vụ tạo lệnh rồi trả kết quả. |

### `DispatchService`

**MVP** · previewDispatch, createOrder, changeOrder và processPendingEffects ghi phân công mô phỏng sau commit.

| Chữ ký | Mô tả |
| --- | --- |
| `+filterEligibleVehicles(sourceHubId: String, destHubId: String): DispatchPreview` | Lọc xe AVAILABLE đủ MIN_SOC_RELOCATE tại Hub nguồn và đọc sức chứa Hub đích. |
| `+processDispatchOrder(sourceHubId: String, destHubId: String, vehicleVersions: Map<String, long>, destCapacityVersion: long, transporterId: String): DispatchOrder` | Khóa xe theo thứ tự mã và khóa sức chứa đích. Kiểm tra lại toàn bộ, giữ chỗ, chuyển xe sang RELOCATING và lưu lệnh PENDING trong một giao dịch. Sau commit, gửi phân công. |
| `+cancelDispatchOrder(orderId: String): void` | Hủy lệnh điều phối và giải phóng phần tài nguyên đã giữ theo lệnh. |
| `+completeDispatchOrder(orderId: String): void` | Ghi nhận lệnh đã hoàn tất khi đội vận chuyển kết thúc việc bàn giao. |

### `DispatchOrder`

**MVP** · orders và items, có thêm kết quả bàn giao một phần, thất bại và trạng thái phân công.

| Chữ ký | Mô tả |
| --- | --- |
| `+complete(): void` | Đánh dấu lệnh điều phối đã hoàn thành. |
| `+cancel(): void` | Đánh dấu lệnh điều phối đã hủy. |

## 3.5 Điều phối lịch sạc theo công suất Hub (UC10)

Đối chiếu Bảng 8, trang in 18–19. [Sơ đồ 5](diagrams/exported/submit3-35.svg).

### `ChargingSchedulerController`

**MVP** · Màn Lịch sạc và các lời gọi proposeSchedule, operatorCommand.

| Chữ ký | Mô tả |
| --- | --- |
| `+getProposedSchedule(hubId: String): ChargingPlan` | Trả lịch đề xuất của Hub để nhân viên xem và chỉnh sửa. |
| `+applyChargingSchedule(hubId: String, plan: ChargingPlan): ApiResponse` | Tiếp nhận lịch được duyệt, gọi dịch vụ áp dụng và trả kết quả cho giao diện. |

### `SmartChargingService`

**MVP** · proposeSchedule, applyPlan, processPendingEffects và energize. Giữ cửa sổ đã đặt và phiên đang cấp điện.

| Chữ ký | Mô tả |
| --- | --- |
| `+calculateSmartSchedule(hubId: String): ChargingPlan` | Tạo lịch cấp điện và hàng đợi dựa trên SoC, NextTrip, loại xe cùng trọng số PRIORITY_WEIGHTS. |
| `+applyChargingSchedule(hubId: String, plan: ChargingPlan): boolean` | Khóa lịch và cổng, kiểm tra version cùng công suất, lưu lịch và lệnh PENDING rồi gửi từng lệnh sau commit. Cập nhật mỗi cổng theo phản hồi riêng. |
| `+checkPowerConstraints(hubId: String, plan: ChargingPlan): boolean` | Kiểm tra tổng công suất các cổng dự kiến hoạt động so với HUB_POWER_LIMIT. |

### `ChargingPlan`

**MVP** · plans lưu hàng đợi, giới hạn, chữ ký kiểm tra lại và commandIds.

Lớp chỉ khai báo thuộc tính trong sơ đồ.

### `ChargingCommand`

**MVP** · deviceCommands lưu mã, đích, lịch, kết quả và thời điểm. MVP phát START khi đủ điều kiện.

Lớp chỉ khai báo thuộc tính trong sơ đồ.

## 3.6 Giám sát thiết bị và cách ly sự cố (UC11, UC14)

Đối chiếu Bảng 9, trang in 20–22. [Sơ đồ 6](diagrams/exported/submit3-36.svg).

### `TelemetryService`

**MVP** · receivePacket, sensorPayload, isWellFormed, updateResource và checkSensorTimeouts. Giao diện đọc snapshot sau commit.

| Chữ ký | Mô tả |
| --- | --- |
| `+registerSensor(sensor: Sensor): void` | Đăng ký hồ sơ cảm biến để theo dõi thiết bị. |
| `+receiveTelemetry(event: TelemetryEvent): boolean` | Tiếp nhận gói telemetry, kiểm tra hợp lệ và mới hơn trước khi cập nhật. |
| `+validatePacket(event: TelemetryEvent): boolean` | Kiểm tra cấu trúc và dữ liệu bắt buộc tương ứng với loại cảm biến. |
| `+updateState(event: TelemetryEvent): boolean` | Ghi có điều kiện theo timestamp để gói cũ không ghi đè trạng thái mới. |
| `+evaluateAndAlert(event: TelemetryEvent): void` | Đánh giá trạng thái sau cập nhật, phát hiện pin thấp, lỗi thiết bị hoặc Hub gần đầy. |
| `+publishEvent(eventType: String, event: TelemetryEvent): void` | Phát sự kiện đã phân loại đến các nghiệp vụ giám sát và xử lý sự cố. |
| `+checkTimeouts(): List<Sensor>` | Tìm thiết bị quá TELEMETRY_TIMEOUT, ghi nhận mất kết nối và phát cảnh báo. |

### `Sensor`

**MVP** · sensors ghi nguồn đã đăng ký, thời điểm nhận gói và kết nối. Store cấp heartbeat Hub mô phỏng.

| Chữ ký | Mô tả |
| --- | --- |
| `+markOnline(ts: DateTime): void` | Đánh dấu cảm biến đang kết nối và cập nhật thời điểm nhận tin. |
| `+markOffline(): void` | Đánh dấu cảm biến đã mất kết nối. |
| `+isTimedOut(now: DateTime, timeoutSec: int): boolean` | So thời gian im lặng với ngưỡng timeout. |

### `TelemetryEvent`

**MVP** · telemetry ghi payload theo loại, mốc thời gian và kết quả kiểm tra.

| Chữ ký | Mô tả |
| --- | --- |
| `+isWellFormed(): boolean` | Kiểm tra gói dữ liệu có các trường phù hợp với loại cảm biến. |
| `+isNewerThan(lastTs: DateTime): boolean` | So timestamp của gói với bản ghi gần nhất của thiết bị. |

### `IncidentService`

**MVP** · recordIncident, handleIncident, deviceResult và deenergize. Phiếu lưu đơn vị theo teamId.

| Chữ ký | Mô tả |
| --- | --- |
| `+receiveAlert(type: ResourceType, resourceId: String, hubId: String, reason: String): Incident` | Tiếp nhận cảnh báo, đối chiếu tài nguyên với Hub và lập hồ sơ sự cố. |
| `+classifyAndPrioritize(incident: Incident, category: String, severity: Severity): void` | Ghi loại sự cố và mức độ nghiêm trọng để xếp ưu tiên. |
| `+isolateResource(incident: Incident): IncidentStatus` | Kiểm tra lại và chặn cấp phát. Chỉ cách ly sau khi xác nhận an toàn, chuyển chờ đối soát nếu thiếu bằng chứng. |
| `+requestControl(targetId: String, command: ControlCommand): ControlStatus` | Gửi lệnh khóa xe hoặc dừng sạc an toàn và nhận kết quả thiết bị. |
| `+createWorkOrder(incident: Incident, assignedUnit: String): WorkOrder` | Tạo phiếu có mã riêng và giao cho đơn vị bảo trì. |
| `+sendWorkOrder(wo: WorkOrder): boolean` | Gửi phiếu đến đơn vị phụ trách và ghi nhận kết quả. |
| `+resendPendingWorkOrders(): void` | Gửi lại các phiếu chờ bằng chính mã phiếu đã cấp. |
| `+handleAffectedBookings(incident: Incident): void` | Tìm đơn bị ảnh hưởng để đề xuất đổi tài nguyên hoặc đưa vào hàng đợi ưu tiên. |
| `+syncDashboard(incident: Incident): void` | Đồng bộ màn hình vận hành với trạng thái sự cố đã xác nhận. |

### `Incident`

**MVP** · incidents ghi diễn biến từ chặn cấp phát đến cách ly và nghiệm thu. Chờ đối soát viết PENDING_CHECK.

| Chữ ký | Mô tả |
| --- | --- |
| `+markIsolated(): void` | Ghi nhận tài nguyên đã được cách ly an toàn. |
| `+markPendingCheck(): void` | Đặt hồ sơ vào trạng thái chờ xác minh thực địa. |
| `+deferIsolation(): void` | Hoãn cách ly cơ học khi điều kiện an toàn chưa cho phép. |
| `+cancel(): void` | Ghi nhận hủy xử lý sự cố. |
| `+resolve(): void` | Đánh dấu sự cố đã được giải quyết. |

### `WorkOrder`

**MVP** · workOrders giữ nguyên mã khi gửi lại. SENT cho phiếu đã nhận và DONE khi nghiệm thu.

| Chữ ký | Mô tả |
| --- | --- |
| `+markSent(): void` | Ghi nhận phiếu đã gửi thành công. |
| `+markPendingResend(): void` | Đưa phiếu gửi lỗi vào danh sách chờ gửi lại. |
| `+markInProgress(): void` | Đánh dấu đơn vị bảo trì đang xử lý phiếu. |
| `+complete(): void` | Ghi nhận công việc bảo trì đã hoàn tất. |

## 3.7 Mô phỏng và áp dụng khuyến nghị (UC12–UC13)

Đối chiếu Bảng 10, trang in 22–24. [Sơ đồ 7](diagrams/exported/submit3-37.svg).

### `SimulationService`

**MVP** · networkSnapshot, saveScenarioTemplate, validateParams và runSimulation chạy hữu hạn theo bước 15 phút.

| Chữ ký | Mô tả |
| --- | --- |
| `+getNetworkSnapshot(): NetworkSnapshot` | Lấy bản chụp riêng của mạng lưới làm đầu vào mô phỏng. |
| `+getSavedScenario(scenarioId: String): SimulationScenario` | Đọc lại kịch bản đã lưu theo mã. |
| `+saveScenarioTemplate(params: ScenarioParams, operatorId: String): SimulationScenario` | Lưu bộ tham số làm mẫu để sử dụng cho lần chạy sau. |
| `+runSimulation(scenarioParams: ScenarioParams, operatorId: String): SimulationScenario` | Kiểm tra tham số, chạy mô hình trên snapshot, tính điểm nghẽn và lưu kết quả. Ghi nhận thất bại khi timeout hoặc không hội tụ. |
| `-validateParams(scenarioParams: ScenarioParams): List<String>` | Kiểm tra tính hợp lệ của tham số và trả danh sách lỗi. |
| `-executeMovementModel(snapshot: NetworkSnapshot, params: ScenarioParams, timeSlots: int): List<ForecastStep>` | Mô phỏng chuyển động theo các bước thời gian để tạo chuỗi dự báo. |
| `-calculateBottlenecks(forecast: List<ForecastStep>, snapshot: NetworkSnapshot): List<Bottleneck>` | Phân tích chuỗi dự báo để xác định nơi thiếu xe, đầy ô hoặc quá tải hàng đợi sạc. |
| `-saveSimulationResult(resultId: String, forecastData: List<ForecastStep>, bottlenecks: List<Bottleneck>): void` | Lưu dự báo và danh sách điểm nghẽn dưới mã kết quả mô phỏng. |

### `RecommendationService`

**MVP** · simulate sinh đề xuất. recommendation kiểm tra lần nữa, dùng bản nháp khi áp dụng nhóm và bù theo kết quả đã lưu.

| Chữ ký | Mô tả |
| --- | --- |
| `+generateRecommendations(scenario: SimulationScenario): List<Recommendation>` | Sinh đề xuất điều phối, ưu tiên sạc hoặc thông báo từ kết quả kịch bản. |
| `+getRecommendations(simulationId: String): List<Recommendation>` | Truy vấn danh sách khuyến nghị của một lần mô phỏng. |
| `+applyRecommendations(simulationId: String, selectedList: List<Recommendation>, operatorId: String): List<CommandResult>` | Đọc trạng thái vận hành mới nhất, kiểm tra các khuyến nghị được chọn và thực thi thông qua dịch vụ nghiệp vụ tương ứng. Ghi nhận kết quả từng hành động. Nếu xảy ra lỗi, thực hiện quy trình hủy hoặc xử lý bù phù hợp và trả kết quả xử lý, bao gồm các trường hợp chờ đối soát. |
| `+rejectRecommendations(simulationId: String, reason: String, operatorId: String): void` | Ghi nhận quyết định từ chối cùng lý do và người thực hiện. |
| `-revalidateActions(actionList: List<Recommendation>, latestState: NetworkSnapshot): List<ValidationIssue>` | Đối chiếu từng hành động với xe, SoC, sức chứa, cổng và công suất hiện tại. Trả danh sách sai lệch trước khi phát lệnh. |
| `-dispatchCommands(actionList: List<Recommendation>): List<CommandResult>` | Chuyển các hành động đã thẩm định tới dịch vụ điều phối, dịch vụ sạc hoặc dịch vụ thông báo. Ghi nhận mã lệnh và kết quả từng hành động để phục vụ theo dõi, xử lý lỗi và đối soát. |
| `-compensateCommands(results: List<CommandResult>): List<CommandResult>` | Kiểm tra trạng thái hiện tại của từng lệnh trong lần áp dụng. Hủy các lệnh chưa thực thi khi còn được phép; thực hiện hành động bù an toàn đối với các lệnh đã thực thi nếu nghiệp vụ hỗ trợ. Ghi nhận kết quả xử lý bù và chuyển các trường hợp chưa rõ kết quả hoặc không thể khôi phục tự động sang chờ đối soát. |

### `NotificationService`

**MVP** · appendNotification, notifyRedirect và hộp thông báo. Giới hạn tần suất từng người nhận khi chuyển hướng.

| Chữ ký | Mô tả |
| --- | --- |
| `+sendNotification(recipientIds: List<String>, type: NotificationType, title: String, content: String, relatedId: String): List<Notification>` | Gửi thông báo cho các người nhận được chọn và trả danh sách bản ghi thông báo. |
| `-checkRateLimit(userId: String, type: NotificationType): boolean` | Kiểm tra giới hạn tần suất theo người nhận và loại thông báo khi gửi đề xuất chuyển hướng. |

### `Recommendation`

**MVP** · recommendations cùng chuyển trạng thái trong recommendation().

| Chữ ký | Mô tả |
| --- | --- |
| `+updateStatus(newStatus: RecommendationStatus): void` | Chuyển khuyến nghị đang chờ sang đã áp dụng, bỏ qua hoặc từ chối theo kết quả xử lý. |

### `AuditLogService`

**MVP** · operatorCommand và giao dịch nhóm ghi audit theo người thao tác, đích, thời gian và kết quả.

| Chữ ký | Mô tả |
| --- | --- |
| `+saveAuditLog(operatorId: String, action: AuditAction, targetId: String, details: String): AuditLog` | Ghi bổ sung bản nhật ký gồm người thao tác, hành động, đối tượng, chi tiết và thời điểm để truy vết. |

### `SimulationScenario`

**MVP** · scenarios giữ mẫu DRAFT và kết quả COMPLETED cùng snapshot và dự báo.

Lớp chỉ khai báo thuộc tính trong sơ đồ.

### `Notification`

**MVP** · notifications chứa người hoặc vai trò nhận cùng nội dung.

Lớp chỉ khai báo thuộc tính trong sơ đồ.

### `AuditLog`

**MVP** · audit lưu nhật ký thao tác Operator trong snapshot.

Lớp chỉ khai báo thuộc tính trong sơ đồ.
