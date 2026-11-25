import { guardHubOnline, isHubOnline } from "./resources.js";
import { ACTIVE_CHARGING as activeSchedules } from "../utils/status.js";

export const overlaps = (a, b, c, d) => a < d && c < b;
export const usable = (row) =>
  !row.blocked &&
  !row.sensorOffline &&
  !["FAULTED", "OUT_OF_SERVICE", "PENDING_CHECK"].includes(row.status);

export function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

export function getRow(rows, id) {
  const row = rows.find((item) => item.id === id);
  ensure(row, "Bản ghi không còn tồn tại. Hãy làm mới và chọn lại.");
  return row;
}

export function touch(row, changes, now) {
  Object.assign(row, changes, {
    version: (row.version || 0) + 1,
    updatedAt: now,
  });
  return row;
}

export function owned(rows, id, user) {
  const row = getRow(rows, id);
  ensure(row.userId === user.id, "Bạn không có quyền thao tác với đơn này.");
  return row;
}

export function checkVersion(resource, expectedVersion) {
  ensure(
    expectedVersion !== undefined && resource.version === Number(expectedVersion),
    "Tài nguyên vừa thay đổi. Hãy kiểm tra và xác nhận lại.",
  );
}

export function windowFor(input, now) {
  const { start, end } = input;
  ensure(
    Number.isFinite(start) && Number.isFinite(end) && start < end && end > now,
    "Khung giờ phải hợp lệ, có thời điểm kết thúc sau hiện tại.",
  );
  // The input controls show minutes. Accept the current minute for immediate check-in.
  ensure(
    start >= Math.floor(now / 60000) * 60000,
    "Vui lòng chọn khung giờ hiện tại hoặc tương lai.",
  );
  return { start, end };
}

export function parkedVehicleReady(state, vehicle, now) {
  const slot = state.slots.find((item) => item.id === vehicle.slotId);
  return (
    usable(vehicle) &&
    vehicle.status === "AVAILABLE" &&
    vehicle.soc >= state.config.params.MIN_SOC_BOOK_PCT &&
    slot?.vehicleId === vehicle.id &&
    slot.status === "OCCUPIED" &&
    slot.sensorOccupied !== false &&
    usable(slot) &&
    isHubOnline(state, vehicle.hubId, now)
  );
}

export function chargingWindowAvailable(
  state,
  port,
  vehicleId,
  start,
  end,
  now,
) {
  guardHubOnline(state, port.hubId, now);
  const bookings = state.schedules.filter(
    (item) =>
      activeSchedules.includes(item.status) &&
      overlaps(start, end, item.start, item.end),
  );
  ensure(
    !bookings.some(
      (item) => item.portId === port.id || item.vehicleId === vehicleId,
    ),
    "Cổng hoặc xe đã có lịch trong khung giờ này. Hãy đổi giờ hoặc cổng.",
  );
  // Power changes only at a reservation boundary. Check each peak separately.
  const local = bookings.filter((item) => item.hubId === port.hubId);
  const times = new Set([
    start,
    ...local.map((item) => Math.max(start, item.start)),
  ]);
  const limit = state.config.hubPowerLimitKw[port.hubId];
  for (const time of times) {
    const load = local
      .filter((item) => item.start <= time && time < item.end)
      .reduce(
        (sum, item) => sum + getRow(state.ports, item.portId).powerKw,
        port.powerKw,
      );
    ensure(load <= limit, "Hub không còn đủ công suất trong khung giờ này.");
  }
}
