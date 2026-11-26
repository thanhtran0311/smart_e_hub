import { guardHubOnline, isHubOnline, slotAvailable, uid } from "../domain/resources.js";
import { recordIncident } from "../domain/incidents.js";
import { ChargingSchedule, ParkingReservation, Reservation, Trip } from "../domain/entities.js";
import {
  ACTIVE_PARKING as activeParking, CONFIRMED_PARKING as confirmedParking,
  CONTROL_COMMAND, CONTROL_RESULT, SCHEDULED_CHARGING as scheduled,
} from "../utils/status.js";
import { deviceResult } from "./device-control.js";
import { ChargingSessionService } from "./charging.js";
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
    state.userId === user?.id && account?.hasPermission("student"),
    "Chức năng này dành cho tài khoản Sinh viên.",
  );
  return account;
}

export class HubService {
  static searchHubs(
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
    const hubs = nearby ? HubService.getNearbyHubs(state.hubs, nearby) : state.hubs;
    return hubs
      .filter((hub) =>
        fold(hub.id + " " + hub.name + " " + hub.zone).includes(fold(query)),
      )
      .map((hub) => ({
        hub,
        vehicles: VehicleService.findAvailableVehicles(state, hub.id, { type, minSoc }, now),
      }))
      .filter((result) => result.vehicles.length >= minAvailableVehicles);
  }

  static getHubDetail(state, hubId) {
    return getRow(state.hubs, hubId);
  }

  static getNearbyHubs(hubs, { lat, lon, radiusKm }) {
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
}

export class ReservationService {
  static booking(state, input, user) {
    const row = owned(state.reservations, input.reservationId, user);
    ensure(row.type === "VEHICLE", "Đơn không phải đơn đặt xe dùng chung.");
    return row;
  }

