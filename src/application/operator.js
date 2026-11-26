import {
  guardHubOnline,
  hubMetrics,
  isHubOnline,
  slotAvailable,
  uid,
} from "../domain/resources.js";
import {
  chargingWindowAvailable,
  parkingWindowAvailable,
  parkedVehicleReady,
  releaseVehicleHold,
  usable,
} from "../domain/student-rules.js";
import { recordIncident } from "../domain/incidents.js";
import { appendNotification, notifyRedirect } from "../domain/notifications.js";
import { receivePacket } from "./telemetry.js";
import { runSimulation, saveScenarioTemplate } from "./simulation.js";
import { deenergize } from "./charging.js";
import { deviceResult } from "./device-control.js";
import { queueControl } from "../infrastructure/device.js";
import { ACTIVE_CHARGING, CONTROL_COMMAND, CONTROL_RESULT, NOTIFICATION_TYPE, ROLE } from "../utils/status.js";

const MINUTE = 60000;
const check = (ok, message) => {
  if (!ok) throw new Error(message);
};
const touch = (row, now) => {
  row.version = (row.version || 0) + 1;
  row.updatedAt = now;
};
const activeSchedules = new Set(ACTIVE_CHARGING);
const byId = (rows, id) => {
  const item = rows.find((r) => r.id === id);
  check(item, "Không tìm thấy bản ghi " + id);
  return item;
};

export function previewDispatch(s, sourceId, destId) {
  const vehicles = s.vehicles.filter(
    (v) =>
      v.hubId === sourceId &&
      v.status === "AVAILABLE" &&
      !v.blocked &&
      !v.sensorOffline &&
      v.soc >= s.config.params.MIN_SOC_RELOCATE_PCT &&
      s.slots.some(
        (x) => x.id === v.slotId && x.vehicleId === v.id && x.status === "OCCUPIED" &&
          !x.blocked && !x.sensorOffline && x.sensorOccupied !== false,
      ),
  );
  const slots = s.slots.filter(
    (x) => x.hubId === destId && x.type === "SHARED" && slotAvailable(s, x),
  );
  return {
    vehicles,
    slots,
    versions: Object.fromEntries(vehicles.map((v) => [v.id, v.version])),
    capacityVersion: slots
      .map((x) => x.id + ":" + x.version)
      .sort()
      .join("|"),
  };
}

function createOrder(s, p, { now }) {
  check(p.sourceId !== p.destId, "Hub nhận phải khác Hub xuất phát.");
  guardHubOnline(s, p.sourceId, now);
  guardHubOnline(s, p.destId, now);
  const live = previewDispatch(s, p.sourceId, p.destId);
  const ids = Array.isArray(p.vehicleIds)
    ? p.vehicleIds
    : [p.vehicleIds].filter(Boolean);
  check(
    ids.length && new Set(ids).size === ids.length,
    "Chọn ít nhất một xe, mỗi xe một lần.",
  );
  check(
    live.capacityVersion === p.capacityVersion &&
      ids.length <= live.slots.length,
    "Sức chứa đích đã thay đổi hoặc không đủ. Hãy xem lại.",
  );
  check(
    ids.every((id) =>
      live.vehicles.some((v) => v.id === id && v.version === p.versions?.[id]),
    ),
    "Xe đã thay đổi kể từ lúc xem trước.",
  );
  const teamId = p.teamId || s.teams.find((team) => team.type === "TRANSPORT")?.id;
  check(s.teams.some((team) => team.id === teamId && team.type === "TRANSPORT"), "Đội tiếp nhận không hợp lệ.");
  const order = {
    id: uid("DSP"),
    sourceId: p.sourceId,
    destId: p.destId,
    teamId,
    status: "PENDING",
    assignmentStatus: "PENDING",
    createdAt: now,
    items: [],
  };
  ids.forEach((id, i) => {
    const v = byId(s.vehicles, id),
      slot = live.slots[i];
    slot.holdId = order.id;
    touch(slot, now);
    order.items.push({
      vehicleId: id,
      originSlotId: v.slotId,
      slotId: slot.id,
      status: "PENDING",
    });
    v.status = "RELOCATING";
    touch(v, now);
  });
  s.orders.push(order);
  return order;
}

