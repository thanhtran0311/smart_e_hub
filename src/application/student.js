import { guardHubOnline, isHubOnline, slotAvailable, uid } from "../domain/resources.js";
import { recordIncident } from "../domain/incidents.js";
import {
  ACTIVE_PARKING as activeParking, CONFIRMED_PARKING as confirmedParking,
  CONTROL_COMMAND, CONTROL_RESULT, SCHEDULED_CHARGING as scheduled,
} from "../utils/status.js";
import { deviceResult } from "./device-control.js";
import { deenergize, energize } from "./charging.js";
import {
  chargingWindowAvailable,
  checkVersion,
  ensure,
  getRow,
  owned,
  parkingWindowAvailable,
  parkedVehicleReady,
  releaseVehicleHold,
  touch,
  usable,
  windowFor,
} from "../domain/student-rules.js";

export { chargeReading } from "./charging.js";

const minute = 60000;

function requireStudent(state, user) {
  const account = state.users.find((row) => row.id === user?.id);
  ensure(
    state.userId === user?.id && account?.roles.includes("student"),
    "Chức năng này dành cho tài khoản Sinh viên.",
  );
  return account;
}

export function searchHubs(
  state,
  { query = "", type = "", minSoc = 0, nearby, minAvailableVehicles = 0 } = {},
  now = Date.now(),
) {
  const fold = (value) =>
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replaceAll("đ", "d");
  const hubs = nearby ? getNearbyHubs(state.hubs, nearby) : state.hubs;
  return hubs
    .filter((hub) =>
      fold(hub.id + " " + hub.name + " " + hub.zone).includes(fold(query)),
    )
    .map((hub) => ({
      hub,
      vehicles: state.vehicles.filter(
        (vehicle) =>
          vehicle.hubId === hub.id &&
          (!type || vehicle.type === type) &&
          vehicle.soc >= minSoc &&
          parkedVehicleReady(state, vehicle, now),
      ),
    }))
    .filter((result) => result.vehicles.length >= minAvailableVehicles);
}

export function getNearbyHubs(hubs, { lat, lon, radiusKm }) {
  ensure(
    Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lon) && Math.abs(lon) <= 180 &&
    Number.isFinite(radiusKm) && radiusKm > 0,
    "Tọa độ hoặc bán kính tra cứu không hợp lệ.",
  );
  const radians = Math.PI / 180;
  return hubs.filter((hub) => Number.isFinite(hub.lat) && Number.isFinite(hub.lon))
    .map((hub) => {
      const a = Math.sin((hub.lat - lat) * radians / 2) ** 2 +
        Math.cos(lat * radians) * Math.cos(hub.lat * radians) * Math.sin((hub.lon - lon) * radians / 2) ** 2;
      return { hub, distance: 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a))) };
    }).filter(({ distance }) => distance <= radiusKm)
    .sort((a, b) => a.distance - b.distance)
    .map(({ hub }) => hub);
}

function booking(state, input, user) {
  const row = owned(state.reservations, input.reservationId, user);
  ensure(row.type === "VEHICLE", "Đơn không phải đơn đặt xe dùng chung.");
  return row;
}

function bookVehicle(state, input, user, now) {
  const vehicle = getRow(state.vehicles, input.vehicleId);
  guardHubOnline(state, vehicle.hubId, now);
  checkVersion(vehicle, input.expectedVersion);
  ensure(
    !user.debt &&
      !state.trips.some(
        (t) => t.userId === user.id && t.status !== "COMPLETED",
      ),
    "Tài khoản còn nợ hoặc có chuyến chưa kết thúc.",
  );
  ensure(
    !state.reservations.some(
      (r) =>
        r.userId === user.id &&
        r.type === "VEHICLE" &&
        [...confirmedParking, "CHECKING_IN", "UNLOCKED", "AFFECTED"].includes(
          r.status,
        ),
    ),
    "Bạn đang có một đơn giữ xe.",
  );
  ensure(
    parkedVehicleReady(state, vehicle, now),
    "Xe chưa sẵn sàng, không đủ pin hoặc đã có người giữ.",
  );
  const row = {
    id: uid("RES"),
    type: "VEHICLE",
    userId: user.id,
    vehicleId: vehicle.id,
    hubId: vehicle.hubId,
    slotId: vehicle.slotId,
    status: "CONFIRMED",
    createdAt: now,
    expiresAt: now + state.config.params.T_HOLD_MIN * minute,
  };
  touch(row, {}, now);
  touch(vehicle, { status: "RESERVED", reservationId: row.id }, now);
  state.reservations.push(row);
  return row;
}

