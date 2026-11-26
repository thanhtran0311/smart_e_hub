import { CONFIRMED_PARKING } from "../utils/status.js";

// Own properties retain the existing JSON layout. Behaviour lives on prototypes.
export class User {
  constructor(data) { Object.assign(this, data); }

  getUserId() { return this.id; }
  getRole() { return this.roles; }
  hasPermission(role) { return this.getRole().includes(role); }
}

export class Hub {
  constructor(data) { Object.assign(this, data); }

  isOffline(telemetryTimeoutSeconds, currentTime) {
    return Boolean(this.offline) || !Number.isFinite(this.lastTelemetryAt) ||
      !(currentTime - this.lastTelemetryAt <= telemetryTimeoutSeconds * 1000);
  }

  updateTelemetryHeartbeat(timestamp) {
    this.lastTelemetryAt = Math.max(this.lastTelemetryAt, timestamp);
  }

  calculateLoadLevel({ online, currentPowerKw, powerLimitKw, nearFull, needsRebalance }) {
    if (!online) return "OFFLINE";
    if (currentPowerKw > powerLimitKw) return "OVERLOAD";
    return nearFull || needsRebalance ? "WARNING" : "NORMAL";
  }

  getAvailableVehicleCount(vehicles, slots, minSoc) {
    return vehicles.filter((vehicle) =>
      vehicle.hubId === this.id && vehicle.status === "AVAILABLE" &&
      !vehicle.blocked && !vehicle.sensorOffline && vehicle.soc >= minSoc &&
      slots.some((slot) => slot.id === vehicle.slotId && slot.status === "OCCUPIED" &&
        slot.vehicleId === vehicle.id && !slot.blocked && !slot.sensorOffline && slot.sensorOccupied !== false),
    ).length;
  }

  getEmptySpaceCount(slots) {
    return slots.filter((slot) => ParkingSpace.prototype.canReleaseToAvailable.call(slot)).length;
  }

  reserveInboundSpaces(slots, count, holdId) {
    const available = slots.filter((slot) => slot.hubId === this.id && slot.canReleaseToAvailable());
    if (!Number.isInteger(count) || count < 0 || available.length < count)
      throw new Error("Sức chứa đích đã thay đổi hoặc không đủ. Hãy xem lại.");
    return available.slice(0, count).map((slot) => slot.markReserved(holdId));
  }
}

export class ParkingSpace {
  constructor(data) { Object.assign(this, data); }

  canReleaseToAvailable() {
    return !this.vehicleId && !this.holdId && !this.blocked &&
      !this.sensorOffline && !this.sensorOccupied && this.status === "AVAILABLE";
  }

  markReserved(holdId) {
    this.holdId = holdId;
    return this;
  }

  markOccupied(vehicleId) {
    return Object.assign(this, { status: "OCCUPIED", vehicleId, sensorOccupied: true });
  }

  markAvailable() {
    return Object.assign(this, {
      status: this.blocked ? "OUT_OF_SERVICE" : "AVAILABLE",
      vehicleId: null, sensorOccupied: false,
    });
  }

  updateSensorStatus(occupied) {
    this.sensorOccupied = occupied;
  }

  markPendingCheck() { return Object.assign(this, { blocked: true, inspectionStatus: "PENDING_CHECK" }); }
  markFaulted() { return Object.assign(this, { blocked: true, inspectionStatus: "FAULTED" }); }
}

export class Vehicle {
  constructor(data) { Object.assign(this, data); }

  isAt(hubId, slotId) { return this.hubId === hubId && this.slotId === slotId; }
}

export class SharedVehicle extends Vehicle {
  reserve(reservationId) {
    return Object.assign(this, { status: "RESERVED", reservationId });
  }

  markInUse(tripId) {
    return Object.assign(this, { status: "IN_USE", reservationId: null, tripId });
  }

  markRelocating() {
    this.status = "RELOCATING";
    return this;
  }

  classifyAfterReturn(hasIssue, minSoc) {
    this.status = hasIssue || this.blocked || !Number.isFinite(this.soc) ? "PENDING_CHECK"
      : this.soc < minSoc ? "WAITING_CHARGE" : "AVAILABLE";
    return this;
  }
}