function cancelDispatchOrder(state, order, now) {
  order.status = "CANCELLED";
  order.closedAt = now;
  for (const item of order.items) {
    const slot = byId(state.slots, item.slotId);
    if (slot.holdId === order.id) {
      slot.holdId = null;
      touch(slot, now);
    }
    const vehicle = byId(state.vehicles, item.vehicleId);
    if (vehicle.status === "RELOCATING") {
      const safe = vehicle.slotId === item.originSlotId && vehicle.locked !== false &&
        parkedVehicleReady(state, { ...vehicle, status: "AVAILABLE" }, now);
      vehicle.status = safe ? "AVAILABLE" : "PENDING_CHECK";
      touch(vehicle, now);
    }
    item.status = "CANCELLED";
  }
  for (const item of state.recommendations.filter((row) =>
    row.orderId === order.id && ["APPLIED", "PENDING_CHECK"].includes(row.status)
  )) {
    item.status = "COMPENSATED";
    item.note = "Lệnh điều phối đã hủy và đã nhả chỗ.";
  }
  return "Đã hủy lệnh và giải phóng chỗ giữ.";
}

function changeOrder(s, action, p, ctx) {
  const { now } = ctx;
  if (action === "create")
    return (
      "Đã phát hành lệnh " +
      createOrder(s, p, ctx).id +
      " và giữ chỗ tại Hub đích."
    );
  const o = byId(s.orders, p.id);
  if (action === "cancel") {
    check(o.status === "PENDING", "Lệnh đã bắt đầu hoặc đã đóng.");
    if (o.assignmentStatus === "PENDING") {
      o.assignmentStatus = "CANCELLED";
      return cancelDispatchOrder(s, o, now);
    }
    if (o.assignmentStatus !== "RECALL_REQUESTED") {
      o.assignmentStatus = "RECALL_REQUESTED";
      o.recallRequestedAt = now;
    }
    return "Đang chờ đội vận chuyển xác nhận thu hồi. Các ô đích vẫn được giữ.";
  }
  if (action === "confirmRecall") {
    if (o.status === "CANCELLED" && o.assignmentStatus === "RECALLED")
      return "Đội vận chuyển đã xác nhận thu hồi lệnh này.";
    check(o.status === "PENDING" && o.assignmentStatus === "RECALL_REQUESTED",
      "Lệnh chưa yêu cầu thu hồi hoặc xe đã rời Hub.");
    o.assignmentStatus = "RECALLED";
    o.recallConfirmedAt = now;
    return cancelDispatchOrder(s, o, now);
  }
  if (action === "start") {
    check(o.status === "PENDING", "Lệnh đã bắt đầu hoặc đã đóng.");
    check(o.assignmentStatus !== "PENDING", "Chưa gửi phân công cho đội vận chuyển.");
    guardHubOnline(s, o.sourceId, now);
    guardHubOnline(s, o.destId, now);
    check(
      o.items.every((i) => {
        const v = byId(s.vehicles, i.vehicleId),
          x = byId(s.slots, i.originSlotId),
          target = byId(s.slots, i.slotId);
        return (
          !v.blocked &&
          !v.sensorOffline &&
          !x.blocked &&
          !x.sensorOffline &&
          x.vehicleId === v.id &&
          x.sensorOccupied !== false &&
          target.hubId === o.destId &&
          target.holdId === o.id &&
          !target.blocked &&
          !target.sensorOffline &&
          !target.vehicleId &&
          !target.sensorOccupied &&
          target.status === "AVAILABLE" &&
          v.status === "RELOCATING"
        );
      }),
      "Tài nguyên đã thay đổi hoặc đang bị cách ly.",
    );
    if (o.assignmentStatus === "RECALL_REQUESTED") {
      o.assignmentStatus = "SENT";
      const rec = s.recommendations.find((item) => item.orderId === o.id && item.status === "PENDING_CHECK");
      if (rec) rec.note = "Xe đã rời Hub. Cần đối soát từng xe trước khi lập lệnh phục hồi.";
    }
    o.status = "IN_TRANSIT";
    for (const i of o.items) {
      const v = byId(s.vehicles, i.vehicleId), x = byId(s.slots, i.originSlotId);
      x.vehicleId = null;
      x.sensorOccupied = false;
      x.status = "AVAILABLE";
      touch(x, now);
      v.slotId = null;
      v.hubId = null;
      touch(v, now);
      i.status = o.status;
    }
    return "Đã xác nhận xe rời Hub nguồn.";
  }
  check(
    action === "receive" && o.status === "IN_TRANSIT",
    "Lệnh chưa vận chuyển hoặc đã kết thúc.",
  );
  const i = o.items.find(
    (i) => i.vehicleId === p.vehicleId && i.status === "IN_TRANSIT",
  );
  check(i, "Xe đã được ghi nhận hoặc không thuộc lệnh.");
  const v = byId(s.vehicles, i.vehicleId),
    x = byId(s.slots, i.slotId);
  const arrived = p.success === true || p.success === "true";
  if (arrived) {
    guardHubOnline(s, o.destId, now);
    check(
      x.holdId === o.id &&
        !x.blocked &&
        !x.vehicleId &&
        !x.sensorOccupied &&
        x.status === "AVAILABLE",
      "Chỗ nhận không còn an toàn. Cần kiểm tra thực địa.",
    );
    v.hubId = o.destId;
    v.slotId = x.id;
    v.status = v.blocked ? "PENDING_CHECK" : "AVAILABLE";
    x.vehicleId = v.id;
    x.sensorOccupied = true;
    x.status = "OCCUPIED";
  } else {
    v.status = "PENDING_CHECK";
  }
  if (x.holdId === o.id) x.holdId = null;
  touch(v, now);
  touch(x, now);
  i.status = arrived ? "COMPLETED" : "FAILED";
  i.receivedAt = now;
  if (!o.items.some((i) => i.status === "IN_TRANSIT")) {
    const n = o.items.filter((i) => i.status === "COMPLETED").length;
    o.status =
      n === o.items.length ? "COMPLETED" : n ? "PARTIALLY_COMPLETED" : "FAILED";
    o.closedAt = now;
  }
  return arrived
    ? "Đã xác nhận bàn giao xe."
    : "Đã ghi nhận xe chưa bàn giao và chờ đối soát.";
}