function closeVehicleBooking(state, row, status, now) {
  const vehicle = getRow(state.vehicles, row.vehicleId);
  releaseVehicleHold(state, vehicle, row, now);
  return touch(row, { status }, now);
}

function cancelBooking(state, input, user, now) {
  const row = booking(state, input, user);
  ensure(
    confirmedParking.includes(row.status),
    "Chỉ có thể hủy đơn đang giữ xe và chưa bắt đầu nhận.",
  );
  return closeVehicleBooking(state, row, "CANCELLED", now);
}

function pickupVehicle(state, row, now) {
  const vehicle = getRow(state.vehicles, row.vehicleId);
  const slot = getRow(state.slots, row.slotId);
  guardHubOnline(state, row.hubId, now);
  ensure(
    vehicle.hubId === row.hubId &&
      vehicle.slotId === row.slotId &&
      vehicle.reservationId === row.id &&
      vehicle.status === "RESERVED" &&
      usable(vehicle) && usable(slot) &&
      slot.hubId === row.hubId &&
      slot.status === "OCCUPIED" &&
      slot.vehicleId === vehicle.id &&
      slot.sensorOccupied !== false,
    "Xe hoặc chốt nhận chưa sẵn sàng. Hãy đối soát trước khi tiếp tục.",
  );
  return vehicle;
}

function beginPickup(state, input, user, now) {
  const row = booking(state, input, user);
  const vehicle = pickupVehicle(state, row, now);
  ensure(
    confirmedParking.includes(row.status) && now < row.expiresAt,
    "Đơn đã hết hạn hoặc đang được xử lý.",
  );
  ensure(input.code === vehicle.id, "Mã xe chưa khớp với đơn.");
  ensure(
    !state.sessions.some(
      (s) =>
        s.vehicleId === vehicle.id &&
        ["CHARGING", "STOPPED"].includes(s.status),
    ),
    "Xe còn kết nối cổng sạc. Cần xác nhận ngắt nguồn và rút đầu cắm trước khi nhận.",
  );
  return touch(
    row,
    {
      status: "CHECKING_IN",
      checkInDeadline: now + state.config.params.T_CONFIRM_MIN * minute,
    },
    now,
  );
}

function unlockAck(state, input, user, now) {
  const row = booking(state, input, user);
  const vehicle = pickupVehicle(state, row, now);
  ensure(
    row.status === "CHECKING_IN" &&
      now <= row.checkInDeadline &&
      usable(vehicle),
    "Yêu cầu mở khóa đã hết hiệu lực hoặc xe đang bị cách ly.",
  );
  const control = deviceResult(state, row, vehicle, CONTROL_COMMAND.UNLOCK, input.outcome, now);
  if (control.result !== CONTROL_RESULT.DONE) return row;
  touch(vehicle, { locked: false }, now);
  return touch(
    row,
    {
      status: "UNLOCKED",
      checkInDeadline: now + state.config.params.T_CONFIRM_MIN * minute,
    },
    now,
  );
}

function confirmPickup(state, input, user, now) {
  const row = booking(state, input, user);
  const vehicle = pickupVehicle(state, row, now);
  ensure(
    row.status === "UNLOCKED" && now <= row.checkInDeadline && vehicle.locked === false,
    "Chưa có xác nhận mở khóa an toàn trong thời hạn nhận xe.",
  );
  const trip = {
    id: uid("TRP"),
    userId: user.id,
    reservationId: row.id,
    vehicleId: row.vehicleId,
    pickupHubId: row.hubId,
    pickupSlotId: row.slotId,
    departed: false,
    start: now,
    status: "ACTIVE",
  };
  touch(trip, {}, now);
  state.trips.push(trip);
  touch(row, { status: "CONSUMED", tripId: trip.id }, now);
  touch(
    vehicle,
    { status: "IN_USE", reservationId: null, tripId: trip.id },
    now,
  );
  return trip;
}

