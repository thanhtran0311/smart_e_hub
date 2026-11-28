import { guardHubOnline, isHubOnline, slotAvailable, uid } from "../domain/resources.js";
import { recordIncident } from "../domain/incidents.js";
import { appendNotification } from "../domain/notifications.js";
import { TelemetryService } from "./telemetry.js";
import { HubService } from "./hubs.js";
import { VehicleService } from "./vehicle.js";
import { ChargingSchedule, ParkingReservation, Reservation, Trip } from "../domain/entities.js";
import {
  ACTIVE_PARKING as activeParking, CONFIRMED_PARKING as confirmedParking,
  SCHEDULED_CHARGING as scheduled,
} from "../utils/status.js";
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
export { HubService, VehicleService };

const minute = 60000;

function requireStudent(state, user) {
  const account = state.users.find((row) => row.id === user?.id);
  ensure(
    state.userId === user?.id && account?.hasPermission("student"),
    "Chức năng này dành cho tài khoản Sinh viên.",
  );
  return account;
}

export class ReservationService {
  static booking(state, input, user) {
    const row = owned(state.reservations, input.reservationId, user);
    ensure(row.type === "VEHICLE", "Đơn không phải đơn đặt xe dùng chung.");
    return row;
  }

  static validateVehicleBooking(state, input, user, now) {
    const vehicle = VehicleService.getVehicleSnapshot(state, input.vehicleId);
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
    ensure(!ReservationService.getActiveReservation(state, user.id), "Bạn đang có một đơn giữ xe.");
    ensure(
      parkedVehicleReady(state, vehicle, now),
      "Xe chưa sẵn sàng, không đủ pin hoặc đã có người giữ.",
    );
    return vehicle;
  }

  static getActiveReservation(state, studentId) {
    return state.reservations.find((row) => row.type === "VEHICLE" && row.belongsTo(studentId) &&
      [...confirmedParking, "CHECKING_IN", "UNLOCKED", "AFFECTED"].includes(row.status)) ?? null;
  }

  static validatePickup(state, input, user, now) {
    const reservation = ReservationService.booking(state, input, user);
    VehicleService.validateVehicleAtHub(state, reservation, now);
    ensure(confirmedParking.includes(reservation.status) && reservation.isActive(now),
      "Đơn đã hết hạn hoặc đang được xử lý.");
    ensure(input.code === reservation.vehicleId, "Mã xe chưa khớp với đơn.");
    return reservation;
  }

  static consumeReservation(reservation, tripId, now) {
    return touch(reservation.consume(tripId), {}, now);
  }

  static reconcileVehicleHold(state, reservation, now, vehicle = VehicleService.getVehicleSnapshot(state, reservation.vehicleId)) {
    releaseVehicleHold(state, vehicle, reservation, now);
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

  static closeVehicleBooking(state, row, status, now, reason) {
    ReservationService.reconcileVehicleHold(state, row, now);
    return touch(status === "EXPIRED" ? row.expire() : row.cancel(reason), {}, now);
  }

  static cancelReservation(state, input, user, now) {
    const row = ReservationService.booking(state, input, user);
    ensure(
      confirmedParking.includes(row.status),
      "Chỉ có thể hủy đơn đang giữ xe và chưa bắt đầu nhận.",
    );
    const reason = String(input.reason ?? "").trim().slice(0, 240) || "Sinh viên hủy giữ xe.";
    return ReservationService.closeVehicleBooking(state, row, "CANCELLED", now, reason);
  }

  static expireReservation(state, row, now) {
    ReservationService.closeVehicleBooking(state, row, "EXPIRED", now);
    appendNotification(state, {
      userId: row.userId, relatedId: row.id, title: "Đơn giữ xe đã hết hạn",
      message: "Thời hạn nhận xe " + row.vehicleId + " đã kết thúc.",
    }, now);
    return row;
  }
}

export class TripService {
  static requestPickup(state, input, user, now) {
    const row = ReservationService.validatePickup(state, input, user, now);
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
      row.status === "CHECKING_IN" && row.isActive(now),
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
    const control = VehicleService.unlockVehicle(state, row, vehicle, input.outcome, now);
    if (!VehicleService.verifyUnlock(control)) return row;
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
      row.status === "UNLOCKED" && row.isActive(now) && vehicle.locked === false,
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
    ReservationService.consumeReservation(row, trip.id, now);
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
    ReservationService.closeVehicleBooking(state, row, "CANCELLED", now, reason);
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
      VehicleService.getVehicleSnapshot(state, trip.vehicleId),
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
    const slotId = trip.returnSlotId
      ? TripService.changeReturnPosition(state, trip, hubId, selected, now)
      : TripService.holdReturnPosition(state, trip, hubId, selected, now);
    return touch(trip.requestEnd(hubId, slotId, now), {}, now);
  }

