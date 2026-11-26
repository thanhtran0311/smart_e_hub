import { Sensor, TelemetryEvent } from "../domain/entities.js";
import { recordIncident } from "../domain/incidents.js";
import { appendNotification } from "../domain/notifications.js";
import { lookup, uid } from "../domain/resources.js";
import { touch } from "../domain/student-rules.js";
import { NOTIFICATION_TYPE, ROLE, TELEMETRY_RESULT as RESULT } from "../utils/status.js";
import { ChargingSessionService } from "./charging.js";
import { HubService } from "./hubs.js";
import { MonitoringService } from "./monitoring.js";

function bool(value) {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return undefined;
}

function sensorPayload(type, input, resource) {
  switch (type) {
    case "HUB": {
      const powerKw = input.powerKw === undefined || input.powerKw === "" ? undefined : Number(input.powerKw);
      return { heartbeat: true, ...(powerKw === undefined ? {} : { powerKw }) };
    }
    case "VEHICLE":
      return { soc: Number(input.battery ?? resource.soc) };
    case "PARKING_SPACE":
      return { occupied: bool(input.occupied) };
    case "CHARGING_PORT": {
      const payload = { plugged: bool(input.plugged), relayOn: bool(input.relayOn) };
      for (const key of ["batteryPct", "powerKw", "energyKwh"])
        if (input[key] != null && input[key] !== "") payload[key] = Number(input[key]);
      return payload;
    }
  }
}

export class TelemetryService {
  static telemetryDevices(state, hubId) {
    return [
      ["VEHICLE", state.vehicles], ["PARKING_SPACE", state.slots], ["CHARGING_PORT", state.ports],
    ].flatMap(([type, rows]) => rows.filter((row) => row.hubId === hubId)
      .map((resource) => ({ type, resource })));
  }

  static registerSensor(state, hubId, deviceId = hubId) {
    const hub = lookup(state.hubs, hubId);
    const device = deviceId === hubId ? { type: "HUB", resource: hub }
      : TelemetryService.telemetryDevices(state, hubId).find(({ resource }) => resource.id === deviceId);
    if (!device) throw new Error("Thiết bị không thuộc Hub đã chọn.");
    const existing = state.sensors.find((row) => row.id === deviceId);
    if (existing) {
      existing.hubId = hubId;
      return existing;
    }
    const sensor = new Sensor({ id: deviceId, hubId, type: device.type, lastSeenAt: null, online: false });
    state.sensors.push(sensor);
    return sensor;
  }

  static recordParkingEvidence(state, slot, trip, timestamp) {
    const event = new TelemetryEvent({
      id: uid("TEL"), eventId: uid("DOCK"), hubId: slot.hubId, deviceId: slot.id,
      type: "PARKING_SPACE", source: "RETURN_DOCK", result: RESULT.APPLIED, timestamp, receivedAt: timestamp,
      payload: { occupied: true, tripId: trip.id, vehicleId: trip.vehicleId },
    });
    state.telemetry.push(event);
    return event;
  }

  static updateState(state, device, hub, event, now) {
    const { type, resource } = device;
    const { payload } = event;
    HubService.updateHubTelemetry(hub, type === "HUB" ? payload.powerKw : undefined, event.timestamp, now);
    if (type === "HUB") {
      TelemetryService.evaluateAndAlert(state, device, hub, event, false, now);
      return;
    }
    const changes = { sensorOffline: false, lastTelemetryAt: event.timestamp };
    let conflict = Boolean(payload.fault);
    if (type === "VEHICLE") {
      changes.soc = payload.soc;
      if (resource.status === "AVAILABLE" && payload.soc < state.config.params.MIN_SOC_BOOK_PCT)
        changes.status = "WAITING_CHARGE";
    } else if (type === "PARKING_SPACE") {
      resource.updateSensorStatus(payload.occupied);
      conflict ||= payload.occupied !== Boolean(resource.vehicleId);
    } else {
      changes.sensorPlugged = payload.plugged;
      changes.sensorRelayOn = payload.relayOn;
      conflict ||= payload.plugged !== Boolean(resource.plugged) || payload.relayOn !== Boolean(resource.relayOn);
    }
    touch(resource, changes, now);
    TelemetryService.evaluateAndAlert(state, device, hub, event, conflict, now);
    if (type === "CHARGING_PORT" && !conflict && ["batteryPct", "powerKw", "energyKwh"].some((key) => payload[key] !== undefined)) {
      const session = state.sessions.find((item) => item.id === resource.sessionId && item.status === "CHARGING");
      if (session && event.timestamp >= (session.lastReadingAt ?? session.start))
        ChargingSessionService.updateSessionReading(state, session.id, payload, event.timestamp, now);
    }
  }