function reportPickup(state, input, user, now) {
  const row = booking(state, input, user);
  ensure(
    ["CHECKING_IN", "UNLOCKED"].includes(row.status),
    "Chỉ có thể báo lỗi bàn giao khi đang kiểm tra xe.",
  );
  const reason = String(input.reason || "").trim();
  ensure(reason, "Hãy mô tả sự cố bạn quan sát được.");
  recordIncident(state, row.vehicleId, reason, now);
  closeVehicleBooking(state, row, "CANCELLED", now);
  return row;
}

function leaveSlot(state, input, user, now) {
  const trip = owned(state.trips, input.tripId, user);
  const slot = getRow(state.slots, trip.pickupSlotId);
  ensure(
    trip.status === "ACTIVE" &&
      !trip.departed &&
      slot.vehicleId === trip.vehicleId,
    "Cảm biến rời ô không khớp chuyến.",
  );
  touch(
    slot,
    { status: slot.blocked ? "OUT_OF_SERVICE" : "AVAILABLE", vehicleId: null, sensorOccupied: false },
    now,
  );
  touch(
    getRow(state.vehicles, trip.vehicleId),
    { hubId: null, slotId: null },
    now,
  );
  return touch(trip, { departed: true }, now);
}

function requestReturn(state, input, user, now) {
  const trip = owned(state.trips, input.tripId, user);
  const selected = input.slotId && getRow(state.slots, input.slotId);
  const hubId = input.hubId || selected?.hubId;
  guardHubOnline(state, hubId, now);
  ensure(
    ["ACTIVE", "RETURN_PENDING"].includes(trip.status) && trip.departed,
    "Cần có chuyến đang đi và chưa ghi nhận khóa ở chốt trả.",
  );
  const previous = state.slots.find((s) => s.id === trip.returnSlotId);
  ensure(!previous?.vehicleId && !previous?.sensorOccupied, "Chốt cũ còn ghi nhận xe. Cần đối soát tại chỗ.");
  const slot = state.slots.find(
    (s) =>
      s.hubId === hubId &&
      s.type === "SHARED" &&
      (!selected || s === selected) &&
      (!previous || s !== previous) &&
      slotAvailable(state, s),
  );
  ensure(slot, "Hub đích hết chốt nhận xe. Hãy chọn Hub khác.");
  if (previous?.holdId === trip.id) touch(previous, { holdId: null }, now);
  touch(slot, { holdId: trip.id }, now);
  return touch(
    trip,
    {
      status: "RETURN_PENDING",
      returnHubId: hubId,
      returnSlotId: slot.id,
      operationError: null,
    },
    now,
  );
}

function lockReturn(state, input, user, now) {
  const trip = owned(state.trips, input.tripId, user);
  const slot = getRow(state.slots, trip.returnSlotId);
  guardHubOnline(state, trip.returnHubId, now);
  ensure(
    trip.status === "RETURN_PENDING" &&
      slot.holdId === trip.id &&
      usable(slot) &&
      input.slotId === slot.id &&
      input.vehicleId === trip.vehicleId,
    "Xe hoặc chốt khác với yêu cầu trả.",
  );
  const vehicle = getRow(state.vehicles, trip.vehicleId);
  const control = deviceResult(state, trip, vehicle, CONTROL_COMMAND.LOCK, input.outcome, now);
  if (control.result !== CONTROL_RESULT.DONE) return trip;
  touch(vehicle, { locked: true }, now);
  // Persist physical evidence before the separate business commit; retrying settlement is safe.
  return touch(
    trip,
    { status: "PENDING_VERIFICATION", lockedAt: now, evidenceId: uid("ACK") },
    now,
  );
}