export class PrivateVehicle extends Vehicle {
  belongsTo(studentId) { return (this.userId || this.ownerId) === studentId; }
}

export class Reservation {
  constructor(data) { Object.assign(this, data); }

  isActive(at) {
    if (this.status === "CHECKING_IN" || this.status === "UNLOCKED") return at <= this.checkInDeadline;
    return CONFIRMED_PARKING.includes(this.status) && at < this.expiresAt;
  }
  belongsTo(studentId) { return this.userId === studentId; }
  matches(vehicleId, pickupHubId) { return this.vehicleId === vehicleId && this.hubId === pickupHubId; }

  confirm() { this.status = "CONFIRMED"; return this; }
  cancel(reason = "Sinh viên hủy giữ xe.") { return Object.assign(this, { status: "CANCELLED", cancelReason: reason }); }
  expire() { this.status = "EXPIRED"; return this; }
  consume(tripId) { return Object.assign(this, { status: "CONSUMED", tripId }); }
}

export class Trip {
  constructor(data) { Object.assign(this, data); }

  static start(data, at) {
    return new Trip({ ...data, departed: false, start: at, status: "ACTIVE" });
  }

  isActive() { return this.status !== "COMPLETED"; }

  requestEnd(returnHubId, returnSlotId, at) {
    return Object.assign(this, { status: "RETURN_PENDING", returnHubId, returnSlotId, returnRequestedAt: at, operationError: null });
  }

  attachParkingEvidence(evidenceId, lockedAt, parkingEvidence) {
    return Object.assign(this, { evidenceId, lockedAt, parkingEvidence });
  }

  markPendingVerification(reason) {
    return Object.assign(this, { status: "PENDING_VERIFICATION", verificationReason: reason });
  }

  reportIssue(description) { this.issueDescription = description; }

  durationMinutes(at = Date.now()) {
    return Math.max(0, Math.floor(((this.end ?? at) - this.start) / 60_000));
  }

  confirmEnded(at) { return Object.assign(this, { status: "COMPLETED", end: at }); }
}

export class ParkingReservation {
  constructor(data) { Object.assign(this, data); }

  belongsTo(studentId) { return this.userId === studentId; }
  isWithinGrace(now) { return now <= this.expiresAt; }

  markCheckedIn(checkedInAt) { return Object.assign(this, { status: "CHECKED_IN", checkedInAt }); }
  expire() { this.status = "EXPIRED"; return this; }
  cancel() { this.status = "CANCELLED"; return this; }
}

export class ChargingSchedule {
  constructor(data) { Object.assign(this, data); }

  markScheduled() { this.status = "SCHEDULED"; return this; }
  markCharging(sessionId) { return Object.assign(this, { status: "CHARGING", sessionId }); }
  complete() { this.status = "COMPLETED"; return this; }
  cancel() { this.status = "CANCELLED"; return this; }
  expire() { this.status = "EXPIRED"; return this; }
}

export class ChargingPort {
  constructor(data) { Object.assign(this, data); }

  markReserved(scheduleId) { this.reservedScheduleId = scheduleId; return this; }
  markPendingCheck() { return Object.assign(this, { blocked: true, inspectionStatus: "PENDING_CHECK" }); }
  markFaulted() { return Object.assign(this, { blocked: true, inspectionStatus: "FAULTED" }); }

  markChargedFull() {
    if (!this.relayOn && !this.sensorRelayOn && this.plugged) this.status = "CHARGED_FULL";
    return this;
  }

  markOccupiedWaiting(schedule) {
    return Object.assign(this, {
      status: "OCCUPIED_WAITING", plugged: true, sensorPlugged: true, relayOn: false,
      scheduleId: schedule.id, vehicleId: schedule.vehicleId, reservedScheduleId: null,
    });
  }

  markCharging(sessionId) {
    return Object.assign(this, { status: "CHARGING", relayOn: true, sensorRelayOn: true, sessionId });
  }

