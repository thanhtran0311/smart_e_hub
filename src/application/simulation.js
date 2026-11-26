import { SimulationScenario } from "../domain/entities.js";
import { lookup, uid } from "../domain/resources.js";
import { MonitoringService } from "./monitoring.js";
import { ensure } from "../domain/student-rules.js";
import { ACTIVE_CHARGING, SIMULATION_STATUS } from "../utils/status.js";

export class SimulationService {
  static validateParams(state, input) {
    const demandPct = Number(input.demandPct);
    const durationMin = Number(input.durationMin);
    const errors = [];
    if (!Number.isFinite(demandPct) || demandPct < 0 || demandPct > 500) errors.push("Chọn mức nhu cầu từ 0 đến 500%.");
    if (!Number.isInteger(durationMin) || durationMin < 1 || durationMin > state.config.simulation.maxDurationMin)
      errors.push("Thời lượng mô phỏng ngoài phạm vi cấu hình.");
    for (const id of new Set([input.sourceId, input.destId]))
      if (!state.hubs.some((hub) => hub.id === id)) errors.push("Không tìm thấy tài nguyên " + id + ".");
    if (input.sourceId === input.destId) errors.push("Chọn hai Hub khác nhau.");
    return errors;
  }

  static normalizedParams(state, input) {
    const errors = SimulationService.validateParams(state, input);
    ensure(!errors.length, errors.join(" "));
    return { sourceId: input.sourceId, destId: input.destId, demandPct: Number(input.demandPct), durationMin: Number(input.durationMin) };
  }

  static getSavedScenario(state, scenarioId) {
    return lookup(state.scenarios, scenarioId);
  }

  static getNetworkSnapshot(state, now) {
    return MonitoringService.getNetworkOverviewSnapshot(state, now);
  }

  static saveScenarioTemplate(state, input, { user, now }) {
    const name = String(input.name || "").trim();
    ensure(name.length <= 80, "Tên mẫu tối đa 80 ký tự.");
    const template = new SimulationScenario({
      ...SimulationService.normalizedParams(state, input),
      id: uid("SIM"), name: name || "Mẫu " + input.sourceId + " → " + input.destId,
      status: SIMULATION_STATUS.DRAFT, createdAt: now, userId: user.id,
    });
    state.scenarios.push(template);
    return template;
  }

  static runSimulation(state, input, { user, now }) {
    const saved = input.templateId && SimulationService.getSavedScenario(state, input.templateId);
    if (saved) ensure(saved.status === SIMULATION_STATUS.DRAFT, "Chọn một mẫu kịch bản.");
    const params = SimulationService.normalizedParams(state, saved || input);
    const snapshot = SimulationService.getNetworkSnapshot(state, now).hubs;
    const dest = lookup(snapshot, params.destId);
    const scenario = new SimulationScenario({
      ...params, id: uid("SIM"), userId: user.id,
      templateId: saved?.id ?? null, snapshot, createdAt: now,
      confidence: snapshot.every((hub) => hub.online && hub.staleSensorIds.length === 0)
        ? "HIGH" : "LIMITED",
    });
    let result;
    try {
      const budgetMs = Math.max(0, state.config.simulation.computeTimeoutMs ?? 500);
      const forecast = SimulationService.executeMovementModel(state, params, dest, now, performance.now() + budgetMs);
      const bottlenecks = SimulationService.calculateBottlenecks(forecast, dest.id);
      result = { status: SIMULATION_STATUS.COMPLETED, forecast, bottlenecks };
    } catch (error) {
      result = { status: SIMULATION_STATUS.FAILED, error: error.message };
    }
    return SimulationService.saveSimulationResult(state, scenario, result);
  }

  static saveSimulationResult(state, scenario, result) {
    Object.assign(scenario, result);
    state.scenarios.push(scenario);
    return scenario;
  }

  static executeMovementModel(state, { destId, demandPct, durationMin }, dest, now, deadline = Infinity) {
    const ports = state.ports.filter((port) => port.hubId === destId && !port.blocked);
    const bookings = state.schedules.filter((row) => row.hubId === destId && ACTIVE_CHARGING.includes(row.status));
    const { arrivalsPerPickup = 0.5, arrivingChargeRatio = 0.25 } = state.config.simulation;
    const forecast = [];
    for (let elapsed = 0; elapsed < durationMin; elapsed += 15) {
      ensure(performance.now() < deadline, "Quá thời hạn tính toán kịch bản.");
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
      const step = {
        minute, pickups, arrivals,
        available: Math.max(0, dest.availableVehicles - pickups),
        shortfall: Math.max(0, pickups - dest.availableVehicles),
        freeSpaces: Math.max(0, freeSpaces), spaceShortfall: Math.max(0, -freeSpaces),
        projectedKw, powerLimitKw: dest.powerLimitKw,
        queueLength: Math.max(0, arrivingForCharge - waitingPorts.length),
      };
      ensure(Object.values(step).every(Number.isFinite), "Mô hình không tạo được kết quả hữu hạn.");
      forecast.push(step);
    }
    return forecast;
  }

  static calculateBottlenecks(forecast, destId) {
    const bottlenecks = [];
    for (const [type, condition] of [
      ["VEHICLE_SHORTAGE", (step) => step.shortfall > 0],
      ["PARKING_FULL", (step) => step.freeSpaces === 0],
      ["CHARGING_OVERLOAD", (step) => step.queueLength > 0 || step.projectedKw > step.powerLimitKw],
    ]) {
      const first = forecast.find(condition);
      if (first) bottlenecks.push({ type, minute: first.minute, hubId: destId });
    }
    return bottlenecks;
  }
}

export const { saveScenarioTemplate, runSimulation } = SimulationService;
