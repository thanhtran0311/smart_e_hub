import test from "node:test";
import assert from "node:assert/strict";
import { demoStore } from "./seed.mjs";
import {
  operatorCommand,
  previewDispatch,
  proposeSchedule,
} from "../../src/application/operator.js";
import { operatorView } from "../../src/pages/operator/views.js";
import { hubMetrics } from "../../src/domain/resources.js";
import { processPendingEffects } from "../../src/application/pending-effects.js";
import { studentCommand } from "../../src/application/student.js";
import { checkSensorTimeouts, triggerRebalanceAlertIfNeeded } from "../../src/application/telemetry.js";

async function setup() {
  let tick = 1770000000000;
  const store = await demoStore({ now: () => tick++ });
  store.login("operator01", "123456");
  const run = (action, p = {}) => {
    const result = store.transaction((s, now) =>
      operatorCommand(s, action, p, { user: store.user, now }),
    );
    processPendingEffects(store);
    return result;
  };
  const order = (n = 1) => {
    const preview = previewDispatch(store.state, "H-01", "H-02");
    return {
      sourceId: "H-01",
      destId: "H-02",
      versions: preview.versions,
      capacityVersion: preview.capacityVersion,
      vehicleIds: preview.vehicles.slice(0, n).map((v) => v.id),
    };
  };
  return { store, run, order };
}

test("UC08–09 holds capacity, tracks four arrivals out of five, releases the unused hold", async () => {
  const { store, run, order } = await setup();
  const baseline = hubMetrics(store.state, "H-02", store.now());
  const p = order(5);
  run("dispatch.create", p);
  const id = store.state.orders[0].id;
  assert.equal(
    hubMetrics(store.state, "H-02", store.now()).freeSlots,
    baseline.freeSlots - 5,
  );
  assert.equal(store.state.slots.filter((x) => x.holdId === id).length, 5);
  assert.throws(() => run("dispatch.create", p));
  run("dispatch.start", { id });
  assert.throws(() => run("dispatch.cancel", { id }));
  p.vehicleIds.forEach((vehicleId, n) =>
    run("dispatch.receive", { id, vehicleId, success: n < 4 }),
  );
  assert.equal(store.state.orders[0].status, "PARTIALLY_COMPLETED");
  assert.equal(store.state.slots.filter((x) => x.holdId === id).length, 0);
  assert.equal(
    hubMetrics(store.state, "H-02", store.now()).freeSlots,
    baseline.freeSlots - 4,
  );
  assert.equal(
    store.state.vehicles.find((x) => x.id === p.vehicleIds[4]).status,
    "PENDING_CHECK",
  );
  assert.throws(() =>
    run("dispatch.receive", { id, vehicleId: p.vehicleIds[4], success: true }),
  );
});

test("UC09 rejects stale vehicle versions and releases a cancelled dispatch completely", async () => {
  const { store, run, order } = await setup(),
    p = order();
  store.transaction(
    (s) => s.vehicles.find((v) => v.id === p.vehicleIds[0]).version++,
  );
  assert.throws(() => run("dispatch.create", p));
  assert.equal(store.state.orders.length, 0);
  const current = order();
  store.transaction((s, now) => operatorCommand(s, "dispatch.create", current, { user: store.user, now }));
  const { id } = store.state.orders[0];
  assert.equal(store.state.orders[0].assignmentStatus, "PENDING");
  run("dispatch.cancel", { id });
  assert.equal(store.state.orders[0].assignmentStatus, "CANCELLED");
  assert.equal(store.state.slots.filter((x) => x.holdId).length, 0);
  assert.equal(
    store.state.vehicles.find((v) => v.id === p.vehicleIds[0]).status,
    "AVAILABLE",
  );
});

test("UC10 keeps confirmed windows and energized session intact; rejects stale plan", async () => {
  const { store, run } = await setup(),
    before = store.state;
  const priorityId = before.schedules.find((row) => row.hubId === "H-01" && row.status === "SCHEDULED").id;
  const plan = proposeSchedule(before, "H-01", store.now(), priorityId);
  run("schedule.apply", {
    hubId: "H-01",
    plan,
    priorityId,
  });
  assert.deepEqual(store.state.sessions, before.sessions);
  assert.deepEqual(store.state.schedules, before.schedules);
  assert.deepEqual(store.state.ports, before.ports);
  assert.equal(store.state.plans[0].rows[0].id, priorityId);
  store.transaction((s) => s.ports.find((x) => x.hubId === "H-01").version++);
  assert.throws(() => run("schedule.apply", { hubId: "H-01", plan, priorityId }));
});