  static holdReturnPosition(state, trip, hubId, selected, now) {
    const slot = state.slots.find(
      (s) =>
        s.hubId === hubId &&
        s.type === "SHARED" &&
        (!selected || s === selected) &&
        s.id !== trip.returnSlotId &&
        slotAvailable(state, s),
    );
    ensure(slot, "Hub đích hết chốt nhận xe. Hãy chọn Hub khác.");
    touch(slot.markReserved(trip.id), {}, now);
    return slot.id;
  }

  static changeReturnPosition(state, trip, hubId, selected, now) {
    const previous = state.slots.find((s) => s.id === trip.returnSlotId);
    ensure(!previous?.vehicleId && !previous?.sensorOccupied, "Chốt cũ còn ghi nhận xe. Cần đối soát tại chỗ.");
    const slotId = TripService.holdReturnPosition(state, trip, hubId, selected, now);
    if (previous?.holdId === trip.id) touch(previous, { holdId: null }, now);
    return slotId;
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
    ensure((input.dockEvidence ?? "occupied") === "occupied", "Cảm biến chưa xác nhận xe đã vào chốt trả.");
    const vehicle = VehicleService.getVehicleSnapshot(state, trip.vehicleId);
    const control = VehicleService.lockVehicle(state, trip, vehicle, input.outcome, now);
    if (!VehicleService.verifyLock(control)) return trip;
    touch(vehicle, { locked: true }, now);
    // Persist physical evidence before the separate business commit; retrying settlement is safe.
    const observation = TelemetryService.recordParkingEvidence(state, slot, trip, now);
    const parkingEvidence = { eventId: observation.eventId, slotId: slot.id, observedAt: now };
    trip.attachParkingEvidence(uid("ACK"), now, parkingEvidence);
    return touch(trip.markPendingVerification("Đã xác nhận chốt và khóa xe; chờ hoàn tất giao dịch."), {}, now);
  }

  static verifyParkingEvidence(state, trip, slot, vehicle) {
    if (trip.status !== "PENDING_VERIFICATION" || !trip.evidenceId || slot.holdId !== trip.id ||
        (slot.vehicleId && slot.vehicleId !== vehicle.id) || vehicle.locked !== true) return false;
    const evidence = trip.parkingEvidence;
    // Schema 1 trips were already checked before the lock acknowledgement was saved.
    if (!evidence) return true;
    const event = state.telemetry.find((row) => row.eventId === evidence.eventId && row.source === "RETURN_DOCK");
    return Boolean(event && event.deviceId === slot.id && event.timestamp === evidence.observedAt &&
      event.payload.occupied && event.payload.tripId === trip.id && event.payload.vehicleId === vehicle.id &&
      !(slot.lastTelemetryAt > event.timestamp && slot.sensorOccupied === false));
  }

  static reportTripIssue(state, trip, vehicle, description, now) {
    trip.reportIssue(description);
    return recordIncident(state, vehicle.id, description, now);
  }

  static getTripSummary(state, tripId, user, now) {
    const trip = owned(state.trips, tripId, user);
    return { ...trip, durationMinutes: trip.durationMinutes(now) };
  }

  static reconcilePendingTrip(state, tripId, user) {
    const trip = owned(state.trips, tripId, user);
    const slot = getRow(state.slots, trip.returnSlotId);
    const vehicle = VehicleService.getVehicleSnapshot(state, trip.vehicleId);
    ensure(
      TripService.verifyParkingEvidence(state, trip, slot, vehicle),
      "Cần đối soát bằng chứng xe đã vào đúng ô và khóa an toàn.",
    );
    return { trip, slot, vehicle };
  }

  static finalizeTrip(state, input, user, now) {
    const { trip, slot, vehicle } = TripService.reconcilePendingTrip(state, input.tripId, user);
    const description = String(input.issueDescription ?? "").trim().slice(0, 240);
    const hasIssue = Boolean(input.issue || description);
    VehicleService.classifyReturnedVehicle(state, vehicle, slot, hasIssue, now);
    touch(slot.markOccupied(vehicle.id), { holdId: null }, now);
    if (hasIssue)
      TripService.reportTripIssue(state, trip, vehicle, description || "Sinh viên báo xe cần kiểm tra kỹ thuật khi trả.", now);
    return touch(trip.confirmEnded(now), {}, now);
  }
}

export class ParkingService {
  static getVehicles(state, studentId) {
    return state.privateVehicles.filter((vehicle) => vehicle.belongsTo(studentId));
  }

  static getHubs(state) {
    return state.hubs;
  }

  static checkAvailability(state, input, user, now) {
    requireStudent(state, user);
    const slot = getRow(state.slots, input.slotId);
    const vehicle = getRow(state.privateVehicles, input.vehicleId);
    const { start, end } = windowFor(input, now);
    checkVersion(slot, input.expectedVersion);
    ensure(
      vehicle.belongsTo(user.id),
      "Xe cá nhân này không thuộc tài khoản hiện tại.",
    );
    parkingWindowAvailable(state, slot, vehicle.id, start, end, now);
    return { slot, vehicle, start, end };
  }

