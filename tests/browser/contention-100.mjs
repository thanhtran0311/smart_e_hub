import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readSeed } from "../node/seed.mjs";

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.DEMO_URL || "http://127.0.0.1:8000";
const tabCount = 4;
const perTab = 25;

async function runCase(browser, uc) {
  const context = await browser.newContext();
  try {
    const seed = await readSeed();
    for (let i = 0; i < tabCount; i++) {
      const id = "tester-" + i;
      seed.users.push({ ...seed.users[0], id, username: id, roles: [uc === "UC09" ? "operator" : "student"] });
      seed.privateVehicles.push({ ...seed.privateVehicles[0], id: "car-" + i, ownerId: id, userId: id });
      if (uc === "UC06") {
        seed.slots.push({ ...seed.slots.find(s => s.id === "P-01-14"), id: "slot-" + i });
        seed.reservations.push({ ...seed.reservations.find(r => r.id === "RES-P02"), id: "parking-" + i,
          userId: id, vehicleId: "car-" + i, slotId: "slot-" + i, start: "@now", end: "@now+60m",
          expiresAt: "@now+15m", deposit: 0 });
      }
    }
    const tabs = await Promise.all(Array.from({ length: tabCount }, () => context.newPage()));
    await Promise.all(tabs.map(async (tab, i) => {
      // Same origin as the app, without its unrelated UI heartbeat timer.
      await tab.goto(base + "/data/config.json");
      await tab.evaluate(async ({ seed, uc, i }) => {
        const { OperationalStore } = await import("/src/infrastructure/store.js");
        const { studentCommand } = await import("/src/application/student.js");
        const { operatorCommand, previewDispatch } = await import("/src/application/operator.js");
        const { cloneOperationalState } = await import("/src/infrastructure/operational-snapshot.js");
        const now = 1800000000000;
        const store = await OperationalStore.openShared(seed, { storage: localStorage, sessionStorage,
          lockManager: navigator.locks, now: () => now });
        store.login("tester-" + i, seed.users[0].password);
        const window = { start: now, end: now + 1800000 };
        const preview = previewDispatch(store.state, "H-01", "H-02");
        const cases = {
          UC02: ["bookVehicle", { vehicleId: "E-102", expectedVersion: 1 }],
          UC05: ["bookParking", { ...window, slotId: "P-01-14", expectedVersion: 1, vehicleId: "car-" + i }],
          UC06: ["bookCharging", { ...window, portId: "CHG-01-02", expectedVersion: 1, reservationId: "parking-" + i }],
          UC09: ["dispatch.create", { sourceId: "H-01", destId: "H-02", vehicleIds: ["E-102"],
            capacityVersion: preview.capacityVersion, versions: preview.versions }],
        };
        const [action, payload] = cases[uc];
        const command = uc === "UC09" ? operatorCommand : studentCommand;
        const change = state => command(state, action, payload, { now, user: store.user });
        change(cloneOperationalState(store.state)); // Each participant could win in isolation.
        globalThis.submitRequest = () => store.withExclusive(() => store.transaction(change));
      }, { seed, uc, i });
    }));

    // Hold the real Web Lock until all 100 requests are pending, not just scheduled by the driver.
    const first = tabs[0];
    await first.evaluate(() => new Promise(ready => {
      void navigator.locks.request("ehub_state", () => new Promise(release => {
        globalThis.releaseGate = release;
        ready();
      }));
    }));
    await Promise.all(tabs.map(tab => tab.evaluate(count => {
      globalThis.results = Promise.allSettled(Array.from({ length: count }, () => globalThis.submitRequest()))
        .then(rows => rows.map(r => r.status === "fulfilled" ? null : String(r.reason)));
    }, perTab)));
    await first.waitForFunction(async () =>
      (await navigator.locks.query()).pending.filter(lock => lock.name === "ehub_state").length === 100);
    await first.evaluate(() => globalThis.releaseGate());
    const results = (await Promise.all(tabs.map(tab => tab.evaluate(() => globalThis.results)))).flat();
    const conflicts = results.filter(r => r !== null);
    const state = await first.evaluate(async () => {
      const { sharedSnapshot } = await import("/src/infrastructure/shared-snapshot.js");
      return JSON.parse(await sharedSnapshot("ehub_state"));
    });
    const persistedCount = {
      UC02: state.reservations.filter(r => r.vehicleId === "E-102").length,
      UC05: state.reservations.filter(r => r.slotId === "P-01-14").length,
      UC06: state.schedules.filter(r => r.portId === "CHG-01-02").length,
      UC09: state.orders.length,
    }[uc];
    console.log(uc, "queued:", results.length, "success:", results.length - conflicts.length,
      "rejected:", conflicts.length, "persisted:", persistedCount);
    assert.equal(results.length - conflicts.length, 1);
    assert.equal(conflicts.length, 99);
    for (const error of conflicts) assert.match(error, uc === "UC09" ? /Sức chứa đích đã thay đổi/ : /Tài nguyên vừa thay đổi/);

    const winner = "tester-" + Math.floor(results.indexOf(null) / perTab);
    if (uc === "UC02") {
      const bookings = state.reservations.filter(r => r.vehicleId === "E-102");
      assert.equal(bookings.length, 1);
      assert.equal(bookings[0].userId, winner);
      assert.equal(state.vehicles.find(v => v.id === "E-102").reservationId, bookings[0].id);
    } else if (uc === "UC05") {
      const bookings = state.reservations.filter(r => r.slotId === "P-01-14");
      assert.equal(bookings.length, 1);
      assert.equal(bookings[0].userId, winner);
      for (const user of state.users.filter(u => u.id.startsWith("tester-")))
        assert.equal(user.held, user.id === winner ? state.config.params.PARKING_DEPOSIT_VND : 0);
    } else if (uc === "UC06") {
      const schedules = state.schedules.filter(r => r.portId === "CHG-01-02");
      assert.equal(schedules.length, 1);
      assert.equal(schedules[0].userId, winner);
      assert.equal(state.ports.find(p => p.id === "CHG-01-02").reservedScheduleId, schedules[0].id);
    } else {
      assert.equal(state.orders.length, 1);
      assert.deepEqual(state.orders[0].items.map(item => item.vehicleId), ["E-102"]);
      assert.equal(state.vehicles.find(v => v.id === "E-102").status, "RELOCATING");
      assert.equal(state.slots.filter(s => s.holdId === state.orders[0].id).length, 1);
    }
    console.log(uc, "100 queued, 1 success, 99 conflicts, persisted state verified");
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || "msedge", headless: true });
try {
  for (const uc of ["UC02", "UC05", "UC06", "UC09"]) {
    try {
      await runCase(browser, uc);
    } catch (error) {
      console.error(uc, error.message);
      process.exitCode = 1;
    }
  }
} finally {
  await browser.close();
}