test("UC11 blocks allocations, requires physical safety, records affected booking and work retry", async () => {
  const { store, run } = await setup();
  const future = store.state.schedules.find((x) => x.status === "SCHEDULED"),
    targetId = future.portId;
  run("incident.open", { targetId, reason: "Mất phản hồi cổng" });
  const id = store.state.incidents.at(-1).id;
  assert.equal(store.state.incidents.at(-1).category, "CHARGING_PORT");
  assert.equal(store.state.incidents.at(-1).severity, "HIGH");
  assert.throws(() => run("incident.classify", { id, category: "SENSOR", severity: "INVALID" }), /mức độ/);
  run("incident.classify", { id, category: "SENSOR", severity: "CRITICAL" });
  assert.equal(
    store.state.schedules.find((x) => x.id === future.id).status,
    "AFFECTED",
  );
  run("incident.isolate", { id, outcome: "OK" });
  assert.equal(store.state.incidents.at(-1).status, "PENDING_CHECK");
  assert.equal(
    store.state.ports.find((x) => x.id === targetId).status,
    "CHARGING",
  );
  const { studentCommand } = await import("../../src/application/student.js");
  const active = store.state.sessions.find((x) => x.status === "CHARGING"),
    user = store.state.users.find((u) => u.id === active.userId);
  store.login(user.username, user.password);
  for (const action of ["stopCharging", "unplugCharger"])
    store.transaction((s, now) =>
      studentCommand(
        s,
        action,
        { scheduleId: active.scheduleId },
        { user, now },
      ),
    );
  store.login("operator01", "123456");
  run("incident.isolate", { id, outcome: "OK" });
  run("incident.work", { id, outcome: "TIMEOUT" });
  const code = store.state.workOrders.at(-1).id;
  assert.equal(store.state.workOrders.at(-1).priority, "CRITICAL");
  run("incident.work", { id, outcome: "OK" });
  assert.equal(store.state.workOrders.length, 1);
  assert.equal(store.state.workOrders[0].id, code);
  assert.equal(store.state.workOrders[0].priority, "CRITICAL");
  run("incident.remedy", { id, recordId: future.id, decision: "CANCELLED" });
  run("incident.resolve", { id });
  assert.equal(store.state.ports.find((x) => x.id === targetId).blocked, false);
  assert.equal(store.state.workOrders[0].status, "DONE");
});

test("UC12–13 isolates forecast, revalidates stale dispatch and compensates a released command", async () => {
  const { store, run, order } = await setup(),
    s = store.state,
    p = { sourceId: "H-01", destId: "H-02", durationMin: 60, demandPct: 200 };
  run("simulation.run", p);
  assert.deepEqual(store.state.vehicles, s.vehicles);
  const scenario = store.state.scenarios.at(-1);
  assert.ok(scenario.snapshot.some((h) => !h.online));
  assert.equal(scenario.forecast.length, 4);
  const r = store.state.recommendations.find((x) => x.type === "REDISTRIBUTE");
  run("dispatch.create", order());
  run("recommendation.apply", { id: r.id });
  assert.equal(
    store.state.recommendations.find((x) => x.id === r.id).status,
    "FAILED",
  );
  assert.equal(store.state.orders.length, 1);
  run("simulation.run", p);
  const retry = store.state.recommendations.findLast(
    (x) => x.type === "REDISTRIBUTE",
  );
  run("recommendation.apply", { id: retry.id });
  assert.equal(store.state.orders.length, 2);
  const applied = store.state.orders.at(-1);
  assert.equal(applied.assignmentStatus, "SENT");
  assert.throws(() => run("dispatch.confirmRecall", { id: applied.id }), /chưa yêu cầu thu hồi/);
  run("recommendation.compensate", { id: retry.id });
  assert.equal(store.state.orders.at(-1).status, "PENDING");
  assert.equal(store.state.orders.at(-1).assignmentStatus, "RECALL_REQUESTED");
  assert.equal(store.state.recommendations.find((item) => item.id === retry.id).status, "PENDING_CHECK");
  assert.equal(store.state.slots.filter((slot) => slot.holdId === applied.id).length, applied.items.length);
  assert.match(operatorView("what-if", store.state, store.now(), {}), /dispatch.confirmRecall/);
  run("dispatch.confirmRecall", { id: applied.id });
  assert.equal(store.state.orders.at(-1).status, "CANCELLED");
  assert.equal(store.state.orders.at(-1).assignmentStatus, "RECALLED");
  assert.equal(store.state.slots.some((slot) => slot.holdId === applied.id), false);
  assert.equal(store.state.recommendations.find((item) => item.id === retry.id).status, "COMPENSATED");
  run("dispatch.confirmRecall", { id: applied.id });
  assert.throws(() => run("dispatch.start", { id: applied.id }), /đã đóng/);
});

