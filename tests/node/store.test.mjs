import test from "node:test";
import assert from "node:assert/strict";
import { AuthService, OperationalStore } from "../../src/infrastructure/store.js";
import {
  ChargingCommand, ChargingPlan, Hub, ParkingReservation, PrivateVehicle,
  Reservation, SharedVehicle, User, Vehicle,
} from "../../src/domain/entities.js";
import {
  isHubOnline,
  slotAvailable,
  hubMetrics,
} from "../../src/domain/resources.js";
import { readSeed, demoStore } from "./seed.mjs";
import { operatorCommand, proposeSchedule } from "../../src/application/operator.js";
import { studentCommand } from "../../src/application/student.js";

test("VNU-SSO mô phỏng nhận token mẫu và store tiếp tục dùng phiên JSON cũ", async () => {
  const store = await demoStore();
  const { users } = store.state;
  assert.equal(AuthService.authenticateVnuSso("mock-vnu-sso:U-01", users).username, "student01");
  assert.equal(AuthService.validateSession("mock-vnu-sso:U-01", store.state), false);
  assert.throws(() => AuthService.authenticateVnuSso("U-01", users), /mô phỏng/);
  assert.throws(() => store.login("student01", "sai"), /mật khẩu/);
  assert.equal(store.login("student01", "123456").id, "U-01");
  assert.equal(AuthService.validateSession("mock-vnu-sso:U-01", store.state), true);
  assert.equal(AuthService.validateSession("U-01", store.state), true);
  assert.equal(AuthService.validateSession("mock-vnu-sso:U-99", store.state), false);
  AuthService.logout(store);
  assert.equal(store.user, null);
  assert.equal(AuthService.validateSession("mock-vnu-sso:U-01", store.state), false);
});

test("OperationalStore đọc snapshot, cấu hình Hub và commit qua API UML", async () => {
  const store = await demoStore();
  const before = store.getRealtimeNetworkStatus();
  assert.equal(before, store.state);
  assert.equal(store.readConfig("T_HOLD_MIN"), before.config.params.T_HOLD_MIN);
  assert.equal(store.readConfig("HUB_POWER_LIMIT", "H-01"), before.config.hubPowerLimitKw["H-01"]);
  store.beginTransaction((draft) => { draft.offsetMs += 1000; });
  assert.equal(store.getRealtimeNetworkStatus().offsetMs, before.offsetMs + 1000);
});

test("Seed mô tả xe, vị trí, tài khoản, phiên sạc và lịch tương lai nhất quán", async () => {
  const store = await demoStore();
  const state = store.state;
  for (const collection of [
    "hubs",
    "users",
    "vehicles",
    "slots",
    "ports",
    "privateVehicles",
    "schedules",
    "sessions",
    "reservations",
  ]) {
    assert.equal(
      new Set(state[collection].map((row) => row.id)).size,
      state[collection].length,
    );
  }
  for (const vehicle of state.vehicles) {
    const slot = state.slots.find((row) => row.id === vehicle.slotId);
    assert.equal(slot.vehicleId, vehicle.id);
    assert.equal(slot.hubId, vehicle.hubId);
    assert.equal(slot.status, "OCCUPIED");
  }
  const session = state.sessions[0];
  const current = state.schedules.find(
    (item) => item.id === session.scheduleId,
  );
  const future = state.schedules.find((item) => item.status === "SCHEDULED");
  assert.equal(future.portId, session.portId);
  assert.ok(current.end < future.start);
  assert.ok(current.start < store.now());
  assert.ok(store.now() < current.end);
  assert.equal(
    state.users.find((user) => user.id === future.userId).held,
    50000,
  );
  for (const user of state.users) {
    const holds = state.reservations.filter(
      (row) => row.userId === user.id && row.depositStatus === "HELD",
    );
    assert.equal(
      user.held,
      holds.reduce((total, row) => total + row.deposit, 0),
    );
  }
  for (const row of state.schedules) {
    const port = state.ports.find((item) => item.id === row.portId);
    assert.equal(port.hubId, row.hubId);
    if (row.reservationId === null) {
      const vehicle = state.vehicles.find((item) => item.id === row.vehicleId);
      const fleetSession = state.sessions.find((item) => item.id === row.sessionId);
      assert.equal(row.userId, null);
      assert.equal(vehicle.hubId, row.hubId);
      assert.equal(port.vehicleId, vehicle.id);
      assert.equal(port.sessionId, fleetSession.id);
      assert.equal(fleetSession.scheduleId, row.id);
      continue;
    }
    const reservation = state.reservations.find(
      (item) => item.id === row.reservationId,
    );
    assert.equal(reservation.vehicleId, row.vehicleId);
    assert.equal(reservation.hubId, row.hubId);
    assert.equal(
      state.privateVehicles.find((item) => item.id === row.vehicleId).ownerId,
      row.userId,
    );
    assert.ok(reservation.start <= row.start && row.end <= reservation.end);
  }
  assert.equal(
    state.ports.find((port) => port.id === session.portId).sessionId,
    session.id,
  );
  assert.equal(hubMetrics(state, "H-01", store.now()).availableVehicles, 8);
  assert.equal(hubMetrics(state, "H-02", store.now()).availableVehicles, 1);
  assert.equal(hubMetrics(state, "H-04", store.now()).freeSlots, 1);
});

