import { lookup, uid } from "./resources.js";
import { Incident } from "./entities.js";
import { NotificationService } from "./notifications.js";

export const incidentCategories = {
  VEHICLE: "Phương tiện",
  CHARGING_PORT: "Thiết bị sạc",
  PARKING_SLOT: "Ô đỗ",
  SENSOR: "Cảm biến",
  OTHER: "Khác",
};

export const incidentSeverities = {
  LOW: "Thấp",
  MEDIUM: "Trung bình",
  HIGH: "Cao",
  CRITICAL: "Khẩn cấp",
};

export function classifyAndPrioritize(incident, category, severity) {
  if (!Object.hasOwn(incidentCategories, category) || !Object.hasOwn(incidentSeverities, severity))
    throw new Error("Chọn loại sự cố và mức độ hợp lệ.");
  Object.assign(incident, { category, severity });
  return incident;
}

/** Block new allocations immediately. Keep physical state until a safe isolation is confirmed. */
export function recordIncident(state, targetId, reason, now, origin = "SYSTEM") {
  const asset = lookup(
    [...state.vehicles, ...state.slots, ...state.ports],
    targetId,
  );
  if (!reason?.trim()) throw new Error("Nhập mô tả sự cố.");
  const existing = state.incidents.find(
    (i) => i.targetId === asset.id && !["RESOLVED", "CANCELLED"].includes(i.status),
  );
  if (existing) {
    if (origin === "SYSTEM") existing.hasSystemAlert = true;
    return existing;
  }
  const wasBlocked = Boolean(asset.blocked);
  asset.blocked = true;
  asset.version = (asset.version || 0) + 1;
  asset.updatedAt = now;
  const resourceType = state.vehicles.includes(asset) ? "VEHICLE"
    : state.ports.includes(asset) ? "CHARGING_PORT" : "PARKING_SLOT";
  const incident = new Incident({
    id: uid("INC"),
    targetId: asset.id,
    hubId: asset.hubId,
    resourceType,
    status: "ISOLATING",
    reason: reason.trim(),
    createdAt: now,
    origin,
    wasBlocked,
    affected: [],
  });
  classifyAndPrioritize(incident, resourceType,
    asset.relayOn || asset.sensorRelayOn || asset.status === "IN_USE" ? "HIGH" : "MEDIUM");
  for (const booking of [...state.reservations, ...state.schedules]) {
    if (![booking.slotId, booking.vehicleId, booking.portId].includes(asset.id))
      continue;
    if (
      !["CONFIRMED", "SCHEDULED", "REPLACED", "RESCHEDULED"].includes(
        booking.status,
      )
    )
      continue;
    booking.previousStatus = booking.status;
    booking.status = "AFFECTED";
    booking.updatedAt = now;
    booking.version = (booking.version || 0) + 1;
    incident.affected.push(booking.id);
    NotificationService.sendNotification(state, [booking.userId], {
      title: "Đặt chỗ bị ảnh hưởng",
      message: "Sự cố " + asset.id + " ảnh hưởng đến " + booking.id,
    }, now);
  }
  state.incidents.push(incident);
  return incident;
}
