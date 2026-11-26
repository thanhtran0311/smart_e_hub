import { guardHubOnline } from "../domain/resources.js";
import { ensure, getRow, parkedVehicleReady, touch, usable } from "../domain/student-rules.js";
import { CONTROL_COMMAND, CONTROL_RESULT } from "../utils/status.js";
import { ChargingSessionService } from "./charging.js";
import { deviceResult } from "./device-control.js";

export class VehicleService {
  static findAvailableVehicles(state, hubId, { type = "", minSoc = 0 } = {}, now = Date.now()) {
    return state.vehicles.filter((vehicle) =>
      vehicle.hubId === hubId && (!type || vehicle.type === type) &&
      vehicle.soc >= minSoc && parkedVehicleReady(state, vehicle, now),
    );
  }

  static getVehicleSnapshot(state, vehicleId) {
    return getRow(state.vehicles, vehicleId);
  }

  static validateVehicleAtHub(state, row, now) {
    const vehicle = VehicleService.getVehicleSnapshot(state, row.vehicleId);
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

  static unlockVehicle(state, reservation, vehicle, outcome, now) {
    return deviceResult(state, reservation, vehicle, CONTROL_COMMAND.UNLOCK, outcome, now);
  }

  static verifyUnlock(control) {
    return control.command === CONTROL_COMMAND.UNLOCK && control.result === CONTROL_RESULT.DONE &&
      control.resolvedAt <= control.deadlineAt;
  }

  static lockVehicle(state, trip, vehicle, outcome, now) {
    return deviceResult(state, trip, vehicle, CONTROL_COMMAND.LOCK, outcome, now);
  }

  static verifyLock(control) {
    return control.command === CONTROL_COMMAND.LOCK && control.result === CONTROL_RESULT.DONE &&
      control.resolvedAt <= control.deadlineAt;
  }

  static classifyReturnedVehicle(state, vehicle, slot, issueReported, now) {
    return touch(
      vehicle.classifyAfterReturn(issueReported, state.config.params.MIN_SOC_BOOK_PCT),
      { hubId: slot.hubId, slotId: slot.id, tripId: null },
      now,
    );
  }
}
