import { lookup, networkSnapshot, uid } from "../domain/resources.js";
import { ensure } from "../domain/student-rules.js";
import { ACTIVE_CHARGING, SIMULATION_STATUS } from "../utils/status.js";

function validateParams(state, input) {
  const demandPct = Number(input.demandPct);
  const durationMin = Number(input.durationMin);
  ensure(Number.isFinite(demandPct) && demandPct >= 0 && demandPct <= 500,
    "Chọn mức nhu cầu từ 0 đến 500%.");
  ensure(Number.isInteger(durationMin) && durationMin >= 1 &&
    durationMin <= state.config.simulation.maxDurationMin, "Thời lượng mô phỏng ngoài phạm vi cấu hình.");
  lookup(state.hubs, input.sourceId);
  lookup(state.hubs, input.destId);
  ensure(input.sourceId !== input.destId, "Chọn hai Hub khác nhau.");
  return { sourceId: input.sourceId, destId: input.destId, demandPct, durationMin };
}

export function saveScenarioTemplate(state, input, { user, now }) {
  const name = String(input.name || "").trim();
  ensure(name.length <= 80, "Tên mẫu tối đa 80 ký tự.");
  const template = {
    ...validateParams(state, input),
    id: uid("SIM"), name: name || "Mẫu " + input.sourceId + " → " + input.destId,
    status: SIMULATION_STATUS.DRAFT, createdAt: now, userId: user.id,
  };
  state.scenarios.push(template);
  return template;
}

export function runSimulation(state, input, { user, now }) {
  const saved = input.templateId && lookup(state.scenarios, input.templateId);
  if (saved) ensure(saved.status === SIMULATION_STATUS.DRAFT, "Chọn một mẫu kịch bản.");
  const params = validateParams(state, saved || input);
  const { destId, demandPct, durationMin } = params;
  const snapshot = networkSnapshot(state, now).hubs;
  const dest = lookup(snapshot, destId);
  const ports = state.ports.filter((port) => port.hubId === destId && !port.blocked);
  const bookings = state.schedules.filter((row) => row.hubId === destId && ACTIVE_CHARGING.includes(row.status));
  const { arrivalsPerPickup = 0.5, arrivingChargeRatio = 0.25 } = state.config.simulation;
  const forecast = [];
  for (let elapsed = 0; elapsed < durationMin; elapsed += 15) {
    const minute = Math.min(durationMin, elapsed + 15);
    const at = now + minute * 60_000;
    const pickups = Math.ceil(minute / 15 * demandPct / 100);
    const arrivals = Math.floor(pickups * arrivalsPerPickup);
    const acceptedPickups = Math.min(pickups, dest.availableVehicles);
    const freeSpaces = dest.freeSlots + acceptedPickups - arrivals;
    const occupiedPorts = new Set(bookings.filter((row) => row.start <= at && at < row.end)
      .map((row) => row.portId));
    const arrivingForCharge = Math.ceil(arrivals * arrivingChargeRatio);
    const activeKw = ports.filter((port) => occupiedPorts.has(port.id)).reduce((sum, port) => sum + port.powerKw, 0);
    const waitingPorts = ports.filter((port) => !occupiedPorts.has(port.id));
    const projectedKw = activeKw + arrivingForCharge * (waitingPorts[0]?.powerKw ?? ports[0]?.powerKw ?? 0);
    forecast.push({
      minute, pickups, arrivals,
      available: Math.max(0, dest.availableVehicles - pickups),
      shortfall: Math.max(0, pickups - dest.availableVehicles),
      freeSpaces: Math.max(0, freeSpaces), spaceShortfall: Math.max(0, -freeSpaces),
      projectedKw, powerLimitKw: dest.powerLimitKw,
      queueLength: Math.max(0, arrivingForCharge - waitingPorts.length),
    });
  }
  const bottlenecks = [];
  for (const [type, condition] of [
    ["VEHICLE_SHORTAGE", (step) => step.shortfall > 0],
    ["PARKING_FULL", (step) => step.freeSpaces === 0],
    ["CHARGING_OVERLOAD", (step) => step.queueLength > 0 || step.projectedKw > step.powerLimitKw],
  ]) {
    const first = forecast.find(condition);
    if (first) bottlenecks.push({ type, minute: first.minute, hubId: destId });
  }
  const scenario = {
    ...params,
    id: uid("SIM"), status: SIMULATION_STATUS.COMPLETED, userId: user.id,
    templateId: saved?.id ?? null, snapshot, forecast, bottlenecks, createdAt: now,
    confidence: snapshot.every((hub) => hub.online && hub.staleSensorIds.length === 0)
      ? "HIGH" : "LIMITED",
  };
  state.scenarios.push(scenario);
  return scenario;
}
