import { Hub, ParkingSpace } from "./entities.js";

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
  return !Hub.prototype.isOffline.call(hub, state.config.params.TELEMETRY_TIMEOUT_SEC, now);
}

export function guardHubOnline(state, hubId, now) {
  if (!isHubOnline(state, hubId, now))
    throw new Error("Hub mất kết nối. Hãy chờ dữ liệu mới trước khi xác nhận.");
}

export function slotAvailable(state, slot) {
  return ParkingSpace.prototype.canReleaseToAvailable.call(slot);
}

export function hubMetrics(state, hubId, now) {
  const hub = lookup(state.hubs, hubId);
  const slots = state.slots.filter((row) => row.hubId === hubId);
  const ports = state.ports.filter((row) => row.hubId === hubId);
  const online = isHubOnline(state, hubId, now);
  const occupiedSlots = slots.filter((row) => row.vehicleId || row.sensorOccupied).length;
  const freeSlots = Hub.prototype.getEmptySpaceCount.call(hub, slots);
  const occupancyRatio = slots.length ? occupiedSlots / slots.length : 0;
  const measured = now - hub.measuredPowerAt <= state.config.params.TELEMETRY_TIMEOUT_SEC * 1000;
  const relayPower = ports.filter((row) => row.relayOn || row.sensorRelayOn)
    .reduce((sum, row) => sum + row.powerKw, 0);
  const currentPowerKw = measured ? Math.max(hub.measuredPowerKw, relayPower) : relayPower;
  const powerLimitKw = state.config.hubPowerLimitKw[hubId];
  const availableVehicles = Hub.prototype.getAvailableVehicleCount.call(
    hub, state.vehicles, slots, state.config.params.MIN_SOC_BOOK_PCT,
  );
  const nearFull = slots.length > 0 && 1 - freeSlots / slots.length >= state.config.params.HUB_FULL_RATIO;
  const needsRebalance = online && slots.length > 0 &&
    availableVehicles / slots.length <= state.config.params.HUB_LOW_AVAIL_RATIO;
  const loadStatus = Hub.prototype.calculateLoadLevel.call(hub, {
    online, currentPowerKw, powerLimitKw, nearFull, needsRebalance,
  });
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
    nearFull,
    needsRebalance,
    currentPowerKw,
    powerLimitKw,
    loadStatus,
  };
}

export function networkSnapshot(state, now) {
  const timeout = state.config.params.TELEMETRY_TIMEOUT_SEC * 1000;
  const staleSources = new Set(state.sensors.filter((sensor) =>
    sensor.type !== "HUB" &&
    (!sensor.online || !Number.isFinite(sensor.lastSeenAt) || now - sensor.lastSeenAt > timeout)
  ).map((sensor) => sensor.id));
  const staleByHub = new Map();
  for (const resource of [...state.vehicles, ...state.slots, ...state.ports]) {
    if (!resource.hubId || (!resource.sensorOffline && !staleSources.has(resource.id))) continue;
    if (!staleByHub.has(resource.hubId)) staleByHub.set(resource.hubId, []);
    staleByHub.get(resource.hubId).push(resource.id);
  }
  const hubs = state.hubs.map((hub) => ({
    ...hub,
    ...hubMetrics(state, hub.id, now),
    staleSensorIds: staleByHub.get(hub.id) ?? [],
  }));
  return {
    snapshotAt: now,
    hubs,
    alerts: hubs.filter((hub) => hub.loadStatus !== "NORMAL")
      .map((hub) => ({ hubId: hub.id, status: hub.loadStatus })),
  };
}
