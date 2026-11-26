import { uid } from "../domain/resources.js";
import { ChargingCommand } from "../domain/entities.js";
import { CONTROL_COMMAND, CONTROL_RESULT } from "../utils/status.js";

/** The mock records the simulated response times without blocking the demo. */
export class DeviceControlGateway {
  static requestControl({ id, targetId, command }, now, timeoutSec, outcome = "ok") {
    if (!id || !targetId || !Object.hasOwn(CONTROL_COMMAND, command))
      throw new Error("Lệnh điều khiển thiếu mã, thiết bị hoặc thao tác hợp lệ.");
    const deadlineAt = now + timeoutSec * 1000;
    if (outcome === "timeout")
      return {
        result: CONTROL_RESULT.TIMEOUT, deadlineAt, resolvedAt: deadlineAt,
        faultCode: "CONTROL_TIMEOUT",
        message: "Thiết bị chưa phản hồi. Kiểm tra cảm biến trước khi thử lại.",
      };
    if (outcome === "fault")
      return {
        result: CONTROL_RESULT.FAILED, deadlineAt, resolvedAt: now,
        faultCode: "DEVICE_FAULT",
        message: "Thiết bị báo lỗi an toàn. Thao tác chưa hoàn tất.",
      };
    if (outcome !== "ok") throw new Error("Phản hồi mô phỏng không hợp lệ.");
    return { result: CONTROL_RESULT.DONE, deadlineAt, resolvedAt: now, faultCode: null, message: "" };
  }
}

export function queueControl(state, targetId, command, now, details = {}) {
  const request = new ChargingCommand({
    ...details,
    id: uid("CMD"),
    targetId,
    command,
    createdAt: now,
    result: CONTROL_RESULT.PENDING,
  });
  state.deviceCommands.push(request);
  return request;
}

export function acknowledgeControl(state, request, now, outcome) {
  if (request.result !== CONTROL_RESULT.PENDING) return request;
  return Object.assign(request, { requestedAt: now }, DeviceControlGateway.requestControl(
    request,
    now,
    state.config.params.CONTROL_TIMEOUT_SEC,
    outcome,
  ));
}