test("UC14 ignores duplicate, stale, corrupt telemetry and blocks offline commits until live recovery", async () => {
  const { store, run, order } = await setup(),
    v = store.state.vehicles.find((x) => x.hubId === "H-01"),
    p = { hubId: v.hubId, deviceId: v.id };
  run("telemetry.emit", { ...p, mode: "live", battery: 70 });
  run("telemetry.emit", { ...p, mode: "duplicate", battery: 2 });
  run("telemetry.emit", { ...p, mode: "late", battery: 2 });
  run("telemetry.emit", { ...p, mode: "corrupt" });
  assert.equal(store.state.vehicles.find((x) => x.id === v.id).soc, 70);
  assert.deepEqual(
    store.state.telemetry.slice(-4).map((e) => e.result),
    ["APPLIED", "IGNORED_DUPLICATE", "IGNORED_STALE", "REJECTED_CORRUPT"],
  );
  run("telemetry.emit", { ...p, mode: "offline" });
  assert.equal(hubMetrics(store.state, v.hubId, store.now()).online, false);
  assert.throws(() => run("dispatch.create", order()));
  run("telemetry.emit", { ...p, mode: "live", battery: 71 });
  run("dispatch.create", order());
});

test("UC13 selected group validates atomically, supports compensating an in-transit order", async () => {
  const { store, run, order } = await setup();
  const inputs = {
    sourceId: "H-01",
    destId: "H-02",
    durationMin: 60,
    demandPct: 200,
  };
  run("simulation.run", inputs);
  const select = () => ({
    scenarioId: store.state.scenarios.at(-1).id,
    ids: store.state.recommendations
      .filter((r) => r.scenarioId === store.state.scenarios.at(-1).id)
      .map((r) => r.id),
  });
  run("dispatch.create", order());
  const before = store.state;
  run("recommendation.batch", select());
  assert.deepEqual(store.state.orders, before.orders);
  assert.deepEqual(store.state.notifications, before.notifications);
  run("simulation.run", inputs);
  run("recommendation.batch", select());
  assert.equal(store.state.orders.length, before.orders.length + 1);
  const rec = store.state.recommendations.findLast(
    (r) => r.type === "REDISTRIBUTE",
  );
  run("dispatch.start", { id: rec.orderId });
  run("recommendation.compensate", { id: rec.id });
  assert.equal(store.state.orders.at(-1).status, "IN_TRANSIT");
  assert.equal(
    store.state.recommendations.find((r) => r.id === rec.id).status,
    "PENDING_CHECK",
  );
});

test("UC13 nhận xác nhận xuất phát trong lúc thu hồi thì giữ ô và chờ đối soát", async () => {
  const { store, run } = await setup();
  run("simulation.run", { sourceId: "H-01", destId: "H-02", durationMin: 60, demandPct: 200 });
  const { id } = store.state.recommendations.find((item) => item.type === "REDISTRIBUTE");
  run("recommendation.apply", { id });
  const order = store.state.orders.at(-1);
  run("recommendation.compensate", { id });
  run("dispatch.start", { id: order.id });
  assert.throws(() => run("dispatch.confirmRecall", { id: order.id }), /đã rời Hub/);
  assert.equal(store.state.orders.at(-1).status, "IN_TRANSIT");
  assert.equal(store.state.slots.filter((slot) => slot.holdId === order.id).length, order.items.length);
  const rec = store.state.recommendations.find((item) => item.id === id);
  assert.equal(rec.status, "PENDING_CHECK");
  assert.match(rec.note, /Xe đã rời Hub/);
});

