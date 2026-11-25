import { lookup, uid } from "./resources.js";

/** Block new allocations immediately. Keep physical state until a safe isolation is confirmed. */
export function recordIncident(state, targetId, reason, now) {
  const asset = lookup(
    [...state.vehicles, ...state.slots, ...state.ports],
    targetId,
  );
  if (!reason?.trim()) throw new Error("Nhập mô tả sự cố.");
  const existing = state.incidents.find(
    (i) => i.targetId === asset.id && i.status !== "RESOLVED",
  );
  if (existing) return existing;
  asset.blocked = true;
  asset.version = (asset.version || 0) + 1;
  asset.updatedAt = now;
  const incident = {
    id: uid("INC"),
    targetId: asset.id,
    hubId: asset.hubId,
    status: "ISOLATING",
    reason: reason.trim(),
    createdAt: now,
    affected: [],
  };
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
    state.notifications.push({
      id: uid("NTF"),
      userId: booking.userId,
      title: "Đặt chỗ bị ảnh hưởng",
      message: "Sự cố " + asset.id + " ảnh hưởng đến " + booking.id,
      at: now,
    });
  }
  state.incidents.push(incident);
  return incident;
}