  static validateVehicleBooking(state, input, user, now) {
    const vehicle = getRow(state.vehicles, input.vehicleId);
    guardHubOnline(state, vehicle.hubId, now);
    checkVersion(vehicle, input.expectedVersion);
    ensure(!input.hubId || input.hubId === vehicle.hubId, "Xe không còn ở Hub đã chọn.");
    ensure(
      !user.debt &&
        !state.trips.some(
          (t) => t.userId === user.id && t.isActive(),
        ),
      "Tài khoản còn nợ hoặc có chuyến chưa kết thúc.",
    );
    ensure(
      !state.reservations.some(
        (r) =>
          r.type === "VEHICLE" && r.belongsTo(user.id) &&
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
    return vehicle;
  }

  static validateBooking(state, input, { user, now }) {
    const account = requireStudent(state, user);
    const vehicle = ReservationService.validateVehicleBooking(state, input, account, now);
    return {
      vehicleId: vehicle.id,
      hubId: vehicle.hubId,
      hubName: HubService.getHubDetail(state, vehicle.hubId).name,
      slotId: vehicle.slotId,
      soc: vehicle.soc,
      expectedVersion: vehicle.version,
      holdMinutes: state.config.params.T_HOLD_MIN,
    };
  }

  static confirmReservation(state, input, user, now) {
    const vehicle = ReservationService.validateVehicleBooking(state, input, user, now);
    const row = new Reservation({
      id: uid("RES"),
      type: "VEHICLE",
      userId: user.id,
      vehicleId: vehicle.id,
      hubId: vehicle.hubId,
      slotId: vehicle.slotId,
      createdAt: now,
      expiresAt: now + state.config.params.T_HOLD_MIN * minute,
    });
    touch(row.confirm(), {}, now);
    touch(vehicle.reserve(row.id), {}, now);
    state.reservations.push(row);
    return row;
  }

  static closeVehicleBooking(state, row, status, now) {
    const vehicle = getRow(state.vehicles, row.vehicleId);
    releaseVehicleHold(state, vehicle, row, now);
    return touch(status === "EXPIRED" ? row.expire() : row.cancel(), {}, now);
  }

  static cancelReservation(state, input, user, now) {
    const row = ReservationService.booking(state, input, user);
    ensure(
      confirmedParking.includes(row.status),
      "Chỉ có thể hủy đơn đang giữ xe và chưa bắt đầu nhận.",
    );
    return ReservationService.closeVehicleBooking(state, row, "CANCELLED", now);
  }
}

export class VehicleService {
  static findAvailableVehicles(state, hubId, { type, minSoc }, now) {
    return state.vehicles.filter((vehicle) =>
      vehicle.hubId === hubId && (!type || vehicle.type === type) &&
      vehicle.soc >= minSoc && parkedVehicleReady(state, vehicle, now),
    );
  }

  static validateVehicleAtHub(state, row, now) {
    const vehicle = getRow(state.vehicles, row.vehicleId);
    const slot = getRow(state.slots, row.slotId);
    guardHubOnline(state, row.hubId, now);
    ensure(
      vehicle.isAt(row.hubId, row.slotId) &&
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

  static pickupChargingSchedule(state, row) {
    const connection = ChargingSessionService.chargingConnection(state, row.vehicleId);
    const schedule = connection?.schedule;
    ensure(
      schedule && row.matches(schedule.vehicleId, schedule.hubId) &&
        schedule.userId == null && schedule.reservationId == null &&
        connection.port?.scheduleId === schedule.id && connection.port.vehicleId === row.vehicleId &&
        connection.port.hubId === row.hubId,
      "Cần vận hành viên đối soát cổng sạc, xe và lịch trước khi nhận.",
    );
    return schedule;
  }

  static stopChargingSafely(state, row, now, outcome) {
    const schedule = VehicleService.pickupChargingSchedule(state, row);
    return ChargingSessionService.deenergize(state, schedule, now, outcome);
  }

  static disconnectPickupCharger(state, row, now) {
    const schedule = VehicleService.pickupChargingSchedule(state, row);
    ensure(!getRow(state.ports, schedule.portId).sensorOffline, "Cảm biến cổng sạc mất kết nối. Cần đối soát.");
    return ChargingSessionService.disconnectCharger(state, schedule, now);
  }
}

export class TripService {
  static requestPickup(state, input, user, now) {
    const row = ReservationService.booking(state, input, user);
    VehicleService.validateVehicleAtHub(state, row, now);
    ensure(
      row.isActive(now),
      "Đơn đã hết hạn hoặc đang được xử lý.",
    );
    ensure(input.code === row.vehicleId, "Mã xe chưa khớp với đơn.");
    return touch(
      row,
      {
        status: "CHECKING_IN",
        checkInDeadline: now + state.config.params.T_CONFIRM_MIN * minute,
      },
      now,
    );
  }

  static checkedInPickup(state, input, user, now) {
    const row = ReservationService.booking(state, input, user);
    const vehicle = VehicleService.validateVehicleAtHub(state, row, now);
    ensure(
      row.status === "CHECKING_IN" && now <= row.checkInDeadline,
      "Yêu cầu nhận xe đã hết hiệu lực hoặc đã qua bước kiểm tra.",
    );
    return { row, vehicle };
  }

  static stopPickupCharging(state, input, user, now) {
    const { row } = TripService.checkedInPickup(state, input, user, now);
    const schedule = VehicleService.stopChargingSafely(state, row, now, input.outcome);
    return touch(row, {
      lastChargingControlId: schedule.lastControlId,
      operationError: schedule.operationError,
    }, now);
  }

  static disconnectPickupCharger(state, input, user, now) {
    const { row } = TripService.checkedInPickup(state, input, user, now);
    VehicleService.disconnectPickupCharger(state, row, now);
    return touch(row, { operationError: null }, now);
  }

  static unlockAck(state, input, user, now) {
    const { row, vehicle } = TripService.checkedInPickup(state, input, user, now);
    ensure(!ChargingSessionService.chargingConnection(state, vehicle.id), "Cần xác nhận ngắt điện và rút cáp trước khi mở khóa.");
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

  static startTrip(state, input, user, now) {
    const row = ReservationService.booking(state, input, user);
    const vehicle = VehicleService.validateVehicleAtHub(state, row, now);
    ensure(
      row.status === "UNLOCKED" && now <= row.checkInDeadline && vehicle.locked === false,
      "Chưa có xác nhận mở khóa an toàn trong thời hạn nhận xe.",
    );
    ensure(!ChargingSessionService.chargingConnection(state, vehicle.id), "Cần đối soát kết nối sạc trước khi xác nhận nhận xe.");
    const trip = Trip.start({
      id: uid("TRP"),
      userId: user.id,
      reservationId: row.id,
      vehicleId: row.vehicleId,
      pickupHubId: row.hubId,
      pickupSlotId: row.slotId,
    }, now);
    touch(trip, {}, now);
    state.trips.push(trip);
    touch(row.consume(trip.id), {}, now);
    touch(vehicle.markInUse(trip.id), {}, now);
    return trip;
  }

  static reportPickup(state, input, user, now) {
    const row = ReservationService.booking(state, input, user);
    ensure(
      ["CHECKING_IN", "UNLOCKED"].includes(row.status),
      "Chỉ có thể báo lỗi bàn giao khi đang kiểm tra xe.",
    );
    const reason = String(input.reason || "").trim();
    ensure(reason, "Hãy mô tả sự cố bạn quan sát được.");
    recordIncident(state, row.vehicleId, reason, now);
    ReservationService.closeVehicleBooking(state, row, "CANCELLED", now);
    return row;
  }

  static leaveSlot(state, input, user, now) {
    const trip = owned(state.trips, input.tripId, user);
    const slot = getRow(state.slots, trip.pickupSlotId);
    ensure(
      trip.status === "ACTIVE" &&
        !trip.departed &&
        slot.vehicleId === trip.vehicleId,
      "Cảm biến rời ô không khớp chuyến.",
    );
    touch(slot.markAvailable(), {}, now);
    touch(
      getRow(state.vehicles, trip.vehicleId),
      { hubId: null, slotId: null },
      now,
    );
    return touch(trip, { departed: true }, now);
  }

  static requestReturnHub(state, input, user, now) {
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
    touch(slot.markReserved(trip.id), {}, now);
    return touch(trip.requestEnd(hubId, slot.id), {}, now);
  }

  static endTrip(state, input, user, now) {
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
    return touch(trip.attachParkingEvidence(uid("ACK"), now), {}, now);
  }

  static finalizeTrip(state, input, user, now) {
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
    touch(
      vehicle.classifyAfterReturn(Boolean(input.issue), state.config.params.MIN_SOC_BOOK_PCT),
      { hubId: slot.hubId, slotId: slot.id, tripId: null },
      now,
    );
    touch(slot.markOccupied(vehicle.id), { holdId: null }, now);
    if (input.issue)
      recordIncident(
        state,
        vehicle.id,
        "Sinh viên báo xe cần kiểm tra kỹ thuật khi trả.",
        now,
      );
    return touch(trip.confirmEnded(now), {}, now);
  }
}

export class ParkingService {
  static getVehicles(state, studentId) {
    return state.privateVehicles.filter((vehicle) => vehicle.belongsTo(studentId));
  }

  static confirmReservation(state, input, user, now) {
    const slot = getRow(state.slots, input.slotId);
    const vehicle = getRow(state.privateVehicles, input.vehicleId);
    const { start, end } = windowFor(input, now);
    checkVersion(slot, input.expectedVersion);
    ensure(
      vehicle.belongsTo(user.id),
      "Xe cá nhân này không thuộc tài khoản hiện tại.",
    );
    parkingWindowAvailable(state, slot, vehicle.id, start, end, now);
    const deposit = state.config.params.PARKING_DEPOSIT_VND;
    ensure(
      user.balance - user.held >= deposit,
      "Số dư khả dụng không đủ để giữ tiền cọc.",
    );
    const row = new ParkingReservation({
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
    });
    touch(user, { held: user.held + deposit }, now);
    touch(row, {}, now);
    touch(slot, {}, now);
    state.reservations.push(row);
    return row;
  }

  static settleDeposit(state, row, forfeited, now) {
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

  static closeParking(state, row, status, now) {
    ParkingService.settleDeposit(state, row, status === "EXPIRED", now);
    touch(getRow(state.slots, row.slotId), {}, now);
    for (const schedule of state.schedules)
      if (schedule.reservationId === row.id && scheduled.includes(schedule.status))
        ChargingScheduleService.closeSchedule(state, schedule, "CANCELLED", now);
    if (status === "EXPIRED") return touch(row.expire(), {}, now);
    if (status === "CANCELLED") return touch(row.cancel(), {}, now);
    return touch(row, { status }, now);
  }

  static getReservation(state, input, user) {
    const row = owned(state.reservations, input.reservationId, user);
    ensure(row.type === "PARKING", "Hãy chọn đơn đặt ô đỗ.");
    return row;
  }

  static cancelReservation(state, input, user, now) {
    const row = ParkingService.getReservation(state, input, user);
    ensure(
      confirmedParking.includes(row.status) && row.isWithinGrace(now),
      "Đơn không còn trong thời gian được hủy.",
    );
    return ParkingService.closeParking(state, row, "CANCELLED", now);
  }

  static checkIn(state, input, user, now) {
    const row = ParkingService.getReservation(state, input, user);
    const slot = getRow(state.slots, row.slotId);
    guardHubOnline(state, row.hubId, now);
    ensure(
      confirmedParking.includes(row.status) &&
        now >= row.start &&
        row.isWithinGrace(now) &&
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
    touch(slot.markOccupied(row.vehicleId), {}, now);
    ParkingService.settleDeposit(state, row, false, now);
    return touch(row.markCheckedIn(now), {}, now);
  }

  static leaveParking(state, input, user, now) {
    const row = ParkingService.getReservation(state, input, user);
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
    touch(slot.markAvailable(), {}, now);
    return ParkingService.closeParking(state, row, "COMPLETED", now);
  }
}

export class ChargingScheduleService {
  static getChargers(state, hubId) {
    return state.ports.filter((port) => port.hubId === hubId && usable(port));
  }

  static confirmSchedule(state, input, user, now) {
    const row = ParkingService.getReservation(state, input, user);
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
    const schedule = new ChargingSchedule({
      id: uid("SCH"),
      reservationId: row.id,
      portId: port.id,
      userId: user.id,
      vehicleId: row.vehicleId,
      hubId: row.hubId,
      start,
      end,
      code: uid("PIN"),
      createdAt: now,
    });
    touch(schedule.markScheduled(), {}, now);
    touch(port, {}, now);
    state.schedules.push(schedule);
    return schedule;
  }

  static cancelSchedule(state, input, user, now) {
    const schedule = owned(state.schedules, input.scheduleId, user);
    ensure(
      scheduled.includes(schedule.status),
      "Lịch này đã thực hiện hoặc không còn hiệu lực.",
    );
    return ChargingScheduleService.closeSchedule(state, schedule, "CANCELLED", now);
  }

  static closeSchedule(state, schedule, status, now) {
    touch(getRow(state.ports, schedule.portId), {}, now);
    return touch(status === "EXPIRED" ? schedule.expire() : schedule.cancel(), {}, now);
  }
}

export function expireStudentHolds(state, now) {
  for (const row of state.reservations) {
    if (row.type === "VEHICLE") {
      if (
        (confirmedParking.includes(row.status) && now >= row.expiresAt) ||
        (["CHECKING_IN", "UNLOCKED"].includes(row.status) &&
          now > row.checkInDeadline)
      ) {
        ReservationService.closeVehicleBooking(state, row, "EXPIRED", now);
      }
    } else if (
      row.type === "PARKING" &&
      confirmedParking.includes(row.status) &&
      now > row.expiresAt
    ) {
      ParkingService.closeParking(state, row, "EXPIRED", now);
    }
  }
  for (const schedule of state.schedules) {
    if (scheduled.includes(schedule.status) && now >= schedule.end)
      ChargingScheduleService.closeSchedule(state, schedule, "EXPIRED", now);
    if (schedule.status === "CHARGING" && now >= schedule.end) {
      const port = getRow(state.ports, schedule.portId);
      if (isHubOnline(state, port.hubId, now) && !port.blocked) {
        ChargingSessionService.stopSession(
          state,
          { scheduleId: schedule.id },
          { id: schedule.userId },
          now,
        );
      }
    }
  }
}

export const { searchHubs, getNearbyHubs } = HubService;
export const { validateBooking } = ReservationService;

const handlers = {
  bookVehicle: ReservationService.confirmReservation,
  cancelBooking: ReservationService.cancelReservation,
  beginPickup: TripService.requestPickup,
  stopChargingSafely: TripService.stopPickupCharging,
  disconnectPickupCharger: TripService.disconnectPickupCharger,
  unlockAck: TripService.unlockAck,
  confirmPickup: TripService.startTrip,
  reportPickup: TripService.reportPickup,
  leaveSlot: TripService.leaveSlot,
  requestReturn: TripService.requestReturnHub,
  lockReturn: TripService.endTrip,
  finishReturn: TripService.finalizeTrip,
  bookParking: ParkingService.confirmReservation,
  cancelParking: ParkingService.cancelReservation,
  checkInParking: ParkingService.checkIn,
  leaveParking: ParkingService.leaveParking,
  bookCharging: ChargingScheduleService.confirmSchedule,
  cancelCharging: ChargingScheduleService.cancelSchedule,
  plugCharger: ChargingSessionService.plugCharger,
  startCharging: ChargingSessionService.startSession,
  stopCharging: ChargingSessionService.stopSession,
  unplugCharger: ChargingSessionService.unplugCharger,
};

/** Invoke inside OperationalStore.transaction so validation and all writes share one draft. */
export function studentCommand(state, action, input = {}, { user, now }) {
  const account = requireStudent(state, user);
  ensure(Object.hasOwn(handlers, action), "Thao tác Sinh viên không hợp lệ.");
  return handlers[action](state, input, account, now);
}
