import { guardHubOnline, hubMetrics, uid } from "../domain/resources.js";
import { ensure, getRow, owned, touch, usable } from "../domain/student-rules.js";
import { CONTROL_COMMAND, CONTROL_RESULT, SCHEDULED_CHARGING as scheduled } from "../utils/status.js";
import { ChargingSession } from "../domain/entities.js";
import { recordIncident } from "../domain/incidents.js";
import { appendNotification } from "../domain/notifications.js";
import { deviceResult } from "./device-control.js";

const connectedStatuses = ["PLUGGED", "CHARGING", "STOPPED"];

export class ChargingSessionService {
  static chargingConnection(state, vehicleId) {
    const session = state.sessions.find((row) =>
      row.vehicleId === vehicleId && ["CHARGING", "STOPPED"].includes(row.status));
    const schedule = state.schedules.find((row) => row.id === session?.scheduleId) ??
      state.schedules.find((row) => row.vehicleId === vehicleId && connectedStatuses.includes(row.status));
    const port = state.ports.find((row) => row.id === (session?.portId || schedule?.portId)) ??
      state.ports.find((row) => row.vehicleId === vehicleId &&
        (row.plugged || row.sensorPlugged || row.relayOn || row.sensorRelayOn ||
          ["OCCUPIED_WAITING", "CHARGING", "STOPPED", "CHARGED_FULL"].includes(row.status)));
    return session || schedule || port ? { schedule, port } : null;
  }

  static energize(state, schedule, now, outcome, request) {
    const port = getRow(state.ports, schedule.portId);
    guardHubOnline(state, schedule.hubId, now);
    ensure(
      schedule.status === "PLUGGED" &&
        schedule.start <= now &&
        now < schedule.end &&
        port.scheduleId === schedule.id &&
        usable(port) &&
        port.plugged &&
        port.sensorPlugged !== false &&
        !port.relayOn && !port.sensorRelayOn,
      "Chưa đủ điều kiện an toàn để đóng relay.",
    );
    ensure(ChargingSessionService.hasPowerFor(state, port, now), "Hub không đủ công suất cấp điện.");
    const control = ChargingSessionService.requestControl(state, schedule, port, CONTROL_COMMAND.START_CHARGING, outcome, now, request);
    if (control.result !== CONTROL_RESULT.DONE) {
      ChargingSessionService.handleControlFailure(state, port, control, now);
      return schedule;
    }
    const session = new ChargingSession({
      id: uid("CSS"),
      scheduleId: schedule.id,
      portId: port.id,
      hubId: port.hubId,
      userId: schedule.userId,
      vehicleId: schedule.vehicleId,
      powerKw: port.powerKw,
      energyKwh: 0,
      lastControlId: control.id,
    });
    touch(session.markCharging(now), {}, now);
    state.sessions.push(session);
    touch(port.markCharging(session.id), {}, now);
    return touch(schedule.markCharging(session.id), {}, now);
  }

  static hasPowerFor(state, port, now) {
    const { currentPowerKw, powerLimitKw } = hubMetrics(state, port.hubId, now);
    return currentPowerKw + port.powerKw <= powerLimitKw;
  }

  static requestControl(state, schedule, port, command, outcome, now, request) {
    return deviceResult(state, schedule, port, command, outcome, now, request);
  }

  static chargeReading(state, session, now) {
    const estimated = Number.isFinite(session.meterReadingAt)
      ? session.meterEnergyKwh + (Math.max(0, now - session.meterReadingAt) / 3_600_000) *
        (session.measuredPowerKw ?? session.powerKw)
      : (Math.max(0, now - session.start) / 3_600_000) * session.powerKw;
    const kwh =
      session.status === "CHARGING"
        ? Math.max(session.energyKwh || 0, estimated)
        : session.energyKwh || 0;
    return {
      energyKwh: kwh,
      cost: Math.round(kwh * state.config.params.CHARGING_RATE_VND_KWH),
    };
  }

  static updateSessionReading(state, sessionId, reading, sampledAt, now) {
    const session = getRow(state.sessions, sessionId);
    ensure(session.status === "CHARGING", "Phiên sạc không còn cấp điện.");
    ensure(Number.isFinite(sampledAt) && sampledAt <= now && sampledAt >= (session.lastReadingAt ?? session.start),
      "Mốc thời gian số đo sạc không hợp lệ.");
    const { batteryPct, powerKw, energyKwh } = reading;
    ensure((batteryPct === undefined || (Number.isFinite(batteryPct) && batteryPct >= 0 && batteryPct <= 100)) &&
      (powerKw === undefined || (Number.isFinite(powerKw) && powerKw >= 0)) &&
      (energyKwh === undefined || (Number.isFinite(energyKwh) && energyKwh >= 0)), "Số đo sạc không hợp lệ.");
    const update = { lastReadingAt: sampledAt };
    if (batteryPct !== undefined) update.batteryPct = batteryPct;
    if (powerKw !== undefined) update.measuredPowerKw = powerKw;
    if (energyKwh !== undefined) {
      update.meterEnergyKwh = Math.max(session.meterEnergyKwh ?? 0, energyKwh);
      update.meterReadingAt = sampledAt;
      update.energyKwh = update.meterEnergyKwh;
    }
    touch(session.updateReading(update), {}, now);
    const port = getRow(state.ports, session.portId);
    if (batteryPct === 100 && usable(port) && !session.electricalFault) {
      const schedule = getRow(state.schedules, session.scheduleId);
      ChargingSessionService.deenergize(state, schedule, now, "ok");
      if (schedule.status === "STOPPED") touch(port.markChargedFull(), {}, now);
    }
    return session;
  }