test("UC08 hiển thị thời điểm cập nhật riêng của từng Hub ngay trong bảng", async () => {
  const { store } = await setup();
  const markup = operatorView("network-dashboard", store.state, store.now(), {});
  const rows = markup.match(/<tbody>([\s\S]*?)<\/tbody>/)[1].match(/<tr>[\s\S]*?<\/tr>/g);
  assert.equal(rows.length, store.state.hubs.length);
  for (const hub of store.state.hubs) {
    const row = rows.find((html) => html.includes(hub.id));
    assert.ok(row.includes('<time datetime="' + new Date(hub.lastTelemetryAt).toISOString() + '">'));
    if (hub.offline) assert.match(row, /Dữ liệu cũ/);
  }
});

test("UC08 cảnh báo thiếu xe chỉ phát lại sau khi Hub phục hồi rồi thiếu xe trở lại", async () => {
  const { store } = await setup();
  const alerts = () => store.state.notifications.filter((row) =>
    row.relatedId === "H-02" && row.title === "Cảnh báo thiếu xe khả dụng");
  store.transaction(triggerRebalanceAlertIfNeeded);
  store.transaction(triggerRebalanceAlertIfNeeded);
  assert.equal(alerts().length, 1);
  assert.match(operatorView("network-dashboard", store.state, store.now(), {}), /Cần điều phối/);
  const evaluate = (ratio) => store.transaction((state, now) => {
    state.config.params.HUB_LOW_AVAIL_RATIO = ratio;
    triggerRebalanceAlertIfNeeded(state, now);
  });
  evaluate(0);
  evaluate(0.1);
  assert.equal(alerts().length, 2);
  const preview = previewDispatch(store.state, "H-03", "H-02");
  assert.ok(preview.vehicles.length > 0);
  assert.ok(!preview.vehicles.some((vehicle) => vehicle.id === "E-304"));
});

test("UC11 đổi ô kiểm tra trùng lịch cho cùng xe ở ô khác", async () => {
  const { store, run } = await setup();
  store.login("student01", "123456");
  const free = store.state.slots.filter((slot) =>
    slot.hubId === "H-01" && slot.type === "PRIVATE" && slot.status === "AVAILABLE"
  );
  const now = store.now();
  const minute = 60_000;
  const reserve = (slot, start, end) => store.transaction((state, at) =>
    studentCommand(state, "bookParking", {
      slotId: slot.id, vehicleId: "PV-01", expectedVersion: slot.version,
      start: now + start * minute, end: now + end * minute,
    }, { user: store.user, now: at }));
  const first = reserve(free[0], 10, 20);
  const second = reserve(free[1], 30, 50);
  store.login("operator01", "123456");
  run("incident.open", { targetId: first.slotId, reason: "Chốt lỗi" });
  const payload = { id: store.state.incidents.at(-1).id, recordId: first.id,
    decision: "REPLACED", replacementId: free[2].id, startMinutes: 35, durationMinutes: 10 };
  const before = store.state;
  assert.throws(() => run("incident.remedy", payload), /trùng giờ/);
  assert.equal(store.state, before);
  run("incident.remedy", { ...payload, start: now + 55 * minute, end: now + 60 * minute, startMinutes: undefined, durationMinutes: undefined });
  assert.equal(store.state.reservations.find((row) => row.id === second.id).status, "CONFIRMED");
  const replaced = store.state.reservations.find((row) => row.id === first.id);
  assert.equal(replaced.status, "REPLACED");
  assert.equal(replaced.slotId, free[2].id);
  assert.equal(replaced.expiresAt, replaced.end);
});

test("UC11 hủy đơn do chốt lỗi giữ xe chờ đối soát thay vì AVAILABLE", async () => {
  const { store, run } = await setup();
  store.login("student01", "123456");
  const reservation = store.transaction((state, now) => studentCommand(state, "bookVehicle",
    { vehicleId: "E-102", expectedVersion: 1 }, { user: store.user, now }));
  store.login("operator01", "123456");
  run("incident.open", { targetId: reservation.slotId, reason: "Chốt lỗi" });
  run("incident.remedy", {
    id: store.state.incidents.at(-1).id, recordId: reservation.id, decision: "CANCELLED",
  });
  const vehicle = store.state.vehicles.find((row) => row.id === reservation.vehicleId);
  assert.equal(vehicle.status, "PENDING_CHECK");
  assert.equal(vehicle.reservationId, null);
  assert.equal(store.state.slots.find((slot) => slot.id === reservation.slotId).vehicleId, vehicle.id);
});

