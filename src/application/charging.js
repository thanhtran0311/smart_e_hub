import { guardHubOnline, hubMetrics, uid } from "../domain/resources.js";
import { ensure, getRow, touch, usable } from "../domain/student-rules.js";
import { CONTROL_COMMAND, CONTROL_RESULT } from "../utils/status.js";
import { deviceResult } from "./device-control.js";

export function energize(state, schedule, now, outcome, request) {
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
  ensure(hasPowerFor(state, port, now), "Hub không đủ công suất cấp điện.");
  const control = deviceResult(state, schedule, port, CONTROL_COMMAND.START_CHARGING, outcome, now, request);
  if (control.result !== CONTROL_RESULT.DONE) return schedule;
  const session = {
    id: uid("CSS"),
    scheduleId: schedule.id,
    portId: port.id,
    hubId: port.hubId,
    userId: schedule.userId,
    vehicleId: schedule.vehicleId,
    start: now,
    status: "CHARGING",
    powerKw: port.powerKw,
    energyKwh: 0,
    lastControlId: control.id,
  };
  touch(session, {}, now);
  state.sessions.push(session);
  touch(port, { status: "CHARGING", relayOn: true, sensorRelayOn: true, sessionId: session.id }, now);
  return touch(schedule, { status: "CHARGING", sessionId: session.id }, now);
}

export function hasPowerFor(state, port, now) {
  const { currentPowerKw, powerLimitKw } = hubMetrics(state, port.hubId, now);
  return currentPowerKw + port.powerKw <= powerLimitKw;
}

export function chargeReading(state, session, now) {
  const kwh =
    session.status === "CHARGING"
      ? Math.max(
          session.energyKwh || 0,
          (Math.max(0, now - session.start) / 3600000) * session.powerKw,
        )
      : session.energyKwh || 0;
  return {
    energyKwh: kwh,
    cost: Math.round(kwh * state.config.params.CHARGING_RATE_VND_KWH),
  };
}

export function deenergize(state, schedule, now, outcome) {
  const port = getRow(state.ports, schedule.portId);
  guardHubOnline(state, port.hubId, now);
  ensure(schedule.status === "CHARGING", "Lịch này không có phiên đang sạc.");
  const session = state.sessions.find(
    (s) => s.scheduleId === schedule.id && s.status === "CHARGING",
  );
  ensure(session && port.sessionId === session.id, "Cần đối soát phiên trước khi dừng.");
  const control = deviceResult(state, schedule, port, CONTROL_COMMAND.STOP_CHARGING_SAFE, outcome, now);
  if (control.result !== CONTROL_RESULT.DONE) {
    touch(session, {
      ...chargeReading(state, session, now),
      lastControlId: control.id,
      faultCode: control.faultCode,
    }, now);
    return schedule;
  }
  touch(session, {
    ...chargeReading(state, session, now),
    status: "STOPPED",
    end: now,
    lastControlId: control.id,
  }, now);
  touch(port, { status: "STOPPED", relayOn: false, sensorRelayOn: false }, now);
  return touch(schedule, { status: "STOPPED" }, now);
}