function finishReturn(state, input, user, now) {
  const trip = owned(state.trips, input.tripId, user);
  const slot = getRow(state.slots, trip.returnSlotId);
  const vehicle = getRow(state.vehicles, trip.vehicleId);
  ensure(
    trip.status === "PENDING_VERIFICATION" &&
      trip.evidenceId &&
      slot.holdId === trip.id &&
      (!slot.vehicleId || slot.vehicleId === vehicle.id),
    "Cần đối soát bằng chứng xe đã vào đúng ô và khóa an toàn.",
  );
  const issue =
    !!input.issue || vehicle.blocked || !Number.isFinite(vehicle.soc);
  const status = issue
    ? "PENDING_CHECK"
    : vehicle.soc < state.config.params.MIN_SOC_BOOK_PCT
      ? "WAITING_CHARGE"
      : "AVAILABLE";
  touch(
    vehicle,
    { status, hubId: slot.hubId, slotId: slot.id, tripId: null },
    now,
  );
  touch(slot, { status: "OCCUPIED", vehicleId: vehicle.id, holdId: null, sensorOccupied: true }, now);
  if (input.issue)
    recordIncident(
      state,
      vehicle.id,
      "Sinh viên báo xe cần kiểm tra kỹ thuật khi trả.",
      now,
    );
  return touch(trip, { status: "COMPLETED", end: now }, now);
}

function bookParking(state, input, user, now) {
  const slot = getRow(state.slots, input.slotId);
  const vehicle = getRow(state.privateVehicles, input.vehicleId);
  const { start, end } = windowFor(input, now);
  checkVersion(slot, input.expectedVersion);
  ensure(
    (vehicle.userId || vehicle.ownerId) === user.id,
    "Xe cá nhân này không thuộc tài khoản hiện tại.",
  );
  parkingWindowAvailable(state, slot, vehicle.id, start, end, now);
  const deposit = state.config.params.PARKING_DEPOSIT_VND;
  ensure(
    user.balance - user.held >= deposit,
    "Số dư khả dụng không đủ để giữ tiền cọc.",
  );
  const row = {
    id: uid("RES"),
    type: "PARKING",
    userId: user.id,
    vehicleId: vehicle.id,
    hubId: slot.hubId,
    slotId: slot.id,
    start,
    end,
    status: "CONFIRMED",
    createdAt: now,
    expiresAt: Math.min(end, start + state.config.params.T_GRACE_MIN * minute),
    deposit,
    depositStatus: "HELD",
  };
  touch(user, { held: user.held + deposit }, now);
  touch(row, {}, now);
  touch(slot, {}, now);
  state.reservations.push(row);
  return row;
}

function settleDeposit(state, row, forfeited, now) {
  if (row.depositStatus !== "HELD") return;
  const user = getRow(state.users, row.userId);
  touch(
    user,
    {
      held: user.held - row.deposit,
      balance: user.balance - (forfeited ? row.deposit : 0),
    },
    now,
  );
  row.depositStatus = forfeited ? "FORFEITED" : "RELEASED";
}

function closeParking(state, row, status, now) {
  settleDeposit(state, row, status === "EXPIRED", now);
  touch(getRow(state.slots, row.slotId), {}, now);
  for (const schedule of state.schedules)
    if (schedule.reservationId === row.id && scheduled.includes(schedule.status))
      closeSchedule(state, schedule, "CANCELLED", now);
  return touch(row, { status }, now);
}

function parking(state, input, user) {
  const row = owned(state.reservations, input.reservationId, user);
  ensure(row.type === "PARKING", "Hãy chọn đơn đặt ô đỗ.");
  return row;
}

function cancelParking(state, input, user, now) {
  const row = parking(state, input, user);
  ensure(
    confirmedParking.includes(row.status) && now <= row.expiresAt,
    "Đơn không còn trong thời gian được hủy.",
  );
  return closeParking(state, row, "CANCELLED", now);
}