test("Lỗi khi lưu giữ nguyên snapshot, kể cả người dùng và tài nguyên", async () => {
  let fail = false;
  const storage = {
    getItem: () => null,
    setItem: () => {
      if (fail) throw new Error("Quota");
    },
  };
  const store = await demoStore({ storage });
  store.login("student01", "123456");
  const before = store.state;
  fail = true;
  assert.throws(
    () =>
      store.transaction((draft) => {
        draft.vehicles[0].status = "RESERVED";
        draft.users[0].held += 50000;
      }),
    /Không lưu/,
  );
  assert.equal(store.state, before);
  assert.throws(() => {
    store.state.users[0].held = 50000;
  }, TypeError);
});

test("Khôi phục phiên, đồng hồ và tiền giữ sau tải lại; reset khôi phục seed", async () => {
  const seed = await readSeed();
  let now = 1_800_000_000_000;
  const disk = new Map();
  const options = {
    storage: {
      getItem: (name) => disk.get(name),
      setItem: (name, value) => disk.set(name, value),
    },
    now: () => now,
  };
  const first = new OperationalStore(seed, options);
  first.login("student01", "123456");
  first.transaction((draft) => {
    draft.users[0].held += 50000;
  });
  first.advance(15);
  now += 2000;
  const recovered = new OperationalStore(seed, options);
  assert.equal(recovered.now(), now + 15 * 60_000);
  assert.equal(recovered.user.held, 50000);
  assert.throws(() => recovered.requireRole("operator"));
  recovered.reset();
  assert.equal(recovered.now(), now);
  assert.equal(recovered.user, null);
  assert.equal(recovered.state.users[0].held, 0);
});

test("Hub mất heartbeat giữ dữ liệu cũ, reconnect cần dữ liệu mới; ô đã giữ bị loại khỏi sức chứa", async () => {
  let time = 1_800_000_000_000;
  const store = await demoStore({ now: () => time });
  assert.equal(isHubOnline(store.state, "H-05", time), false);
  time += 61_000;
  assert.equal(isHubOnline(store.state, "H-01", time), false);
  store.heartbeat();
  assert.equal(isHubOnline(store.state, "H-01", time), true);
  assert.equal(isHubOnline(store.state, "H-05", time), false);
  const slot = store.state.slots.find((row) => slotAvailable(store.state, row));
  assert.equal(
    slotAvailable(store.state, { ...slot, holdId: "DSP-01" }),
    false,
  );
});

