import test from "node:test";
import assert from "node:assert/strict";
import { demoStore } from "./seed.mjs";
import { operatorCommand } from "../../src/application/operator.js";
import {
  studentCommand,
  expireStudentHolds,
  searchHubs,
  chargeReading,
  getNearbyHubs,
  validateBooking,
  ParkingService,
  ChargingScheduleService,
  TripService,
} from "../../src/application/student.js";

const epoch = Date.UTC(2026, 10, 25, 1);
const minute = 60000;
async function setup(storage) {
  const store = await demoStore({ now: () => epoch, storage });
  store.login("student01", "123456");
  const run = (action, input) =>
    store.transaction((state, now) =>
      studentCommand(state, action, input, { user: store.user, now }),
    );
  const advance = (minutes) => {
    store.advance(minutes);
    store.transaction(expireStudentHolds);
  };
  const parking = (
    start = epoch,
    end = epoch + 60 * minute,
    slotId = "P-01-14",
  ) => run("bookParking", {
    slotId, vehicleId: "PV-01", start, end,
    expectedVersion: store.state.slots.find((row) => row.id === slotId).version,
  });
  return { store, run, advance, parking };
}

test("UC01–02 tìm theo khu vực và pin; hai sinh viên cùng xác nhận một phiên bản xe", async () => {
  const { store, run } = await setup();
  const matches = searchHubs(
    store.state,
    { query: "metro", type: "BIKE", minSoc: 80 },
    epoch,
  );
  assert.ok(matches[0].vehicles.some((v) => v.id === "E-102"));
  const input = { vehicleId: "E-102", expectedVersion: 1 };
  run("bookVehicle", input);
  store.login("student02", "123456");
  assert.throws(() => run("bookVehicle", input), /thay đổi/);
  assert.equal(
    store.state.reservations.filter((row) => row.vehicleId === "E-102").length,
    1,
  );
});

test("UC02–03 check-in trước hạn giữ xe vẫn được tiếp tục khi đồng hồ bước qua phút 15", async () => {
  const { store, run, advance } = await setup();
  const { id } = run("bookVehicle", { vehicleId: "E-102", expectedVersion: 1 });
  advance(14.5);
  const input = { reservationId: id, code: "E-102" };
  run("beginPickup", input);
  advance(1);
  assert.equal(
    store.state.reservations.find((r) => r.id === id).status,
    "CHECKING_IN",
  );
  assert.match(
    run("unlockAck", { ...input, outcome: "timeout" }).operationError,
    /chưa phản hồi/,
  );
  run("unlockAck", input);
  assert.equal(store.state.slots[0].status, "OCCUPIED");
  const trip = run("confirmPickup", input);
  assert.equal(store.state.slots[0].status, "OCCUPIED");
  run("leaveSlot", { tripId: trip.id });
  assert.equal(store.state.slots[0].status, "AVAILABLE");
});

test("UC02 xem trước không giữ xe và kiểm tra lại version khi xác nhận", async () => {
  const { store, run } = await setup();
  const before = store.state;
  const preview = validateBooking(before, { vehicleId: "E-102", expectedVersion: 1 }, {
    user: store.user, now: epoch,
  });
  assert.equal(preview.expectedVersion, 1);
  assert.equal(store.state, before);
  assert.equal(before.vehicles.find((row) => row.id === preview.vehicleId).status, "AVAILABLE");
  store.transaction((state) => { state.vehicles.find((row) => row.id === preview.vehicleId).version++; });
  assert.throws(() => run("bookVehicle", preview), /vừa thay đổi/);
  assert.equal(store.state.reservations.length, before.reservations.length);
});

test("UC03 chỉ mở khóa xe đang sạc sau xác nhận ngắt điện và rút cáp", async () => {
  const { store, run } = await setup();
  const vehicle = () => store.state.vehicles.find((row) => row.id === "E-304");
  const port = () => store.state.ports.find((row) => row.id === "CHG-03-01");
  const session = () => store.state.sessions.find((row) => row.id === "CSS-FLEET-01");
  const { id } = run("bookVehicle", { vehicleId: vehicle().id, expectedVersion: vehicle().version });
  const input = { reservationId: id, code: vehicle().id };
  assert.throws(() => run("stopChargingSafely", input), /yêu cầu nhận xe/i);
  run("beginPickup", input);
  assert.throws(() => run("unlockAck", input), /rút cáp/);
  assert.throws(() => run("disconnectPickupCharger", input), /ngắt điện/);
  const timedOut = run("stopChargingSafely", { ...input, outcome: "timeout" });
  assert.equal(store.state.deviceCommands.at(-1).id, timedOut.lastChargingControlId);
  assert.equal(store.state.deviceCommands.at(-1).result, "TIMEOUT");
  assert.equal(port().relayOn, true);
  assert.equal(vehicle().locked, true);

  run("stopChargingSafely", input);
  assert.equal(port().relayOn, false);
  assert.equal(port().plugged, true);
  assert.equal(session().status, "STOPPED");
  assert.throws(() => run("unlockAck", input), /rút cáp/);
  run("disconnectPickupCharger", input);
  assert.equal(port().status, "AVAILABLE");
  assert.equal(session().status, "COMPLETED");
  run("unlockAck", input);
  assert.equal(run("confirmPickup", input).vehicleId, vehicle().id);
});