export function proposeSchedule(s, hubId, now, priorityId = "") {
  const ports = s.ports.filter((x) => x.hubId === hubId),
    limit = s.config.hubPowerLimitKw[hubId];
  const active = s.sessions.filter(
    (x) => x.hubId === hubId && x.status === "CHARGING",
  );
  const bookings = s.schedules.filter(
    (x) => x.hubId === hubId && activeSchedules.has(x.status) && x.end > now,
  );
  const weights = s.config.priorityWeights;
  const rows = bookings
    .map((b) => {
      const v = [...s.vehicles, ...s.privateVehicles].find(
          (x) => x.id === b.vehicleId,
        ),
        port = byId(ports, b.portId);
      const urgency = v?.nextTripAt
        ? 1 / (1 + Math.max(0, v.nextTripAt - now) / 3600000)
        : 0;
      return {
        id: b.id,
        vehicleId: b.vehicleId,
        portId: b.portId,
        start: b.start,
        end: b.end,
        powerKw: port.powerKw,
        score:
          weights.soc * (1 - (v?.soc ?? 100) / 100) +
          weights.nextTrip * urgency +
          weights.sharedVehicle * Number(s.vehicles.includes(v)),
        active: active.some((x) => x.scheduleId === b.id),
      };
    })
      .sort(
      (a, b) =>
        Number(b.id === priorityId) - Number(a.id === priorityId) ||
        b.score - a.score ||
        a.start - b.start,
    );
  const liveKw = Math.max(hubMetrics(s, hubId, now).currentPowerKw, active.reduce(
    (sum, x) => sum + (x.powerKw || byId(ports, x.portId).powerKw),
    0,
  ));
  // Confirmed reservations retain their entire time window. Priority only orders the queue.
  const checkpoints = [
    now,
    ...rows.flatMap((r) => [Math.max(now, r.start), r.end]),
  ];
  const peakKw = Math.max(
    liveKw,
    ...checkpoints.map((t) => {
      const inWindow = rows.filter((r) => r.start <= t && t < r.end);
      const extra = active.filter(
        (x) =>
          !rows.some((r) => r.id === x.scheduleId) ||
          (t === now && !inWindow.some((r) => r.id === x.scheduleId)),
      );
      return (
        inWindow.reduce((sum, r) => sum + r.powerKw, 0) +
        extra.reduce(
          (sum, x) => sum + (x.powerKw || byId(ports, x.portId).powerKw),
          0,
        )
      );
    }),
  );
  const signature = JSON.stringify([
    limit,
    priorityId,
    weights,
    ports.map((x) => [x.id, x.version, x.status, x.powerKw, x.blocked]),
    bookings.map((x) => [x.id, x.version, x.start, x.end, x.status]),
    rows.map((row) => {
      const vehicle = [...s.vehicles, ...s.privateVehicles].find((v) => v.id === row.vehicleId);
      return [row.id, vehicle?.soc, vehicle?.nextTripAt];
    }).sort((a, b) => a[0].localeCompare(b[0])),
    active.map((x) => x.id),
  ]);
  return { hubId, limit, liveKw, peakKw, rows, signature };
}

