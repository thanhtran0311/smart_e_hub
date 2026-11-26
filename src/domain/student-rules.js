import { guardHubOnline, isHubOnline } from "./resources.js";
import { ACTIVE_CHARGING as activeSchedules, ACTIVE_PARKING } from "../utils/status.js";

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

export function releaseVehicleHold(state, vehicle, reservation, now) {
  if (vehicle.reservationId !== reservation.id) return;
  const changes = { reservationId: null };
  if (vehicle.status === "RESERVED") {
    const slot = state.slots.find((row) => row.id === reservation.slotId);
    const ready =
      slot?.vehicleId === vehicle.id &&
      slot.id === vehicle.slotId &&
      slot.hubId === vehicle.hubId &&
      vehicle.hubId === reservation.hubId &&
      slot.status === "OCCUPIED" &&
      slot.sensorOccupied !== false &&
      usable(slot) &&
      usable(vehicle) &&
      vehicle.locked !== false &&
      !reservation.operationError &&
      reservation.status !== "UNLOCKED" &&
      isHubOnline(state, reservation.hubId, now);
    changes.status = ready ? "AVAILABLE" : "PENDING_CHECK";
  }
  touch(vehicle, changes, now);
}

export function parkingWindowAvailable(state, slot, vehicleId, start, end, now) {
  guardHubOnline(state, slot.hubId, now);
  ensure(
    slot.type === "PRIVATE" && usable(slot) && !slot.holdId,
    "Ô không phù hợp hoặc đang bị chặn.",
  );
  ensure(
    !state.reservations.some((row) =>
      row.type === "PARKING" &&
      ACTIVE_PARKING.includes(row.status) &&
      (row.slotId === slot.id || row.vehicleId === vehicleId) &&
      overlaps(start, end, row.start, row.end)
    ),
    "Xe hoặc ô đỗ đã có lịch trùng giờ.",
  );
  if (slot.vehicleId || slot.sensorOccupied || slot.status === "OCCUPIED") {
    ensure(
      slot.vehicleId && start > now &&
      state.reservations.some((row) =>
        row.type === "PARKING" && row.slotId === slot.id &&
        row.vehicleId === slot.vehicleId && row.status === "CHECKED_IN" &&
        row.end > now && row.end <= start
      ),
      "Ô đang có xe và chưa xác định được thời điểm trống phù hợp.",
    );
  }
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