  markAvailable() {
    return Object.assign(this, {
      status: this.blocked ? "OUT_OF_SERVICE" : "AVAILABLE", sessionId: null, scheduleId: null,
      plugged: false, sensorPlugged: false, sensorRelayOn: false, vehicleId: null,
    });
  }
}

export class ChargingSession {
  constructor(data) { Object.assign(this, data); }

  markCharging(startedAt) { return Object.assign(this, { status: "CHARGING", start: startedAt }); }

  updateReading(reading) { return Object.assign(this, reading); }

  markFaulted(faultCode, electrical = false) {
    this.faultCode = faultCode;
    if (electrical) Object.assign(this, { electricalFault: true, electricalFaultCode: faultCode });
    return this;
  }

  complete() { this.status = this.electricalFault ? "FAILED" : "COMPLETED"; return this; }
}

export class DispatchOrder {
  constructor(data) { Object.assign(this, data); }

  confirmAssignment(at) { Object.assign(this, { assignmentStatus: "SENT", assignedAt: at }); }
  cancel(at) { Object.assign(this, { status: "CANCELLED", closedAt: at }); }

  complete(at) {
    const received = this.items.filter((item) => item.status === "COMPLETED").length;
    this.status = received === this.items.length ? "COMPLETED" : received ? "PARTIALLY_COMPLETED" : "FAILED";
    this.closedAt = at;
  }
}

export class ChargingPlan {
  constructor(data) { Object.assign(this, data); }
}

export class ChargingCommand {
  constructor(data) { Object.assign(this, data); }
}

export class Sensor {
  constructor(data) { Object.assign(this, data); }

  markOnline(timestamp) { Object.assign(this, { lastSeenAt: timestamp, online: true }); }
  markOffline() { this.online = false; }
  isTimedOut(now, timeoutMs) { return !(now - this.lastSeenAt <= timeoutMs); }
}

export class TelemetryEvent {
  constructor(data) { Object.assign(this, data); }

  isWellFormed() {
    const { type, payload } = this;
    switch (type) {
      case "HUB":
        return payload.powerKw === undefined || (Number.isFinite(payload.powerKw) && payload.powerKw >= 0);
      case "VEHICLE":
        return Number.isFinite(payload.soc) && payload.soc >= 0 && payload.soc <= 100;
      case "PARKING_SPACE":
        return payload.occupied !== undefined;
      case "CHARGING_PORT":
        return payload.plugged !== undefined && payload.relayOn !== undefined && (!payload.relayOn || payload.plugged) &&
          ["batteryPct", "powerKw", "energyKwh"].every((key) => payload[key] === undefined ||
            (Number.isFinite(payload[key]) && payload[key] >= 0 && (key !== "batteryPct" || payload[key] <= 100)));
      default:
        return false;
    }
  }

  isNewerThan(timestamp) { return this.timestamp > timestamp; }
}

export class Incident {
  constructor(data) { Object.assign(this, data); }

  markPendingCheck() { this.status = "PENDING_CHECK"; }
  deferIsolation() { this.markPendingCheck(); }
  markIsolated(priorStatus) { Object.assign(this, { status: "ISOLATED", priorStatus }); }
  resolve() { this.status = "RESOLVED"; }
  cancel(reason, at) { return Object.assign(this, { status: "CANCELLED", cancelReason: reason, cancelledAt: at }); }
}

export class WorkOrder {
  constructor(data) { Object.assign(this, data); }

  markSent() { this.status = "SENT"; }
  markPendingResend() { this.status = "PENDING_RESEND"; }
  markInProgress(at) { Object.assign(this, { status: "IN_PROGRESS", startedAt: at }); }
  complete() { this.status = "DONE"; }
}

export class Recommendation {
  constructor(data) { Object.assign(this, data); }

  updateStatus(newStatus) { this.status = newStatus; }
}

export class SimulationScenario {
  constructor(data) { Object.assign(this, data); }
}

export class Notification {
  constructor(data) { Object.assign(this, data); }
}

export class AuditLog {
  constructor(data) { Object.assign(this, data); }
}