function applyPlan(s, p, { now }) {
  guardHubOnline(s, p.hubId, now);
  const live = proposeSchedule(s, p.hubId, now, p.priorityId);
  check(
    p.plan?.signature === live.signature,
    "Lịch hoặc tài nguyên đã thay đổi. Hãy xem lại đề xuất.",
  );
  check(
    live.rows.every((r) => !byId(s.ports, r.portId).blocked),
    "Kế hoạch chứa cổng đang bị cách ly.",
  );
  check(
    live.peakKw <= live.limit,
    "Các khung giờ đã xác nhận vượt giới hạn công suất Hub.",
  );
  const outcome = p.outcome || "ok";
  check(["ok", "timeout", "fault"].includes(outcome), "Phản hồi mô phỏng không hợp lệ.");
  const plan = {
    ...live,
    id: uid("PLAN"),
    createdAt: now,
    priorityId: p.priorityId || null,
    commandIds: [],
  };
  const scheduled = live.rows.filter((row) => ["SCHEDULED", "RESCHEDULED", "REPLACED", "PLUGGED"]
    .includes(byId(s.schedules, row.id).status));
  for (const command of s.deviceCommands) {
    if (command.planId && command.hubId === p.hubId && command.result === CONTROL_RESULT.PENDING)
      Object.assign(command, { result: CONTROL_RESULT.SKIPPED, resolvedAt: now, message: "Kế hoạch mới đã thay thế." });
  }
  for (const row of scheduled) {
    const command = queueControl(s, row.portId, CONTROL_COMMAND.START_CHARGING, now, {
      planId: plan.id, hubId: plan.hubId, scheduleId: row.id,
      outcome: !p.failurePortId || p.failurePortId === row.portId ? outcome : "ok",
    });
    plan.commandIds.push(command.id);
  }
  s.plans.push(plan);
  return "Đã lưu kế hoạch và " + plan.commandIds.length + " lệnh cấp điện chờ đủ điều kiện.";
}

function assetById(s, id) {
  return byId([...s.vehicles, ...s.slots, ...s.ports], id);
}