test("UC12 hạ độ tin cậy khi cảm biến quá hạn dù mọi Hub vẫn trực tuyến", async () => {
  const { store, run } = await setup();
  run("telemetry.emit", { hubId: "H-05", mode: "live" });
  const packet = { hubId: "H-01", deviceId: "E-102", battery: 85 };
  run("telemetry.emit", packet);
  store.advance(2);
  const scenario = { sourceId: "H-01", destId: "H-02", durationMin: 60, demandPct: 200 };
  run("simulation.run", scenario);
  const stale = store.state.scenarios.at(-1);
  assert.ok(stale.snapshot.every((hub) => hub.online));
  assert.deepEqual(stale.snapshot.find((hub) => hub.id === "H-01").staleSensorIds, ["E-102"]);
  assert.equal(stale.confidence, "LIMITED");
  const markup = operatorView("what-if", store.state, store.now(), {});
  assert.match(markup, /Độ tin cậy hạn chế/);
  assert.match(markup, /cảm biến có dữ liệu cũ E-102/);
  run("telemetry.emit", packet);
  run("simulation.run", scenario);
  assert.equal(store.state.scenarios.at(-1).confidence, "HIGH");
  assert.equal(store.state.scenarios.at(-2).confidence, "LIMITED");
});

test("Operator routes render and Student role cannot invoke an Operator handler", async () => {
  const { store, run } = await setup();
  for (const slug of [
    "network-dashboard",
    "vehicle-dispatch",
    "charging-schedule",
    "incidents",
    "what-if",
    "telemetry",
  ]) {
    assert.match(operatorView(slug, store.state, store.now(), {}), /<section/);
  }
  store.login("student01", "123456");
  assert.throws(
    () => run("telemetry.emit", { hubId: "H-01", mode: "offline" }),
    /quyền/,
  );
});

test("UC09 gửi phân công sau commit và chặn xuất phát khi ô đích bị cách ly", async () => {
  const { store, run, order } = await setup();
  const payload = order();
  store.transaction((s, now) => operatorCommand(s, "dispatch.create", payload, { user: store.user, now }));
  const { id, items } = store.state.orders.at(-1);
  assert.equal(store.state.orders.at(-1).assignmentStatus, "PENDING");
  assert.throws(() => run("dispatch.start", { id }), /Chưa gửi phân công/);
  processPendingEffects(store);
  assert.equal(store.state.orders.at(-1).assignmentStatus, "SENT");
  run("incident.open", { targetId: items[0].slotId, reason: "Lỗi chốt đích" });
  assert.throws(() => run("dispatch.start", { id }), /đã thay đổi/);
  assert.equal(store.state.slots.find((slot) => slot.id === items[0].originSlotId).vehicleId, payload.vehicleIds[0]);
  assert.equal(store.state.orders.at(-1).status, "PENDING");
});

