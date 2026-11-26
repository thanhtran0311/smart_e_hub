import { isHubOnline } from "../domain/resources.js";
import { usable } from "../domain/student-rules.js";
import { ACTIVE_CHARGING as activeSchedules, CONTROL_RESULT } from "../utils/status.js";
import { ChargingSessionService } from "./charging.js";
import { RecommendationService } from "./operator.js";

function canProcess(state, request, now) {
  const schedule = state.schedules.find((row) => row.id === request.scheduleId);
  return !schedule || !activeSchedules.includes(schedule.status) ||
    ["CHARGING", "STOPPED"].includes(schedule.status) || now >= schedule.end ||
    (schedule.status === "PLUGGED" && now >= schedule.start && isHubOnline(state, schedule.hubId, now));
}

/** Consume persisted demo commands only after the transaction that created them. */
export function processPendingEffects(store) {
  const assignments = store.state.orders.filter((order) =>
    order.status === "PENDING" && order.assignmentStatus === "PENDING"
  );
  for (const { id } of assignments)
    store.transaction((state, now) => {
      const order = state.orders.find((row) => row.id === id);
      order.confirmAssignment(now);
    });

  const ready = store.state.deviceCommands.filter((request) =>
    request.planId && request.result === CONTROL_RESULT.PENDING && canProcess(store.state, request, store.now())
  );
  for (const { id } of ready)
    store.transaction((state, now) => {
      const request = state.deviceCommands.find((row) => row.id === id);
      if (request.result !== CONTROL_RESULT.PENDING || !canProcess(state, request, now)) return;
      const schedule = state.schedules.find((row) => row.id === request.scheduleId);
      const port = state.ports.find((row) => row.id === request.targetId);
      if (!schedule || schedule.portId !== port?.id || !activeSchedules.includes(schedule.status) ||
          ["CHARGING", "STOPPED"].includes(schedule.status) || now >= schedule.end) {
        Object.assign(request, { result: CONTROL_RESULT.SKIPPED, resolvedAt: now, message: "Lịch đã đổi hoặc đã được xử lý." });
        return;
      }
      if (!usable(port) || !port.plugged || port.sensorPlugged === false ||
          port.scheduleId !== schedule.id || port.relayOn || port.sensorRelayOn) {
        Object.assign(request, { result: CONTROL_RESULT.FAILED, resolvedAt: now, message: "Cổng chưa xác nhận điều kiện an toàn." });
        RecommendationService.compensateFailedPlan(state, request, now);
        return;
      }
      if (ChargingSessionService.hasPowerFor(state, port, now))
        ChargingSessionService.energize(state, schedule, now, request.outcome, request);
      RecommendationService.compensateFailedPlan(state, request, now);
    });
}