  static handleControlFailure(state, port, control, now, session) {
    if (session) touch(session.markFaulted(control.faultCode), { lastControlId: control.id }, now);
    appendNotification(state, {
      target: "operator", type: "ALERT", relatedId: control.id,
      title: "Cần đối soát lệnh sạc", message: port.id + " · " + control.message,
    }, now);
  }

  static handleElectricalFault(state, port, faultCode, now) {
    const incident = recordIncident(state, port.id, faultCode, now);
    const session = state.sessions.find((item) => item.id === port.sessionId && item.status === "CHARGING");
    if (!session) return incident;
    touch(session.markFaulted(faultCode, true).updateReading(ChargingSessionService.chargeReading(state, session, now)), {}, now);
    if (session.userId) appendNotification(state, {
      userId: session.userId, type: "ALERT", relatedId: incident.id,
      title: "Phiên sạc báo lỗi", message: port.id + " · Chờ xác nhận ngắt điện an toàn trước khi rút cáp.",
    }, now);
    return incident;
  }

  static deenergize(state, schedule, now, outcome) {
    const port = getRow(state.ports, schedule.portId);
    guardHubOnline(state, port.hubId, now);
    ensure(schedule.status === "CHARGING", "Lịch này không có phiên đang sạc.");
    const session = state.sessions.find(
      (s) => s.scheduleId === schedule.id && s.status === "CHARGING",
    );
    ensure(session && port.sessionId === session.id && session.vehicleId === schedule.vehicleId &&
      port.vehicleId === schedule.vehicleId && port.scheduleId === schedule.id,
    "Cần đối soát phiên trước khi dừng.");
    const control = ChargingSessionService.requestControl(state, schedule, port, CONTROL_COMMAND.STOP_CHARGING_SAFE, outcome, now);
    session.updateReading(ChargingSessionService.chargeReading(state, session, now));
    if (control.result !== CONTROL_RESULT.DONE) {
      ChargingSessionService.handleControlFailure(state, port, control, now, session);
      return schedule;
    }
    touch(session, {
      status: "STOPPED",
      end: now,
      lastControlId: control.id,
    }, now);
    touch(port, { status: "STOPPED", relayOn: false, sensorRelayOn: false }, now);
    return touch(schedule, { status: "STOPPED" }, now);
  }

  static disconnectCharger(state, schedule, now) {
    const port = getRow(state.ports, schedule.portId);
    const session = state.sessions.find((row) => row.id === port.sessionId);
    ensure(
      ["STOPPED", "PLUGGED"].includes(schedule.status) &&
        !port.relayOn && !port.sensorRelayOn &&
        (!port.scheduleId || port.scheduleId === schedule.id) &&
        (schedule.status === "STOPPED"
          ? session?.scheduleId === schedule.id && session.status === "STOPPED"
          : !port.sessionId),
      "Cần xác nhận ngắt điện trước khi rút đầu cắm.",
    );
    if (session) touch(session.complete(), {}, now);
    touch(port.markAvailable(), {}, now);
    return touch(session ? schedule.complete() : schedule.cancel(), {}, now);
  }

  static plugCharger(state, input, user, now) {
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
    touch(port.markOccupiedWaiting(schedule), {}, now);
    return touch(schedule, { status: "PLUGGED" }, now);
  }

  static startSession(state, input, user, now) {
    const schedule = owned(state.schedules, input.scheduleId, user);
    return ChargingSessionService.energize(state, schedule, now, input.outcome);
  }

  static stopSession(state, input, user, now) {
    const schedule = owned(state.schedules, input.scheduleId, user);
    return ChargingSessionService.deenergize(state, schedule, now, input.outcome);
  }

  static unplugCharger(state, input, user, now) {
    const schedule = owned(state.schedules, input.scheduleId, user);
    return ChargingSessionService.disconnectCharger(state, schedule, now);
  }
}

export const { chargingConnection, energize, hasPowerFor, chargeReading, deenergize, disconnectCharger } = ChargingSessionService;