test("UC10 giữ kế hoạch theo version và xử lý kết quả độc lập từng cổng sau commit", async () => {
  const { store, run } = await setup();
  const start = store.now();
  const end = start + 30 * 60_000;
  for (const [account, vehicleId, slotId, portId] of [
    ["student01", "PV-01", "P-01-14", "CHG-01-02"],
    ["dual01", "PV-03", "P-01-15", "CHG-01-03"],
  ]) {
    store.login(account, "123456");
    const student = (action, input) => store.transaction((state, now) =>
      studentCommand(state, action, input, { user: store.user, now }));
    const booking = student("bookParking", { vehicleId, slotId, start, end, expectedVersion: 1 });
    student("checkInParking", { reservationId: booking.id });
    const schedule = student("bookCharging", { reservationId: booking.id, portId, start, end, expectedVersion: 1 });
    student("plugCharger", { scheduleId: schedule.id, code: schedule.code });
  }
  store.login("operator01", "123456");
  const stale = proposeSchedule(store.state, "H-01", store.now());
  store.transaction((state) => { state.schedules.at(-1).version++; });
  assert.throws(() => run("schedule.apply", { hubId: "H-01", plan: stale }), /đã thay đổi/);
  const live = proposeSchedule(store.state, "H-01", store.now());
  store.transaction((state, now) => operatorCommand(state, "schedule.apply", {
    hubId: "H-01", plan: live, outcome: "timeout", failurePortId: "CHG-01-03",
  }, { user: store.user, now }));
  assert.ok(store.state.deviceCommands.every((request) => request.result === "PENDING"));
  assert.equal(store.state.ports.find((port) => port.id === "CHG-01-02").relayOn, false);
  processPendingEffects(store);
  const result = (id) => store.state.deviceCommands.find((request) => request.targetId === id);
  assert.equal(result("CHG-01-02").result, "DONE");
  const failure = result("CHG-01-03");
  assert.equal(failure.result, "TIMEOUT");
  assert.equal(failure.deadlineAt - failure.requestedAt, 10_000);
  assert.equal(store.state.ports.find((port) => port.id === "CHG-01-03").relayOn, false);
  const count = store.state.sessions.length;
  processPendingEffects(store);
  assert.equal(store.state.sessions.length, count);
});

test("UC07–11 ghi mã lỗi ngắt sạc, operator yêu cầu ngắt an toàn và giữ cáp để đối soát", async () => {
  const { store, run } = await setup();
  const { scheduleId, portId } = store.state.sessions[0];
  store.login("student02", "123456");
  store.transaction((state, now) =>
    studentCommand(state, "stopCharging", { scheduleId, outcome: "fault" }, { user: store.user, now }));
  assert.equal(store.state.sessions[0].faultCode, "DEVICE_FAULT");
  assert.equal(store.state.deviceCommands.at(-1).id, store.state.sessions[0].lastControlId);
  assert.equal(store.state.ports.find((port) => port.id === portId).relayOn, true);
  store.login("operator01", "123456");
  const { id } = store.state.incidents.at(-1);
  run("incident.stopCharging", { id, outcome: "ok" });
  const port = store.state.ports.find((row) => row.id === portId);
  assert.equal(port.relayOn, false);
  assert.equal(port.plugged, true);
  assert.equal(store.state.sessions[0].status, "STOPPED");
  run("incident.isolate", { id, outcome: "OK" });
  assert.equal(store.state.incidents.at(-1).status, "PENDING_CHECK");
});

test("UC14 nhận telemetry ô/cổng, lập hồ sơ lỗi và theo dõi timeout từng cảm biến", async () => {
  const { store, run } = await setup();
  run("telemetry.emit", { hubId: "H-01", deviceId: "P-01-14", occupied: true, fault: "Lệch chốt" });
  const slot = store.state.slots.find((row) => row.id === "P-01-14");
  assert.equal(slot.sensorOccupied, true);
  assert.equal(slot.vehicleId, null);
  assert.equal(store.state.incidents.at(-1).targetId, slot.id);
  run("telemetry.emit", { hubId: "H-01", deviceId: "CHG-01-02", plugged: false, relayOn: false });
  store.advance(2);
  store.transaction(checkSensorTimeouts);
  assert.equal(store.state.sensors.find((row) => row.id === "CHG-01-02").online, false);
  assert.equal(store.state.hubs[0].offline, false);
  run("telemetry.emit", { hubId: "H-01", deviceId: "CHG-01-02", plugged: false, relayOn: false });
  assert.equal(store.state.sensors.find((row) => row.id === "CHG-01-02").online, true);
});

test("UC12 lưu mẫu, chạy lại và báo ba loại điểm nghẽn trên bản chụp", async () => {
  const { store, run } = await setup();
  const input = { sourceId: "H-01", destId: "H-02", demandPct: 500, durationMin: 480 };
  run("simulation.template", input);
  const template = store.state.scenarios.at(-1);
  assert.equal(template.status, "DRAFT");
  run("simulation.run", { templateId: template.id });
  const scenario = store.state.scenarios.at(-1);
  assert.equal(scenario.templateId, template.id);
  assert.deepEqual(scenario.bottlenecks.map((row) => row.type),
    ["VEHICLE_SHORTAGE", "PARKING_FULL", "CHARGING_OVERLOAD"]);
  assert.ok(scenario.forecast.every((row) => Number.isFinite(row.projectedKw)));
});
