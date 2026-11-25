/** Shared rules for the fleet, physical capacity and the simulated network. */
export function uid(prefix) {
  return prefix + "-" + crypto.randomUUID().slice(0, 12).toUpperCase();
}

export function lookup(rows, id) {
  const row = rows.find((item) => item.id === id);
  if (!row) throw new Error("Không tìm thấy tài nguyên " + id + ".");
  return row;
}

export function isHubOnline(state, hubId, now) {
  const hub = lookup(state.hubs, hubId);
  return (
    !hub.offline &&
    Number.isFinite(hub.lastTelemetryAt) &&
    now - hub.lastTelemetryAt <=
      state.config.params.TELEMETRY_TIMEOUT_SEC * 1000
  );
}

export function guardHubOnline(state, hubId, now) {
  if (!isHubOnline(state, hubId, now))
    throw new Error("Hub mất kết nối. Hãy chờ dữ liệu mới trước khi xác nhận.");
}

export function slotAvailable(state, slot) {
  return (
    !slot.vehicleId &&
    !slot.holdId &&
    !slot.blocked &&
    !slot.sensorOffline &&
    !slot.sensorOccupied &&
    slot.status === "AVAILABLE"
  );
}

export function hubMetrics(state, hubId, now) {
  const hub = lookup(state.hubs, hubId);
  const slots = state.slots.filter((row) => row.hubId === hubId);
  const ports = state.ports.filter((row) => row.hubId === hubId);
  const online = isHubOnline(state, hubId, now);
  const occupiedSlots = slots.filter((row) => row.vehicleId || row.sensorOccupied).length;
  const freeSlots = slots.filter((row) => slotAvailable(state, row)).length;
  const occupancyRatio = slots.length ? occupiedSlots / slots.length : 0;
  const measured = now - hub.measuredPowerAt <= state.config.params.TELEMETRY_TIMEOUT_SEC * 1000;
  const relayPower = ports.filter((row) => row.relayOn || row.sensorRelayOn)
    .reduce((sum, row) => sum + row.powerKw, 0);
  const currentPowerKw = measured ? Math.max(hub.measuredPowerKw, relayPower) : relayPower;
  const powerLimitKw = state.config.hubPowerLimitKw[hubId];
  const availableVehicles = state.vehicles.filter(
    (row) =>
      row.hubId === hubId &&
      row.status === "AVAILABLE" &&
      !row.blocked &&
      !row.sensorOffline &&
      row.soc >= state.config.params.MIN_SOC_BOOK_PCT &&
      slots.some((slot) => slot.id === row.slotId && slot.status === "OCCUPIED" &&
        slot.vehicleId === row.id && !slot.blocked && !slot.sensorOffline && slot.sensorOccupied !== false),
  ).length;
  const loadStatus = !online ? "OFFLINE"
    : currentPowerKw > powerLimitKw ? "OVERLOAD"
      : slots.length && (1 - freeSlots / slots.length >= state.config.params.HUB_FULL_RATIO ||
        availableVehicles / slots.length <= state.config.params.HUB_LOW_AVAIL_RATIO)
        ? "WARNING" : "NORMAL";
  return {
    availableVehicles,
    totalSlots: slots.length,
    occupiedSlots,
    occupancyRatio,
    totalPorts: ports.length,
    freeSlots,
    freePorts: ports.filter((row) => !row.blocked && !row.sensorOffline && row.status === "AVAILABLE")
      .length,
    online,
    currentPowerKw,
    powerLimitKw,
    loadStatus,
  };
}

export function networkSnapshot(state, now) {
  const hubs = state.hubs.map((hub) => ({ ...hub, ...hubMetrics(state, hub.id, now) }));
  return {
    snapshotAt: now,
    hubs,
    alerts: hubs.filter((hub) => hub.loadStatus !== "NORMAL")
      .map((hub) => ({ hubId: hub.id, status: hub.loadStatus })),
  };
}