test("UC04 sau khi khóa, lỗi ghi lúc hoàn tất vẫn giữ bằng chứng cho lần đối soát lại", async () => {
  let fail = false;
  const { store, run, advance } = await setup({
    getItem: () => null,
    setItem: () => {
      if (fail) throw Error("disk");
    },
  });
  const { id } = run("bookVehicle", { vehicleId: "E-102", expectedVersion: 1 });
  const input = { reservationId: id, code: "E-102" };
  run("beginPickup", input);
  run("unlockAck", input);
  const trip = run("confirmPickup", input);
  const end = { tripId: trip.id, hubId: "H-02", vehicleId: "E-102" };
  run("leaveSlot", end);
  const dock = run("requestReturn", end);
  assert.throws(() => run("lockReturn", { ...end, slotId: "P-00" }), /chốt/);
  assert.throws(() => run("lockReturn", { ...end, slotId: dock.returnSlotId, dockEvidence: "missing" }), /Cảm biến/);
  advance(3);
  run("lockReturn", { ...end, slotId: dock.returnSlotId });
  const event = store.state.telemetry.at(-1);
  assert.equal(event.source, "RETURN_DOCK");
  assert.equal(event.eventId, store.state.trips[0].parkingEvidence.eventId);
  fail = true;
  assert.throws(() => run("finishReturn", end), /lưu/);
  assert.equal(store.state.trips[0].status, "PENDING_VERIFICATION");
  assert.equal(
    store.state.slots.find((s) => s.id === dock.returnSlotId).holdId,
    trip.id,
  );
  fail = false;
  run("finishReturn", { ...end, issueDescription: "Tay phanh lỏng" });
  assert.equal(store.state.trips[0].status, "COMPLETED");
  assert.equal(store.state.trips[0].issueDescription, "Tay phanh lỏng");
  assert.equal(TripService.getTripSummary(store.state, trip.id, store.user, store.now()).durationMinutes, 3);
  assert.equal(store.state.incidents.at(-1).reason, "Tay phanh lỏng");
  assert.equal(
    store.state.vehicles.find((v) => v.id === "E-102").hubId,
    "H-02",
  );
});

test("UC02 hủy giữ xe lưu lý do và hết hạn sinh đúng một thông báo", async () => {
  const { store, run, advance } = await setup();
  const first = run("bookVehicle", { vehicleId: "E-102", expectedVersion: 1 });
  run("cancelBooking", { reservationId: first.id, reason: "Đổi lịch học" });
  assert.equal(store.state.reservations.find((row) => row.id === first.id).cancelReason, "Đổi lịch học");
  const next = run("bookVehicle", { vehicleId: "E-102", expectedVersion: store.state.vehicles[0].version });
  advance(15);
  advance(1);
  assert.equal(store.state.reservations.find((row) => row.id === next.id).status, "EXPIRED");
  const notices = store.state.notifications.filter((row) => row.relatedId === next.id);
  assert.equal(notices.length, 1);
  assert.equal(notices[0].userId, store.user.id);
});

test("UC05–06 xem trước khung giờ không giữ cọc, lọc đầu nối và nhả cổng khi hủy", async () => {
  const { store, run } = await setup();
  const request = { slotId: "P-01-14", vehicleId: "PV-01", start: epoch, end: epoch + 30 * minute, expectedVersion: 1 };
  const before = store.state;
  assert.equal(ParkingService.checkAvailability(before, request, store.user, epoch).slot.id, request.slotId);
  assert.equal(store.state, before);
  const parking = run("bookParking", request);
  store.transaction((state) => { state.ports.find((row) => row.id === "CHG-01-03").connector = "CCS"; });
  assert.ok(!ChargingScheduleService.getChargers(store.state, "H-01", "TYPE_2").some((row) => row.id === "CHG-01-03"));
  const charging = { ...request, reservationId: parking.id, portId: "CHG-01-02" };
  assert.equal(ChargingScheduleService.checkAvailability(store.state, charging, store.user, epoch).port.id, charging.portId);
  const schedule = run("bookCharging", charging);
  const port = () => store.state.ports.find((row) => row.id === charging.portId);
  assert.equal(port().reservedScheduleId, schedule.id);
  run("cancelCharging", { scheduleId: schedule.id });
  assert.equal(port().reservedScheduleId, null);
  assert.equal(port().status, "AVAILABLE");
});