function handleIncident(s, act, p, { now }) {
  if (act === "open") {
    const incident = recordIncident(s, p.targetId, p.reason, now);
    return (
      "Hồ sơ " +
      incident.id +
      " đang chặn cấp phát mới và theo dõi các lịch bị ảnh hưởng."
    );
  }
  const i = byId(s.incidents, p.id),
    x = assetById(s, i.targetId);
  if (act === "stopCharging") {
    const schedule = s.schedules.find((row) => row.portId === x.id && row.status === "CHARGING");
    check(i.status !== "RESOLVED" && schedule, "Sự cố này không có phiên đang cấp điện.");
    const result = deenergize(s, schedule, now, p.outcome);
    i.lastControlId = result.lastControlId;
    i.status = "PENDING_CHECK";
    return result.operationError || "Đã xác nhận ngắt điện. Chờ người dùng rút cáp trước khi cách ly.";
  }
  if (act === "isolate") {
    check(
      ["ISOLATING", "PENDING_CHECK", "ALERT"].includes(i.status),
      "Sự cố đã được cách ly hoặc đóng.",
    );
    x.blocked = true;
    const busy =
      s.sessions.some(
        (r) => r.portId === x.id && ["CHARGING", "STOPPED"].includes(r.status),
      ) ||
      s.schedules.some((r) => r.portId === x.id && r.status === "PLUGGED") ||
      [
        "IN_USE",
        "RELOCATING",
        "CHARGING",
        "OCCUPIED_WAITING",
        "STOPPED",
      ].includes(x.status) ||
      (s.slots.includes(x) && Boolean(x.vehicleId || x.holdId || x.sensorOccupied)) ||
      (s.ports.includes(x) && Boolean(x.sensorPlugged || x.sensorRelayOn));
    const online = x.hubId && isHubOnline(s, x.hubId, now);
    const command = s.ports.includes(x) ? CONTROL_COMMAND.DENY_POWER : CONTROL_COMMAND.LOCK;
    const outcome = (p.outcome || "ok").toLowerCase();
    const control = !busy && online && !x.sensorOffline && !s.slots.includes(x)
      ? deviceResult(s, i, x, command, outcome, now)
      : null;
    if (busy || x.sensorOffline || !online || outcome !== "ok" || (control && control.result !== CONTROL_RESULT.DONE)) {
      i.status = "PENDING_CHECK";
      return busy
        ? "Đã chặn cấp phát. Hãy kết thúc phiên, rút cáp hoặc xác minh tài nguyên tại chỗ trước khi cách ly."
        : "Thiếu phản hồi thiết bị. Đang chờ xác minh an toàn.";
    }
    i.priorStatus = x.status;
    i.status = "ISOLATED";
    x.status = "OUT_OF_SERVICE";
    touch(x, now);
    return "Thiết bị xác nhận an toàn. Đã cách ly tài nguyên.";
  }
  if (act === "work") {
    check(
      ["ISOLATED", "IN_REPAIR"].includes(i.status),
      "Cần xác nhận cách ly trước khi gửi bảo trì.",
    );
    let w = s.workOrders.find((w) => w.incidentId === i.id);
    if (w?.status === "SENT") return "Phiếu " + w.id + " đã được tiếp nhận.";
    if (!w) {
      const teamId = p.teamId || s.teams.find((team) => team.type === "MAINTENANCE")?.id;
      check(s.teams.some((team) => team.id === teamId && team.type === "MAINTENANCE"), "Đơn vị bảo trì không hợp lệ.");
      w = { id: uid("WO"), incidentId: i.id, targetId: x.id, teamId, createdAt: now };
      s.workOrders.push(w);
    }
    w.status = p.outcome === "TIMEOUT" ? "PENDING_RESEND" : "SENT";
    if (w.status === "SENT") i.status = "IN_REPAIR";
    return (
      "Phiếu " +
      w.id +
      (w.status === "SENT"
        ? " đã được tiếp nhận."
        : " chờ gửi lại với cùng mã.")
    );
  }
  if (act === "resolve") {
    check(
      i.status === "IN_REPAIR",
      "Cần gửi phiếu bảo trì trước khi nghiệm thu.",
    );
    guardHubOnline(s, x.hubId, now);
    check(
      !i.affected?.some((id) =>
        [...s.reservations, ...s.schedules].some(
          (b) => b.id === id && b.status === "AFFECTED",
        ),
      ),
      "Cần xử lý các lịch bị ảnh hưởng trước khi đóng.",
    );
    x.blocked = false;
    x.status =
      s.slots.includes(x) && x.vehicleId
        ? "OCCUPIED"
        : s.vehicles.includes(x) && x.soc < s.config.params.MIN_SOC_BOOK_PCT
          ? "WAITING_CHARGE"
          : "AVAILABLE";
    touch(x, now);
    i.status = "RESOLVED";
    byId(
      s.workOrders,
      s.workOrders.find((w) => w.incidentId === i.id)?.id,
    ).status = "DONE";
    return "Đã nghiệm thu sửa chữa và mở cấp phát.";
  }
  check(
    act === "remedy" && i.affected?.includes(p.recordId),
    "Đặt chỗ không thuộc sự cố này.",
  );
  const b = byId([...s.reservations, ...s.schedules], p.recordId);
  check(b.status === "AFFECTED", "Đặt chỗ đã được xử lý.");
  const originalBooking = { ...b };
  if (p.decision === "CANCELLED") {
    if (b.depositStatus === "HELD") {
      byId(s.users, b.userId).held -= b.deposit;
      b.depositStatus = "RELEASED";
    }
    for (const child of s.schedules.filter(
      (c) =>
        c.reservationId === b.id &&
        ["SCHEDULED", "AFFECTED", "REPLACED", "RESCHEDULED"].includes(c.status),
    )) {
      child.status = "CANCELLED";
      touch(child, now);
    }
    b.status = "CANCELLED";
  } else {
    const key = b.portId
      ? "portId"
      : b.type === "PARKING"
        ? "slotId"
        : "vehicleId";
    const dest = assetById(s, p.replacementId || b[key]);
    const start =
      p.startMinutes !== undefined
        ? now + Number(p.startMinutes) * MINUTE
        : Number(p.start ?? b.start);
    const end =
      p.durationMinutes !== undefined
        ? start + Number(p.durationMinutes) * MINUTE
        : Number(p.end ?? b.end);
    check(
      ["RESCHEDULED", "REPLACED"].includes(p.decision),
      "Chọn cách xử lý lịch.",
    );
    check(
      usable(dest) && dest.hubId === b.hubId,
      "Chọn tài nguyên an toàn cùng Hub.",
    );
    guardHubOnline(s, dest.hubId, now);
    if (key === "vehicleId") {
      check(
        s.vehicles.includes(dest) && parkedVehicleReady(s, dest, now),
        "Xe thay thế chưa sẵn sàng.",
      );
      dest.status = "RESERVED";
      dest.reservationId = b.id;
      touch(dest, now);
      b.slotId = dest.slotId;
      b.expiresAt = now + s.config.params.T_HOLD_MIN * MINUTE;
    } else {
      check(
        Number.isFinite(start) &&
          Number.isFinite(end) &&
          end > start &&
          start >= now,
        "Chọn khung giờ tương lai hợp lệ.",
      );
      check(
        key === "portId"
          ? s.ports.includes(dest)
          : s.slots.includes(dest) && dest.type === "PRIVATE",
        "Sai loại tài nguyên thay thế.",
      );
      if (key === "portId") {
        const pv = byId(s.privateVehicles, b.vehicleId);
        check(
          !dest.connector || !pv.connector || dest.connector === pv.connector,
          "Cổng thay thế không tương thích.",
        );
        const parking = byId(s.reservations, b.reservationId);
        check(
          ["CONFIRMED", "CHECKED_IN", "REPLACED", "RESCHEDULED"].includes(
            parking.status,
          ) &&
            parking.start <= start &&
            end <= parking.end,
          "Khung giờ mới ngoài đơn đỗ xe.",
        );
        chargingWindowAvailable(s, dest, b.vehicleId, start, end, now);
      } else {
        parkingWindowAvailable(s, dest, b.vehicleId, start, end, now);
        check(
          !s.schedules.some(
            (r) =>
              r.reservationId === b.id &&
              activeSchedules.has(r.status) &&
              (r.start < start || r.end > end),
          ),
          "Lịch sạc liên quan nằm ngoài khung giờ mới.",
        );
      }
      b.start = start;
      b.end = end;
      if (key === "slotId")
        b.expiresAt = Math.min(end, start + s.config.params.T_GRACE_MIN * MINUTE);
    }
    b[key] = dest.id;
    b.status = p.decision;
    b.remedy = p.decision;
  }
  if (b.type === "VEHICLE")
    for (const old of s.vehicles.filter(
      (v) =>
        v.reservationId === b.id &&
        (p.decision === "CANCELLED" || v.id !== b.vehicleId),
    )) releaseVehicleHold(s, old, originalBooking, now);
  if (b.type === "PARKING") {
    for (const slot of s.slots.filter((row) => row.id === b.slotId || row.id === originalBooking.slotId))
      touch(slot, now);
  }
  b.remedyStatus = p.decision;
  touch(b, now);
  s.notifications.push({
    id: uid("NTF"),
    userId: b.userId,
    title: "Đã xử lý đặt chỗ",
    message: b.id + " · " + p.decision,
    at: now,
  });
  return "Đã cập nhật đặt chỗ và thông báo người dùng.";
}