  static evaluateAndAlert(state, device, hub, event, conflict, now) {
    const { type, resource } = device;
    const { payload } = event;
    if (type === "HUB") {
      const load = MonitoringService.evaluateHubLoadStatus(state, hub.id, now);
      if (load === "OVERLOAD" || load === "WARNING") appendNotification(state, {
        target: ROLE.OPERATOR, type: NOTIFICATION_TYPE.WARNING,
        title: "Cảnh báo tải Hub", message: hub.name + " · " + load,
      }, now);
      return;
    }
    if (type === "VEHICLE" && payload.soc < state.config.params.LOW_SOC_ALERT_PCT) appendNotification(state, {
      target: ROLE.OPERATOR, type: NOTIFICATION_TYPE.WARNING,
      title: "Cảnh báo pin yếu", message: resource.id + " còn " + payload.soc + "% pin.",
    }, now);
    if (type === "CHARGING_PORT" && payload.fault) {
      ChargingSessionService.handleElectricalFault(state, resource, payload.fault, now);
    } else if (conflict) {
      recordIncident(state, resource.id, payload.fault || "Cảm biến báo hiện trạng khác với dữ liệu vận hành.", now);
    }
  }

  static publishEvent(state, event, device, hub, now) {
    if (event.result !== RESULT.APPLIED && event.result !== RESULT.TIMEOUT) return;
    const sensor = TelemetryService.registerSensor(state, hub.id, device.resource.id);
    if (event.result === RESULT.TIMEOUT) TelemetryService.markOffline(state, sensor, device.resource, now);
    else {
      sensor.markOnline(event.timestamp);
      TelemetryService.updateState(state, device, hub, event, now);
    }
  }

  static validatePacket(event, now) {
    return Number.isFinite(event.timestamp) && event.timestamp <= now && event.isWellFormed();
  }

  static receiveTelemetry(state, input, { now }) {
    const hub = lookup(state.hubs, input.hubId);
    const hubDevice = !input.deviceId || input.deviceId === hub.id || input.mode === "offline";
    const device = hubDevice ? { type: "HUB", resource: hub }
      : TelemetryService.telemetryDevices(state, hub.id).find(({ resource }) => resource.id === input.deviceId);
    if (!device) throw new Error("Thiết bị không thuộc Hub đã chọn.");
    const { type, resource } = device;
    const deviceId = resource.id;
    const previous = state.telemetry.findLast((row) => row.deviceId === deviceId && row.result === RESULT.APPLIED);
    if (input.mode === "duplicate" && !previous)
      throw new Error("Hãy phát một gói hợp lệ cho thiết bị trước khi gửi lại.");
    const eventId = input.eventId || (input.mode === "duplicate" && previous.eventId) || uid("MSG");
    const timeout = state.config.params.TELEMETRY_TIMEOUT_SEC * 1000;
    const timestamp = Number(input.timestamp ?? (input.mode === "late" ? (previous?.timestamp ?? now) - timeout - 1 : now));
    const payload = sensorPayload(type, input, resource);
    if (typeof input.fault === "string" && input.fault.trim()) payload.fault = input.fault.trim();
    const event = new TelemetryEvent({ id: uid("TEL"), eventId, deviceId, hubId: hub.id, type, timestamp, receivedAt: now, payload });
    if (input.mode === "offline" || input.mode === "sensorOffline")
      event.result = RESULT.TIMEOUT;
    else if (state.telemetry.some((row) => row.deviceId === deviceId && row.eventId === eventId && row.result === RESULT.APPLIED))
      event.result = RESULT.IGNORED_DUPLICATE;
    else if (input.mode === "corrupt" || !TelemetryService.validatePacket(event, now))
      event.result = RESULT.REJECTED_CORRUPT;
    else if (now - timestamp > timeout || !event.isNewerThan(previous?.timestamp ?? -Infinity) ||
      (type !== "HUB" && timestamp < (resource.lastTelemetryAt ?? -Infinity)))
      event.result = RESULT.IGNORED_STALE;
    else event.result = RESULT.APPLIED;

    TelemetryService.publishEvent(state, event, device, hub, now);
    state.telemetry.push(event);
    return {
      TIMEOUT: type === "HUB" ? "Đã mô phỏng mất kết nối Hub." : "Đã ghi nhận cảm biến mất kết nối.",
      IGNORED_DUPLICATE: "Đã nhận diện và bỏ qua gói trùng.",
      IGNORED_STALE: "Đã bỏ qua gói tin cũ.",
      REJECTED_CORRUPT: "Đã từ chối gói sai dữ liệu.",
      APPLIED: "Đã nhận telemetry mới.",
    }[event.result];
  }

  static markOffline(state, sensor, resource, now) {
    sensor.markOffline();
    touch(resource, sensor.type === "HUB" ? { offline: true } : { sensorOffline: true }, now);
    appendNotification(state, {
      target: ROLE.OPERATOR, type: NOTIFICATION_TYPE.ALERT,
      title: "Mất kết nối cảm biến", message: sensor.id + " cần được đối soát.",
    }, now);
  }

  static checkTimeouts(state, now) {
    const timeout = state.config.params.TELEMETRY_TIMEOUT_SEC * 1000;
    for (const sensor of state.sensors) {
      if (!sensor.online || sensor.type === "HUB" || !sensor.isTimedOut(now, timeout)) continue;
      const hubId = sensor.hubId;
      const resource = TelemetryService.telemetryDevices(state, hubId).find((entry) => entry.resource.id === sensor.id)?.resource;
      if (resource) TelemetryService.markOffline(state, sensor, resource, now);
      else sensor.markOffline();
    }
  }
}

export const { telemetryDevices, receiveTelemetry: receivePacket, checkTimeouts: checkSensorTimeouts } = TelemetryService;
export { triggerRebalanceAlertIfNeeded } from "./monitoring.js";