test("Snapshot schema 1 thiếu danh sách phát sinh vẫn lập lịch được sau khôi phục", async () => {
  const now = () => 1_800_000_000_000;
  const seed = await readSeed();
  const legacy = structuredClone(new OperationalStore(seed, { now }).state);
  delete legacy.plans;
  delete legacy.deviceCommands;
  delete legacy.sensors;
  delete legacy.hubs[0].lat;
  legacy.userId = "U-02";
  const restored = new OperationalStore(seed, { now, storage: {
    getItem: () => JSON.stringify(legacy),
    setItem: () => {},
  } });
  assert.deepEqual(restored.state.sensors, []);
  assert.equal(restored.state.hubs[0].lat, seed.hubs[0].lat);
  assert.ok(restored.user instanceof User);
  assert.ok(restored.state.hubs[0] instanceof Hub);
  assert.ok(restored.state.vehicles[0] instanceof SharedVehicle);
  assert.ok(restored.state.vehicles[0] instanceof Vehicle);
  assert.ok(restored.state.privateVehicles[0] instanceof PrivateVehicle);
  assert.ok(restored.state.privateVehicles[0] instanceof Vehicle);
  assert.ok(restored.state.reservations[0] instanceof ParkingReservation);
  const plan = proposeSchedule(restored.state, "H-01", now());
  restored.transaction((state) => {
    assert.ok(state.hubs[0] instanceof Hub);
    assert.equal(Object.isFrozen(state.hubs[0]), false);
    operatorCommand(state, "schedule.apply", { hubId: "H-01", plan }, { user: restored.user, now: now() });
    assert.ok(state.plans[0] instanceof ChargingPlan);
    assert.ok(state.deviceCommands[0] instanceof ChargingCommand);
  });
  assert.ok(Object.isFrozen(restored.state.hubs[0]));
  assert.equal(restored.state.plans.length, 1);
  assert.equal(restored.state.deviceCommands[0].result, "PENDING");
});

test("UC02 hai phiên dùng chung kho chỉ xác nhận được một đơn cho cùng version xe", async () => {
  const makeStorage = () => {
    const values = new Map();
    return {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    };
  };
  let queue = Promise.resolve();
  const lockManager = {
    request(_name, work) {
      const result = queue.then(work);
      queue = result.catch(() => {});
      return result;
    },
  };
  const seed = await readSeed();
  const storage = makeStorage();
  const shared = { storage, lockManager, now: () => 1_800_000_000_000 };
  const firstSession = makeStorage();
  const secondSession = makeStorage();
  const [first, second] = await Promise.all([firstSession, secondSession].map((sessionStorage) =>
    OperationalStore.openShared(seed, { ...shared, sessionStorage })));
  first.login("student01", "123456");
  second.login("student02", "123456");
  const book = (store) => store.withExclusive(() => store.transaction((state, now) =>
    studentCommand(state, "bookVehicle", { vehicleId: "E-102", expectedVersion: 1 }, { user: store.user, now })));
  assert.throws(() => first.heartbeat(), /khóa/);
  const [accepted, rejected] = await Promise.allSettled([book(first), book(second)]);
  assert.equal(accepted.value.status, "CONFIRMED");
  assert.equal(rejected.status, "rejected");
  assert.match(rejected.reason.message, /vừa thay đổi/);
  assert.equal(first.user.id, "U-01");
  assert.equal(second.user.id, "U-03");
  const disk = JSON.parse(storage.getItem("ehub_state"));
  assert.equal(disk.userId, null);
  assert.deepEqual(disk.reservations.filter((row) => row.vehicleId === "E-102").map((row) => row.id), [accepted.value.id]);
  assert.ok(accepted.value instanceof Reservation);
  const reloaded = await OperationalStore.openShared(seed, { ...shared, sessionStorage: secondSession });
  assert.equal(reloaded.user.id, "U-03");
  assert.equal(reloaded.state.vehicles.find((row) => row.id === "E-102").reservationId, accepted.value.id);
});
