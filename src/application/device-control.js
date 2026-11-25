import { recordIncident } from "../domain/incidents.js";
import { touch } from "../domain/student-rules.js";
import { acknowledgeControl, queueControl } from "../infrastructure/device.js";
import { CONTROL_RESULT } from "../utils/status.js";

export function deviceResult(state, row, target, command, outcome, now, request) {
  const control = acknowledgeControl(
    state, request ?? queueControl(state, target.id, command, now), now, outcome || "ok",
  );
  touch(row, {
    lastControlId: control.id,
    operationError: control.message || null,
  }, now);
  if (control.result === CONTROL_RESULT.FAILED) {
    const incident = recordIncident(state, target.id, control.message, now);
    incident.hubId ??= row.returnHubId || row.hubId;
    incident.lastControlId = control.id;
  }
  return control;
}
