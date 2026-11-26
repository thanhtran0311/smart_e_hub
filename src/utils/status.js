// Mã trạng thái lưu trong snapshot MVP. Ánh xạ thiết kế nằm trong docs/submission-3.

const enumOf = (...values) => Object.freeze(values.reduce((acc, v) => { acc[v] = v; return acc; }, {}));

// --- Tài khoản ---
export const ROLE = Object.freeze({ STUDENT: 'student', OPERATOR: 'operator' });

// --- Hub (UC08, UC14) ---
export const HUB_CONNECTIVITY = enumOf('ONLINE', 'OFFLINE');
export const HUB_STATUS = enumOf('NORMAL', 'WARNING', 'OVERLOAD', 'FAULTED', 'OFFLINE');

// --- Phương tiện (UC01–UC04, UC09) ---
export const VEHICLE_TYPE = enumOf('BIKE', 'SCOOTER');
export const VEHICLE_STATUS = enumOf(
  'AVAILABLE', 'RESERVED', 'IN_USE', 'WAITING_CHARGE', 'CHARGING', 'RELOCATING', 'PENDING_CHECK', 'FAULTED', 'OUT_OF_SERVICE'
);

// --- Ô đỗ (UC01, UC04, UC05) ---
export const PARKING_SPACE_KIND = enumOf('SHARED', 'PRIVATE');
export const PARKING_SPACE_STATUS = enumOf(
  'AVAILABLE', 'RESERVED', 'OCCUPIED', 'PENDING_CHECK', 'FAULTED', 'OUT_OF_SERVICE'
);

// --- Cổng sạc (UC06, UC07, UC10, UC11) ---
export const CONNECTOR = enumOf('TYPE_2', 'AC_STANDARD', 'DC_FAST');
export const CHARGING_POINT_STATUS = enumOf(
  'AVAILABLE', 'RESERVED', 'OCCUPIED_WAITING', 'CHARGING', 'STOPPED', 'CHARGED_FULL', 'PENDING_CHECK', 'FAULTED', 'OUT_OF_SERVICE', 'OFFLINE'
);

// --- Đơn đặt trước và lượt thuê (UC02–UC05) ---
export const RESERVATION_KIND = enumOf('VEHICLE', 'PARKING');
export const RESERVATION_STATUS = enumOf(
  'CONFIRMED', 'CHECKING_IN', 'UNLOCKED', 'CONSUMED', 'CHECKED_IN', 'COMPLETED',
  'CANCELLED', 'EXPIRED', 'AFFECTED', 'RESCHEDULED', 'REPLACED'
);
export const TRIP_STATUS = enumOf('ACTIVE', 'RETURN_PENDING', 'PENDING_VERIFICATION', 'COMPLETED');

// --- Lịch sạc và phiên sạc (UC06, UC07, UC10) ---
export const SCHEDULE_STATUS = enumOf(
  'SCHEDULED', 'PLUGGED', 'CHARGING', 'STOPPED', 'COMPLETED', 'CANCELLED',
  'EXPIRED', 'AFFECTED', 'RESCHEDULED', 'REPLACED'
);
export const SESSION_STATUS = enumOf('CHARGING', 'STOPPED', 'COMPLETED', 'FAILED');
export const CONFIRMED_PARKING = Object.freeze([
  RESERVATION_STATUS.CONFIRMED, RESERVATION_STATUS.RESCHEDULED, RESERVATION_STATUS.REPLACED,
]);
export const ACTIVE_PARKING = Object.freeze([...CONFIRMED_PARKING, RESERVATION_STATUS.CHECKED_IN]);
export const SCHEDULED_CHARGING = Object.freeze([
  SCHEDULE_STATUS.SCHEDULED, SCHEDULE_STATUS.RESCHEDULED, SCHEDULE_STATUS.REPLACED,
]);
export const ACTIVE_CHARGING = Object.freeze([
  ...SCHEDULED_CHARGING, SCHEDULE_STATUS.PLUGGED, SCHEDULE_STATUS.CHARGING, SCHEDULE_STATUS.STOPPED,
]);

// --- Điều phối (UC09, UC13) ---
export const DISPATCH_ORDER_STATUS = enumOf('PENDING', 'IN_TRANSIT', 'COMPLETED', 'PARTIALLY_COMPLETED', 'CANCELLED', 'FAILED');

// --- Sự cố và bảo trì (UC11) ---
export const INCIDENT_STATUS = enumOf('ALERT', 'ISOLATING', 'PENDING_CHECK', 'ISOLATED', 'IN_REPAIR', 'RESOLVED', 'CANCELLED');
export const WORK_ORDER_STATUS = enumOf('PENDING_RESEND', 'SENT', 'IN_PROGRESS', 'DONE');

// --- Mô phỏng và khuyến nghị (UC12, UC13) ---
export const SIMULATION_STATUS = enumOf('DRAFT', 'RUNNING', 'COMPLETED', 'FAILED');
export const RECOMMENDATION_TYPE = enumOf('REDISTRIBUTE', 'RESCHEDULE_CHARGING', 'REDIRECT_USERS');
export const RECOMMENDATION_STATUS = enumOf('PENDING', 'APPLIED', 'REJECTED', 'FAILED', 'COMPENSATED', 'PENDING_CHECK');

// --- Telemetry và điều khiển thiết bị (UC14, Quy ước (e)) ---
export const TELEMETRY_RESULT = enumOf('APPLIED', 'IGNORED_DUPLICATE', 'IGNORED_STALE', 'REJECTED_CORRUPT', 'TIMEOUT');
export const CONTROL_COMMAND = enumOf('START_CHARGING', 'STOP_CHARGING', 'STOP_CHARGING_SAFE', 'DENY_POWER', 'LOCK', 'UNLOCK', 'PAUSE');
export const CONTROL_RESULT = enumOf('PENDING', 'DONE', 'FAILED', 'TIMEOUT', 'SKIPPED');

// --- Thông báo và nhật ký ---
export const NOTIFICATION_TYPE = enumOf('INFO', 'WARNING', 'ALERT', 'REDIRECT');
export const AUDIT_RESULT = enumOf('SUCCESS', 'FAILURE');