function checkInParking(state, input, user, now) {
  const row = parking(state, input, user);
  const slot = getRow(state.slots, row.slotId);
  guardHubOnline(state, row.hubId, now);
  ensure(
    confirmedParking.includes(row.status) &&
      now >= row.start &&
      now <= row.expiresAt &&
      now < row.end,
    "Đơn chưa đến giờ, đã quá hạn hoặc đã check-in.",
  );
  ensure(
    usable(slot) &&
      slot.status === "AVAILABLE" &&
      !slot.holdId &&
      !slot.vehicleId &&
      !slot.sensorOccupied &&
      !state.slots.some((other) => other.vehicleId === row.vehicleId),
    "Chưa xác nhận ô đích trống hoặc xe vẫn ở một ô khác.",
  );
  touch(slot, { status: "OCCUPIED", vehicleId: row.vehicleId, sensorOccupied: true }, now);
  settleDeposit(state, row, false, now);
  return touch(row, { status: "CHECKED_IN", checkedInAt: now }, now);
}

function leaveParking(state, input, user, now) {
  const row = parking(state, input, user);
  const slot = getRow(state.slots, row.slotId);
  ensure(
    row.status === "CHECKED_IN" && slot.vehicleId === row.vehicleId,
    "Xe không ở đúng ô đã check-in.",
  );
  ensure(
    !state.schedules.some(
      (s) =>
        s.reservationId === row.id &&
        ["PLUGGED", "CHARGING", "STOPPED"].includes(s.status),
    ),
    "Hãy dừng sạc và rút đầu cắm trước khi rời ô.",
  );
  touch(
    slot,
    { status: slot.blocked ? "OUT_OF_SERVICE" : "AVAILABLE", vehicleId: null, sensorOccupied: false },
    now,
  );
  return closeParking(state, row, "COMPLETED", now);
}

function bookCharging(state, input, user, now) {
  const row = parking(state, input, user);
  const port = getRow(state.ports, input.portId);
  const vehicle = getRow(state.privateVehicles, row.vehicleId);
  const { start, end } = windowFor(input, now);
  checkVersion(port, input.expectedVersion);
  ensure(
    activeParking.includes(row.status) &&
      row.start <= start &&
      end <= row.end &&
      (row.status === "CHECKED_IN" || now <= row.expiresAt),
    "Khung giờ sạc phải nằm trong lịch đỗ còn hiệu lực.",
  );
  ensure(
    port.hubId === row.hubId &&
      usable(port) &&
      (!vehicle.connector || vehicle.connector === port.connector),
    "Cổng sai Hub, không tương thích hoặc đang bị chặn.",
  );
  chargingWindowAvailable(state, port, vehicle.id, start, end, now);
  if (port.status !== "AVAILABLE") {
    ensure(
      start > now &&
        state.schedules.some(
          (s) =>
            s.portId === port.id &&
            ["PLUGGED", "CHARGING", "STOPPED"].includes(s.status) &&
            s.end > now &&
            s.end <= start,
        ),
      "Cổng đang được sử dụng và chưa có giờ trống phù hợp.",
    );
  }
  const schedule = {
    id: uid("SCH"),
    reservationId: row.id,
    portId: port.id,
    userId: user.id,
    vehicleId: row.vehicleId,
    hubId: row.hubId,
    start,
    end,
    code: uid("PIN"),
    status: "SCHEDULED",
    createdAt: now,
  };
  touch(schedule, {}, now);
  touch(port, {}, now);
  state.schedules.push(schedule);
  return schedule;
}

function cancelCharging(state, input, user, now) {
  const schedule = owned(state.schedules, input.scheduleId, user);
  ensure(
    scheduled.includes(schedule.status),
    "Lịch này đã thực hiện hoặc không còn hiệu lực.",
  );
  return closeSchedule(state, schedule, "CANCELLED", now);
}

function closeSchedule(state, schedule, status, now) {
  touch(getRow(state.ports, schedule.portId), {}, now);
  return touch(schedule, { status }, now);
}