  static confirmReservation(state, input, user, now) {
    const { slot, vehicle, start, end } = ParkingService.checkAvailability(state, input, user, now);
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
    ParkingService.settleDeposit(state, row, status === "EXPIRED" && row.checkInBlockedAt == null, now);
    ParkingService.reconcileSlot(getRow(state.slots, row.slotId), now);
    ChargingScheduleService.cancelScheduleByReservationExpiry(state, row.id, now);
    if (status === "EXPIRED") return touch(row.expire(), {}, now);
    if (status === "CANCELLED") return touch(row.cancel(), {}, now);
    return touch(row, { status }, now);
  }

  static expireOverdueReservations(state, now) {
    const overdue = state.reservations.filter((row) =>
      row.type === "PARKING" && confirmedParking.includes(row.status) && now > row.expiresAt);
    for (const row of overdue) ParkingService.closeParking(state, row, "EXPIRED", now);
    return overdue;
  }

  static reconcileSlot(slot, now) {
    if (slot.sensorOccupied != null && slot.sensorOccupied !== Boolean(slot.vehicleId) &&
        slot.inspectionStatus !== "FAULTED") slot.markPendingCheck();
    touch(slot, {}, now);
    return slot.inspectionStatus || (slot.sensorOffline ? "PENDING_CHECK" : slot.status);
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
    ensure(
      confirmedParking.includes(row.status) &&
        now >= row.start &&
        row.isWithinGrace(now) &&
        now < row.end,
      "Đơn chưa đến giờ, đã quá hạn hoặc đã check-in.",
    );
    ensure(!state.slots.some((other) => other.vehicleId === row.vehicleId), "Xe không thể check-in vì xe vẫn ở một ô khác.");
    if (!isHubOnline(state, row.hubId, now) || !slotAvailable(state, slot)) {
      return touch(row, {
        checkInBlockedAt: row.checkInBlockedAt ?? now,
        operationError: "Đã ghi nhận bạn đến đúng hạn. Hub chưa thể bàn giao ô. Bạn có thể thử lại và sẽ được hoàn cọc nếu đơn hết hạn.",
      }, now);
    }
    touch(slot.markOccupied(row.vehicleId), {}, now);
    ParkingService.settleDeposit(state, row, false, now);
    return touch(row.markCheckedIn(now), { operationError: null }, now);
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
  static getActiveBookings(state, studentId, now) {
    return state.reservations.filter((row) => row.type === "PARKING" && row.belongsTo(studentId) &&
      row.end > now && activeParking.includes(row.status));
  }

  static getChargers(state, hubId, connector) {
    return state.ports.filter((port) => port.hubId === hubId && usable(port) && (!connector || port.connector === connector));
  }

  static checkAvailability(state, input, user, now) {
    requireStudent(state, user);
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
    return { row, port, start, end };
  }

  static confirmSchedule(state, input, user, now) {
    const { row, port, start, end } = ChargingScheduleService.checkAvailability(state, input, user, now);
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
    state.schedules.push(schedule);
    ChargingScheduleService.reconcilePort(state, port, now);
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
    touch(status === "EXPIRED" ? schedule.expire() : schedule.cancel(), {}, now);
    ChargingScheduleService.reconcilePort(state, getRow(state.ports, schedule.portId), now);
    return schedule;
  }

  static cancelScheduleByReservationExpiry(state, reservationId, now) {
    for (const schedule of state.schedules)
      if (schedule.reservationId === reservationId && scheduled.includes(schedule.status))
        ChargingScheduleService.closeSchedule(state, schedule, "CANCELLED", now);
  }

  static reconcilePort(state, port, now, bumpVersion = true) {
    const before = port.inspectionStatus;
    const mismatch = (port.sensorPlugged != null && port.sensorPlugged !== Boolean(port.plugged)) ||
      (port.sensorRelayOn != null && port.sensorRelayOn !== Boolean(port.relayOn));
    if (mismatch && port.inspectionStatus !== "FAULTED") port.markPendingCheck();
    const reservation = port.status === "AVAILABLE" && usable(port) && state.schedules.find((row) =>
      row.portId === port.id && scheduled.includes(row.status) && row.start <= now && now < row.end);
    const reservationId = reservation?.id ?? null;
    if (bumpVersion || reservationId !== (port.reservedScheduleId ?? null) || before !== port.inspectionStatus)
      touch(port.markReserved(reservationId), {}, now);
    return port.inspectionStatus || (port.sensorOffline ? "PENDING_CHECK" : port.reservedScheduleId ? "RESERVED" : port.status);
  }
}

export function expireStudentHolds(state, now) {
  for (const row of state.reservations) {
    if (row.type === "VEHICLE" && (
        (confirmedParking.includes(row.status) && now >= row.expiresAt) ||
        (["CHECKING_IN", "UNLOCKED"].includes(row.status) &&
          now > row.checkInDeadline)
    )) {
      ReservationService.expireReservation(state, row, now);
    }
  }
  ParkingService.expireOverdueReservations(state, now);
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
  for (const port of state.ports) ChargingScheduleService.reconcilePort(state, port, now, false);
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