test("UC05 ghi đơn lỗi sau bước giữ cọc không làm thay đổi ví hoặc tạo đơn", async () => {
  let fail = false;
  const { store, parking } = await setup({
    getItem: () => null,
    setItem: () => {
      if (fail) throw Error("quota");
    },
  });
  const before = store.state;
  fail = true;
  assert.throws(() => parking(), /lưu/);
  assert.equal(store.state, before);
  assert.equal(store.user.held, 0);
});

test("UC05 hủy lịch tương lai ở ô đang có xe giữ nguyên xe thực và nhả cọc", async () => {
  const { store, run, parking } = await setup();
  const slot = "P-01-13";
  const row = parking(epoch + 150 * minute, epoch + 180 * minute, slot);
  assert.equal(store.user.held, 50000);
  run("cancelParking", { reservationId: row.id });
  assert.equal(store.user.held, 0);
  assert.equal(store.state.slots.find((s) => s.id === slot).vehicleId, "PV-02");
  assert.equal(store.user.balance, 300000);
});

test("UC05–06 no-show bị xử lý cọc đúng một lần và hủy lịch sạc phụ thuộc", async () => {
  const { store, run, advance, parking } = await setup();
  const row = parking();
  const schedule = run("bookCharging", {
    reservationId: row.id,
    portId: "CHG-01-02",
    expectedVersion: 1,
    start: epoch,
    end: epoch + 30 * minute,
  });
  advance(16);
  advance(1);
  assert.equal(store.user.held, 0);
  assert.equal(store.user.balance, 250000);
  assert.equal(
    store.state.schedules.find((s) => s.id === schedule.id).status,
    "CANCELLED",
  );
});

test("UC06 đăng ký khung giờ tương lai trên cổng đang sạc, chặn các lịch giao nhau", async () => {
  const { store, run, parking } = await setup();
  const row = parking(epoch, epoch + 180 * minute);
  const input = {
    reservationId: row.id,
    portId: "CHG-01-01",
    expectedVersion: 1,
    start: epoch + 50 * minute,
    end: epoch + 70 * minute,
  };
  run("bookCharging", input);
  assert.throws(() => run("bookCharging", { ...input, expectedVersion: 2 }), /lịch/);
  assert.equal(
    store.state.ports.find((p) => p.id === input.portId).status,
    "CHARGING",
  );
});

test("UC07 timeout không cấp nguồn; sau xác nhận dừng, rút đầu cắm mới mở lại cổng", async () => {
  const { store, run, advance, parking } = await setup();
  const row = parking();
  run("checkInParking", { reservationId: row.id });
  const schedule = run("bookCharging", {
    reservationId: row.id,
    portId: "CHG-01-02",
    expectedVersion: 1,
    start: epoch,
    end: epoch + 60 * minute,
  });
  const input = { scheduleId: schedule.id, code: schedule.code };
  run("plugCharger", input);
  const timeout = run("startCharging", { ...input, outcome: "timeout" });
  assert.ok(timeout.operationError);
  assert.equal(timeout.status, "PLUGGED");
  run("startCharging", input);
  assert.throws(() => run("unplugCharger", input), /ngắt điện/);
  advance(10);
  const session = store.state.sessions.find(
    (s) => s.scheduleId === schedule.id,
  );
  assert.ok(chargeReading(store.state, session, store.now()).cost > 0);
  run("stopCharging", input);
  assert.equal(
    store.state.ports.find((p) => p.id === schedule.portId).status,
    "STOPPED",
  );
  run("unplugCharger", input);
  run("leaveParking", { reservationId: row.id });
  assert.equal(
    store.state.ports.find((p) => p.id === schedule.portId).status,
    "AVAILABLE",
  );
});