function simulate(s, p, ctx) {
  const scenario = runSimulation(s, p, ctx);
  const { sourceId, destId, snapshot, forecast, durationMin } = scenario;
  const dest = byId(snapshot, destId);
  const preview = previewDispatch(s, sourceId, destId);
  const shortfall = forecast.at(-1).shortfall,
    n = Math.min(shortfall, preview.vehicles.length, preview.slots.length);
  const add = (type, body) =>
    s.recommendations.push({
      id: uid("REC"),
      scenarioId: scenario.id,
      createdAt: ctx.now,
      status: "PENDING",
      type,
      ...body,
    });
  if (n)
    add("REDISTRIBUTE", {
      sourceId,
      destId,
      vehicleIds: preview.vehicles.slice(0, n).map((v) => v.id),
      versions: preview.versions,
      capacityVersion: preview.capacityVersion,
      amount: n,
    });
  if (shortfall)
    add("REDIRECT_USERS", {
      sourceId,
      destId,
      availableAtSnapshot: dest.availableVehicles,
    });
  if (scenario.bottlenecks.some((item) => item.type === "CHARGING_OVERLOAD")) {
    const plan = proposeSchedule(s, destId, ctx.now);
    if (plan.rows.some((row) => !row.active) && plan.peakKw <= plan.limit)
      add("RESCHEDULE_CHARGING", { sourceId, destId, plan: { signature: plan.signature } });
  }
  return "Đã lưu dự báo " + durationMin + " phút trên bản chụp riêng.";
}