function plugCharger(state, input, user, now) {
  const schedule = owned(state.schedules, input.scheduleId, user);
  const port = getRow(state.ports, schedule.portId);
  const reservation = getRow(state.reservations, schedule.reservationId);
  guardHubOnline(state, schedule.hubId, now);
  ensure(
    scheduled.includes(schedule.status) &&
      input.code === schedule.code &&
      reservation.status === "CHECKED_IN" &&
      schedule.start <= now &&
      now < schedule.end,
    "Kiểm tra mã nhận sạc, thời gian hẹn và trạng thái check-in ô đỗ.",
  );
  ensure(
    port.status === "AVAILABLE" && usable(port),
    "Cổng chưa sẵn sàng để cắm sạc.",
  );
  touch(
    port,
    {
      status: "OCCUPIED_WAITING",
      plugged: true,
      sensorPlugged: true,
      relayOn: false,
      scheduleId: schedule.id,
      vehicleId: schedule.vehicleId,
    },
    now,
  );
  return touch(schedule, { status: "PLUGGED" }, now);
}

function startCharging(state, input, user, now) {
  const schedule = owned(state.schedules, input.scheduleId, user);
  return energize(state, schedule, now, input.outcome);
}

function stopCharging(state, input, user, now) {
  const schedule = owned(state.schedules, input.scheduleId, user);
  return deenergize(state, schedule, now, input.outcome);
}

function unplugCharger(state, input, user, now) {
  const schedule = owned(state.schedules, input.scheduleId, user);
  const port = getRow(state.ports, schedule.portId);
  ensure(
    ["STOPPED", "PLUGGED"].includes(schedule.status) &&
      !port.relayOn && !port.sensorRelayOn &&
      (!port.scheduleId || port.scheduleId === schedule.id),
    "Cần xác nhận ngắt điện trước khi rút đầu cắm.",
  );
  const session = state.sessions.find(
    (s) => s.scheduleId === schedule.id && s.status === "STOPPED",
  );
  if (session) touch(session, { status: "COMPLETED" }, now);
  touch(
    port,
    {
      status: port.blocked ? "OUT_OF_SERVICE" : "AVAILABLE",
      sessionId: null,
      scheduleId: null,
      plugged: false,
      sensorPlugged: false,
      sensorRelayOn: false,
      vehicleId: null,
    },
    now,
  );
  return touch(schedule, { status: session ? "COMPLETED" : "CANCELLED" }, now);
}

export function expireStudentHolds(state, now) {
  for (const row of state.reservations) {
    if (row.type === "VEHICLE") {
      if (
        (confirmedParking.includes(row.status) && now >= row.expiresAt) ||
        (["CHECKING_IN", "UNLOCKED"].includes(row.status) &&
          now > row.checkInDeadline)
      ) {
        closeVehicleBooking(state, row, "EXPIRED", now);
      }
    } else if (
      row.type === "PARKING" &&
      confirmedParking.includes(row.status) &&
      now > row.expiresAt
    ) {
      closeParking(state, row, "EXPIRED", now);
    }
  }
  for (const schedule of state.schedules) {
    if (scheduled.includes(schedule.status) && now >= schedule.end)
      closeSchedule(state, schedule, "EXPIRED", now);
    if (schedule.status === "CHARGING" && now >= schedule.end) {
      const port = getRow(state.ports, schedule.portId);
      if (isHubOnline(state, port.hubId, now) && !port.blocked) {
        stopCharging(
          state,
          { scheduleId: schedule.id },
          { id: schedule.userId },
          now,
        );
      }
    }
  }
}

const handlers = {
  bookVehicle,
  cancelBooking,
  beginPickup,
  unlockAck,
  confirmPickup,
  reportPickup,
  leaveSlot,
  requestReturn,
  lockReturn,
  finishReturn,
  bookParking,
  cancelParking,
  checkInParking,
  leaveParking,
  bookCharging,
  cancelCharging,
  plugCharger,
  startCharging,
  stopCharging,
  unplugCharger,
};

/** Invoke inside OperationalStore.transaction so validation and all writes share one draft. */
export function studentCommand(state, action, input = {}, { user, now }) {
  const account = requireStudent(state, user);
  ensure(Object.hasOwn(handlers, action), "Thao tác Sinh viên không hợp lệ.");
  return handlers[action](state, input, account, now);
}