test("UC03 xác minh lại kết nối Hub và chốt sau khi mở khóa", async () => {
  const { store, run } = await setup();
  const booking = run("bookVehicle", { vehicleId: "E-102", expectedVersion: 1 });
  const pickup = { reservationId: booking.id, code: booking.vehicleId };
  run("beginPickup", pickup);
  run("unlockAck", pickup);
  store.login("operator01", "123456");
  const ops = (action, payload) => store.transaction((state, now) =>
    operatorCommand(state, action, payload, { user: store.user, now }));
  ops("telemetry.emit", { hubId: booking.hubId, mode: "offline" });
  store.login("student01", "123456");
  assert.throws(() => run("confirmPickup", pickup), /mất kết nối/);
  store.login("operator01", "123456");
  ops("telemetry.emit", { hubId: booking.hubId, mode: "live" });
  ops("incident.open", { targetId: booking.slotId, reason: "Chốt không an toàn" });
  store.login("student01", "123456");
  assert.throws(() => run("confirmPickup", pickup), /chốt nhận/);
  assert.equal(store.state.trips.length, 0);
});

test("UC04 đổi chốt trả trong một giao dịch và nhả chốt lỗi", async () => {
  const { store, run } = await setup();
  const reservation = run("bookVehicle", { vehicleId: "E-102", expectedVersion: 1 });
  const pickup = { reservationId: reservation.id, code: reservation.vehicleId };
  run("beginPickup", pickup);
  run("unlockAck", pickup);
  const { id: tripId } = run("confirmPickup", pickup);
  run("leaveSlot", { tripId });
  const old = run("requestReturn", { tripId, hubId: "H-02" });
  store.login("operator01", "123456");
  store.transaction((state, now) => operatorCommand(state, "incident.open",
    { targetId: old.returnSlotId, reason: "Lỗi chốt" }, { user: store.user, now }));
  store.login("student01", "123456");
  assert.throws(() => run("lockReturn", { tripId, slotId: old.returnSlotId, vehicleId: pickup.code }), /chốt/);
  const available = store.state.slots.find((slot) => slot.hubId === "H-03" &&
    slot.type === "SHARED" && slot.status === "AVAILABLE");
  run("requestReturn", { tripId, slotId: available.id });
  assert.equal(store.state.slots.find((slot) => slot.id === old.returnSlotId).holdId, null);
  run("lockReturn", { tripId, slotId: available.id, vehicleId: pickup.code });
  assert.throws(() => run("requestReturn", { tripId, hubId: "H-02" }), /chưa ghi nhận khóa/);
  assert.equal(run("finishReturn", { tripId }).status, "COMPLETED");
});

test("UC05 xe quá giờ vẫn chiếm ô cho đến khi ghi nhận rời ô", async () => {
  const { store, run, advance, parking } = await setup();
  const first = parking(epoch, epoch + 15 * minute, "P-01-14");
  const second = parking(epoch + 15 * minute, epoch + 30 * minute, "P-01-15");
  run("checkInParking", { reservationId: first.id });
  advance(15);
  assert.throws(() => run("checkInParking", { reservationId: second.id }), /xe vẫn ở một ô khác/);
  assert.equal(store.state.slots.filter((slot) => slot.vehicleId === "PV-01").length, 1);
  run("leaveParking", { reservationId: first.id });
  run("checkInParking", { reservationId: second.id });
  assert.deepEqual(store.state.slots.filter((slot) => slot.vehicleId === "PV-01").map((slot) => slot.id), ["P-01-15"]);
});

test("UC05–06 từ chối form có version cũ hoặc thiếu version", async () => {
  const { store, run, parking } = await setup();
  const scheduleCount = store.state.schedules.length;
  const reservation = parking();
  assert.throws(() => run("bookParking", {
    slotId: reservation.slotId, vehicleId: "PV-01", start: epoch + 90 * minute,
    end: epoch + 150 * minute, expectedVersion: 1,
  }), /vừa thay đổi/);
  const input = { reservationId: reservation.id, portId: "CHG-01-02", start: epoch, end: reservation.end };
  assert.throws(() => run("bookCharging", input), /vừa thay đổi/);
  run("bookCharging", { ...input, expectedVersion: 1 });
  assert.throws(() => run("bookCharging", { ...input, expectedVersion: 1 }), /vừa thay đổi/);
  assert.equal(store.state.schedules.length, scheduleCount + 1);
});

test("UC01 lọc bằng tọa độ, bán kính và số xe sẵn sàng", async () => {
  const { store } = await setup();
  const { lat, lon } = store.state.hubs[0];
  const nearby = { lat, lon, radiusKm: 0.2 };
  assert.deepEqual(getNearbyHubs(store.state.hubs, nearby).map((hub) => hub.id), ["H-01"]);
  assert.equal(searchHubs(store.state, { nearby, minAvailableVehicles: 100 }, epoch).length, 0);
});