function recommendation(s, action, p, ctx) {
  if (action === "batch") {
    const scenario = byId(s.scenarios, p.scenarioId);
    const ids = p.ids;
    check(
      Array.isArray(ids) && ids.length && new Set(ids).size === ids.length,
      "Chọn ít nhất một khuyến nghị.",
    );
    const selected = ids.map((id) => byId(s.recommendations, id));
    check(
      selected.every(
        (r) => r.scenarioId === scenario.id && r.status === "PENDING",
      ),
      "Có khuyến nghị đã thay đổi. Hãy kiểm tra lại.",
    );
    // Validate the complete selection against a private draft before releasing any order.
    const draft = structuredClone(s);
    for (const r of selected.toSorted(
      (a, b) =>
        Number(a.type === "REDISTRIBUTE") - Number(b.type === "REDISTRIBUTE"),
    )) {
      const message = recommendation(draft, "apply", { id: r.id }, ctx),
        checked = byId(draft.recommendations, r.id);
      if (checked.status !== "APPLIED") {
        s.audit.push({
          id: uid("LOG"),
          userId: ctx.user.id,
          at: ctx.now,
          action: "recommendation.apply",
          targetId: r.id,
          message,
        });
        return "Đã dừng cả nhóm trước khi phát lệnh. " + message;
      }
      draft.audit.push({
        id: uid("LOG"),
        userId: ctx.user.id,
        at: ctx.now,
        action: "recommendation.apply",
        targetId: r.id,
        message,
      });
    }
    Object.assign(s, draft);
    return "Đã áp dụng " + ids.length + " khuyến nghị đã chọn.";
  }
  const r = byId(s.recommendations, p.id),
    scenario = byId(s.scenarios, r.scenarioId);
  if (action === "compensate") {
    check(r.status === "APPLIED", "Khuyến nghị chưa áp dụng hoặc đã xử lý bù.");
    if (r.type === "REDISTRIBUTE") {
      const order = byId(s.orders, r.orderId);
      if (order.status === "PENDING") {
        const message = changeOrder(s, "cancel", { id: order.id }, ctx);
        if (order.status !== "CANCELLED") {
          r.status = "PENDING_CHECK";
          r.note = message;
        }
      } else if (order.status === "CANCELLED") {
        // Older snapshots can contain a cancelled order and a still-sent assignment.
        const confirmed = ["CANCELLED", "RECALLED"].includes(order.assignmentStatus);
        r.status = confirmed ? "COMPENSATED" : "PENDING_CHECK";
        r.note = confirmed ? "Lệnh điều phối đã hủy."
          : "Lệnh đã hủy trong dữ liệu cũ. Cần đối soát việc thu hồi phân công.";
      } else {
        r.status = "PENDING_CHECK";
        r.note = "Đã vận chuyển. Đối soát từng xe trước khi lập lệnh phục hồi.";
      }
    } else if (r.type === "RESCHEDULE_CHARGING") {
      const commands = s.deviceCommands.filter((request) => request.planId === r.planId);
      for (const request of commands.filter((row) => row.result === CONTROL_RESULT.PENDING))
        Object.assign(request, { result: CONTROL_RESULT.SKIPPED, resolvedAt: ctx.now, message: "Đã hủy theo quyết định xử lý bù." });
      r.status = commands.some((request) => [CONTROL_RESULT.DONE, CONTROL_RESULT.TIMEOUT].includes(request.result))
        ? "PENDING_CHECK" : "COMPENSATED";
      if (r.status === "PENDING_CHECK") r.note = "Đối soát các cổng đã nhận lệnh trước khi thay đổi nguồn điện.";
    } else {
      const recipients = s.notifications.filter((notification) => notification.relatedId === r.id).map((notification) => notification.userId);
      for (const userId of recipients)
        appendNotification(s, {
          userId, type: NOTIFICATION_TYPE.INFO, relatedId: r.id,
          title: "Thu hồi hướng dẫn di chuyển", message: "Thông báo thay thế khuyến nghị " + r.id,
        }, ctx.now);
      r.status = "COMPENSATED";
    }
    return r.note || "Đã thực hiện hành động bù.";
  }
  check(r.status === "PENDING", "Khuyến nghị đã được xử lý.");
  if (action === "reject") {
    r.status = "REJECTED";
    r.reason = p.reason || "Vận hành viên từ chối";
    return "Đã từ chối khuyến nghị.";
  }
  check(action === "apply", "Thao tác khuyến nghị không hợp lệ.");
  try {
    guardHubOnline(s, r.sourceId, ctx.now);
    guardHubOnline(s, r.destId, ctx.now);
    check(
      scenario.snapshot
        .filter((h) => h.id === r.sourceId || h.id === r.destId)
        .every((h) => h.online),
      "Snapshot thiếu dữ liệu hiện hành của Hub liên quan.",
    );
    if (r.type === "REDISTRIBUTE") r.orderId = createOrder(s, r, ctx).id;
    else if (r.type === "RESCHEDULE_CHARGING") {
      applyPlan(s, { hubId: r.destId, plan: r.plan }, ctx);
      r.planId = s.plans.at(-1).id;
    } else {
      const dest = hubMetrics(s, r.destId, ctx.now),
        source = hubMetrics(s, r.sourceId, ctx.now);
      check(
        dest.availableVehicles === r.availableAtSnapshot &&
          source.availableVehicles > 0,
        "Nguồn xe đã thay đổi. Chạy lại mô phỏng.",
      );
      const sent = notifyRedirect(s, "Gợi ý Hub nhận xe",
        "Dự báo thiếu xe tại " + r.destId + ". Kiểm tra xe tại " + r.sourceId + ".", r.id, ctx.now);
      r.note = "Đã gửi " + sent.length + " thông báo theo giới hạn tần suất.";
    }
    r.status = "APPLIED";
    return "Đã kiểm tra hiện trạng và áp dụng khuyến nghị.";
  } catch (error) {
    // All dispatch preconditions are checked before the first resource update.
    r.status = "FAILED";
    r.note = error.message;
    return "Dừng áp dụng: " + error.message;
  }
}

export function operatorCommand(state, action, payload, ctx) {
  check(
    ctx.user?.id === state.userId &&
      state.users
        .find((u) => u.id === state.userId)
        ?.roles.includes(ROLE.OPERATOR),
    "Tài khoản không có quyền vận hành.",
  );
  const [group, op] = action.split(".");
  let message;
  switch (group) {
    case "dispatch":
      message = changeOrder(state, op, payload, ctx);
      break;
    case "schedule":
      check(op === "apply", "Lệnh lập lịch không hợp lệ.");
      message = applyPlan(state, payload, ctx);
      break;
    case "incident":
      message = handleIncident(state, op, payload, ctx);
      break;
    case "simulation":
      check(["run", "template"].includes(op), "Lệnh mô phỏng không hợp lệ.");
      message = op === "run" ? simulate(state, payload, ctx)
        : "Đã lưu mẫu " + saveScenarioTemplate(state, payload, ctx).name + ".";
      break;
    case "recommendation":
      message = recommendation(state, op, payload, ctx);
      break;
    case "telemetry":
      check(op === "emit", "Lệnh telemetry không hợp lệ.");
      message = receivePacket(state, payload, ctx);
      break;
    default:
      throw new Error("Chức năng vận hành không tồn tại.");
  }
  state.audit.push({
    id: uid("LOG"),
    userId: ctx.user.id,
    at: ctx.now,
    action,
    targetId: payload.id || payload.hubId || payload.targetId || payload.destId,
    message,
  });
  return message;
}
