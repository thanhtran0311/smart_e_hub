// Optional UI checks. Install Playwright separately or point PLAYWRIGHT_MODULE at its directory.
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const browser = await chromium.launch({
  channel: process.env.BROWSER_CHANNEL || "msedge",
  headless: true,
});
try {
  const page = await browser.newPage({
    viewport: { width: 1365, height: 920 },
  });
  page.setDefaultTimeout(6000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400)
      errors.push(response.status() + " " + response.url());
  });
  const base = process.env.DEMO_URL || "http://127.0.0.1:8000";
  const state = (tab = page) =>
    tab.evaluate(() => navigator.locks.request("ehub_state", async () => ({
      ...JSON.parse(await (await import("/src/infrastructure/shared-snapshot.js")).sharedSnapshot("ehub_state")),
      userId: sessionStorage.getItem("ehub_session_user"),
    })));
  const btn = (action) =>
    page.locator('[data-command="' + action + '"]').first();
  const panel = (action) =>
    page.locator('form[data-action="' + action + '"]').first();
  const send = async (action) => {
    await panel(action).locator("button[type=submit]").first().click();
    await state();
  };
  const previewVehicle = (tab, id) =>
    tab.locator(`button[data-command="previewBooking"][data-payload*="${id}"]`);
  const confirmVehicle = (tab) => tab.locator('dialog button[data-command="bookVehicle"]');
  const studentEntry = page.getByRole("link", { name: "Mở WebApp – Phân hệ Sinh viên" });
  const studentLogin = page.getByRole("dialog", { name: "Phân hệ Sinh viên" });
  const link = async (key) => {
    const target = page.locator('a[href="#/' + key + '"]').last();
    if (!(await target.isVisible())) await page.locator("[data-menu]").click();
    await target.click();
    await page.waitForURL("**/#/" + key);
    await page.waitForFunction(
      (route) =>
        document
          .querySelector('a[aria-current="page"]')
          ?.getAttribute("href") ===
        "#/" + route,
      key,
    );
  };
  async function submitLogin(name) {
    await page.locator("dialog [name=username]").fill(name);
    await send("authenticate");
  }
  async function authenticate(name) {
    await submitLogin(name);
    await page.waitForSelector("dialog", { state: "hidden" });
  }
  async function assertWrongRole(name) {
    await submitLogin(name);
    await page.getByText("Tài khoản chưa có quyền thực hiện thao tác này.").waitFor();
    assert.equal((await state()).userId, null);
    assert.equal(await page.locator(".shell").count(), 0);
  }
  async function assertLandingOnly() {
    await page.locator(".landing").waitFor();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    assert.equal(await page.locator(".shell, #sidebar, #query, .map-pin").count(), 0);
  }
  const sidebarLabels = () =>
    page.locator("#sidebar .nav-link > span:first-of-type").allTextContents();
  const roleSwitcherLabels = page.locator(".topbar")
    .getByText(/^(Student View|Operator View)$/);
  const studentAccount = page.getByRole("button", {
    name: "Tài khoản Trần Tiến Thành",
  });
  async function assertStudentProfile() {
    await studentAccount.getByText("Trần Tiến Thành", { exact: true }).waitFor();
    await studentAccount.getByText("MSSV: 2413181", { exact: true }).waitFor();
    assert.equal(await roleSwitcherLabels.count(), 0);
  }

  await page.goto(base);
  await assertLandingOnly();
  await page.setViewportSize({ width: 390, height: 844 });
  await assertLandingOnly();
  await page.goto(base + "/#/student/hub-search");
  await studentLogin.waitFor();
  await assertLandingOnly();
  await page.getByRole("button", { name: "Hủy", exact: true }).click();
  await page.waitForURL("**/#/");
  await assertLandingOnly();
  await studentEntry.click();
  await authenticate("student01");
  await assertStudentProfile();
  await page.setViewportSize({ width: 1365, height: 920 });
  await page.getByRole("heading", { name: "Bản đồ mạng lưới Hub" }).waitFor();
  await assertStudentProfile();
  assert.deepEqual(await sidebarLabels(), [
    "Tra cứu & Đặt xe",
    "Nhận & Trả xe",
    "Đỗ & Sạc xe cá nhân",
  ]);
  await page.getByRole("link", { name: "Quay về trang giới thiệu" }).click();
  await assertLandingOnly();
  assert.equal((await state()).userId, null);
  await page.goBack();
  await studentLogin.waitFor();
  await assertLandingOnly();
  await page.goForward();
  await studentLogin.waitFor({ state: "hidden" });
  await studentEntry.click();
  await studentLogin.waitFor();
  await assertWrongRole("operator01");
  await authenticate("student01");
  await page.getByRole("heading", { name: "Bản đồ mạng lưới Hub" }).waitFor();
  assert.equal(await page.locator(".map-pin").count(), 5);
  if (process.env.DEMO_SCREENSHOT)
    await page.screenshot({ path: process.env.DEMO_SCREENSHOT });
  await page.locator("#query").fill("Metro");
  assert.equal(await page.locator(".hub-choice").count(), 1);
  await page.locator("#query").fill("");
  await page.getByText("Lọc theo bán kính", { exact: true }).click();
  await page.locator("select[name=nearbyHub]").selectOption("H-01");
  await page.locator("select[name=nearbyRadius]").selectOption("0.5");
  assert.equal(await page.locator(".hub-choice").count(), 1);
  await page.locator("select[name=nearbyHub]").selectOption("");
  await page.setViewportSize({ width: 390, height: 844 });
  await previewVehicle(page, "E-102").click();
  assert.equal((await state()).reservations.some((row) => row.vehicleId === "E-102"), false);
  await confirmVehicle(page).click();
  await panel("beginPickup").locator("[name=code]").fill("E-102");
  await send("beginPickup");
  await send("unlockAck");
  await btn("confirmPickup").click();
  await btn("leaveSlot").click();
  assert.equal((await state()).trips.at(-1).departed, true);
  await page.reload();
  await assertStudentProfile();
  await panel("requestReturn").locator("[name=hubId]").selectOption("H-02");
  await send("requestReturn");
  await send("lockReturn");
  await send("finishReturn");
  assert.equal((await state()).trips.at(-1).status, "COMPLETED");
  console.log("PASS · tra cứu, đặt, mở khóa, rời ô, tải lại, trả xe");

  await link("student/hub-search");
  await page.locator(".hub-choice[value='H-03']").click();
  await previewVehicle(page, "E-304").click();
  await confirmVehicle(page).click();
  await panel("beginPickup").locator("[name=code]").fill("E-304");
  await send("beginPickup");
  assert.equal(await panel("unlockAck").count(), 0);
  await panel("stopChargingSafely").locator("[name=outcome]").selectOption("timeout");
  await send("stopChargingSafely");
  await page.getByText("Thiết bị chưa phản hồi. Kiểm tra cảm biến trước khi thử lại.").first().waitFor();
  await panel("stopChargingSafely").locator("[name=outcome]").selectOption("ok");
  await send("stopChargingSafely");
  assert.equal(await panel("unlockAck").count(), 0);
  await btn("disconnectPickupCharger").click();
  await send("unlockAck");
  await btn("confirmPickup").click();
  assert.equal((await state()).trips.at(-1).vehicleId, "E-304");
  await btn("leaveSlot").click();
  await panel("requestReturn").locator("[name=hubId]").selectOption("H-03");
  await send("requestReturn");
  await send("lockReturn");
  await send("finishReturn");
  console.log("PASS · xe đang sạc giữ khóa khi timeout, rút cáp rồi mới mở khóa");
  await link("student/parking-charging");
  const parking = panel("bookParking");
  const slot = (await state()).slots.find(
    (x) =>
      x.type === "PRIVATE" && x.hubId === "H-01" && x.status === "AVAILABLE",
  );
  await parking.locator("[name=slotId]").selectOption(slot.id);
  const parkingCount = (await state()).reservations.length;
  await parking.locator('[data-submit-action="previewParking"]').click();
  await page.getByRole("dialog", { name: "Ô đỗ phù hợp" }).waitFor();
  assert.equal((await state()).reservations.length, parkingCount);
  await page.locator("dialog [data-dialog-close]").click();
  await send("bookParking");
  await btn("checkInParking").click();
  await btn("leaveParking").waitFor();
  await page.locator("details summary").first().click();
  await panel("bookCharging")
    .locator("[name=portId]")
    .selectOption("CHG-01-02");
  const scheduleCount = (await state()).schedules.length;
  await panel("bookCharging").locator('[data-submit-action="previewCharging"]').click();
  await page.getByRole("dialog", { name: "Cổng sạc phù hợp" }).waitFor();
  assert.equal((await state()).schedules.length, scheduleCount);
  await page.locator("dialog [data-dialog-close]").click();
  await send("bookCharging");
  const schedule = (await state()).schedules.at(-1);
  await panel("plugCharger").locator("[name=code]").fill(schedule.code);
  await send("plugCharger");
  await send("startCharging");
  await page.waitForFunction(
    () => {
      const text = document.querySelector(
        "[data-session-reading]",
      )?.textContent;
      return text && !text.startsWith("0 kWh");
    },
    null,
    { timeout: 22000 },
  );
  await send("stopCharging");
  await btn("unplugCharger").click();
  await btn("leaveParking").click();
  assert.equal((await state()).schedules.at(-1).status, "COMPLETED");
  console.log("PASS · giữ cọc, đỗ xe, đặt lịch, kích hoạt, ngắt và rút sạc");
  await page.setViewportSize({ width: 1365, height: 920 });
  await page.goto(base + "/#/operator/network-dashboard");
  await page.waitForURL("**/#/student/hub-search");
  await page.locator(".topbar .brand").click();
  await assertLandingOnly();
  assert.equal((await state()).userId, null);
  await page.getByRole("link", { name: "Mở Dashboard – Đơn vị Vận hành" }).click();
  await page.getByRole("dialog", { name: "Phân hệ Vận hành" }).waitFor();
  await assertLandingOnly();
  await assertWrongRole("student01");
  await authenticate("operator01");
  await page.getByRole("heading", { name: "Giám sát trạng thái toàn mạng lưới" }).waitFor();
  assert.equal(await roleSwitcherLabels.count(), 0);
  assert.deepEqual(await sidebarLabels(), [
    "Giám sát mạng lưới",
    "Điều phối luân chuyển",
    "Lập lịch sạc thông minh",
    "Xử lý sự cố kỹ thuật",
    "Mô phỏng What-if",
    "Đồng bộ cảm biến IoT",
  ]);
  console.log("PASS · trang giới thiệu tách khỏi dashboard, đăng nhập theo vai trò và nhãn sidebar");
  await link("operator/vehicle-dispatch");
  const boxes = panel("dispatch.create").locator("[name=vehicleIds]");
  for (let i = 0; i < 5; i++) await boxes.nth(i).check();
  await send("dispatch.create");
  await btn("dispatch.start").click();
  for (let i = 0; i < 4; i++)
    await page
      .getByRole("button", { name: "Đã đến", exact: true })
      .first()
      .click();
  await page.getByRole("button", { name: "Chưa bàn giao" }).first().click();
  assert.equal((await state()).orders.at(-1).status, "PARTIALLY_COMPLETED");
  console.log("PASS · chặn route sai quyền, điều phối bàn giao 4/5 xe");
  await link("operator/charging-schedule");
  await btn("schedule.apply").click();
  assert.ok((await state()).plans.length);
  assert.equal((await state()).deviceCommands.find((request) => request.planId).result, "PENDING");
  await link("operator/telemetry");
  await send("telemetry.emit");
  await panel("telemetry.emit")
    .locator("[name=mode]")
    .selectOption("duplicate");
  await send("telemetry.emit");
  assert.equal((await state()).telemetry.at(-1).result, "IGNORED_DUPLICATE");
  await panel("telemetry.emit").locator("[name=telemetryDevice]").selectOption("P-01-14");
  await panel("telemetry.emit").locator('[data-submit-action="telemetry.register"]').click();
  assert.ok((await state()).sensors.some((sensor) => sensor.id === "P-01-14"));
  await send("telemetry.emit");
  assert.equal((await state()).telemetry.at(-1).type, "PARKING_SPACE");
  assert.equal((await state()).telemetry.at(-1).result, "APPLIED");
  await panel("telemetry.emit").locator("[name=telemetryDevice]").selectOption("CHG-01-01");
  await panel("telemetry.emit").locator("[name=batteryPct]").fill("100");
  await panel("telemetry.emit").locator("[name=powerKw]").fill("7");
  await panel("telemetry.emit").locator("[name=energyKwh]").fill("2.5");
  await send("telemetry.emit");
  const fullPort = (await state()).ports.find((port) => port.id === "CHG-01-01");
  assert.equal(fullPort.status, "CHARGED_FULL");
  assert.equal(fullPort.plugged, true);
  await link("operator/what-if");
  await send("simulation.run");
  assert.ok((await state()).scenarios.length);
  await page.getByRole("button", { name: "Lưu mẫu kịch bản" }).click();
  const template = (await state()).scenarios.at(-1);
  assert.equal(template.status, "DRAFT");
  await page.getByText("Mẫu kịch bản đã lưu", { exact: true }).click();
  await page.getByRole("button", { name: "Chạy mẫu" }).first().click();
  assert.equal((await state()).scenarios.at(-1).templateId, template.id);
  const redirect = (await state()).recommendations.findLast((item) => item.type === "REDIRECT_USERS");
  await page.locator('button[data-command="recommendation.apply"][data-payload*="' + redirect.id + '"]').click();
  assert.ok((await state()).notifications.some((item) => item.userId === "U-01" && item.relatedId === redirect.id));
  await link("operator/incidents");
  const maintenanceTarget = (await state()).vehicles.find((vehicle) => vehicle.hubId === "H-01" && vehicle.status === "AVAILABLE" && !vehicle.blocked);
  await panel("incident.open").locator("[name=targetId]").selectOption(maintenanceTarget.id);
  await panel("incident.open").locator("[name=reason]").fill("Kiểm tra khóa");
  await send("incident.open");
  await page.getByText("Phân loại và xếp mức độ", { exact: true }).first().click();
  await panel("incident.classify").locator("[name=severity]").selectOption("CRITICAL");
  await send("incident.classify");
  assert.equal((await state()).incidents.at(-1).severity, "CRITICAL");
  await btn("incident.isolate").click();
  await btn("incident.work").click();
  await btn("incident.workInProgress").click();
  assert.equal((await state()).workOrders.at(-1).status, "IN_PROGRESS");
  await btn("incident.resolve").click();
  assert.equal((await state()).workOrders.at(-1).status, "DONE");
  assert.ok((await state()).incidents.length);
  await link("operator/network-dashboard");
  const hubRows = page.locator('section[aria-label="Tình trạng từng Hub"] tbody tr');
  assert.equal(await hubRows.locator("time").count(), 5);
  const offlineHub = hubRows.filter({ hasText: "H-05" });
  await offlineHub.getByText("Dữ liệu cũ", { exact: true }).waitFor();
  assert.ok(await offlineHub.locator("time").getAttribute("datetime"));
  await page.locator("select[name=networkFormat]").selectOption("csv");
  assert.equal(await page.getByRole("link", { name: "Xuất báo cáo" }).getAttribute("download"), "smart-e-hub-network.csv");
  console.log("PASS · lập lịch sạc, telemetry, what-if, sự cố và dashboard");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  for (const slug of [
    "vehicle-dispatch",
    "charging-schedule",
    "incidents",
    "what-if",
    "telemetry",
  ]) {
    await link("operator/" + slug);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      slug,
    );
  }
  await btn("account").click();
  await btn("logout").click();
  await assertLandingOnly();
  assert.equal((await state()).userId, null);
  await studentEntry.click();
  await authenticate("student01");
  await btn("inbox").click();
  await page.getByRole("dialog").getByText("Gợi ý Hub nhận xe", { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS · điều hướng di động, không tràn ngang, không lỗi JS hoặc HTTP",
  );

  const bookingContext = await browser.newContext();
  try {
    const tabs = await Promise.all([bookingContext.newPage(), bookingContext.newPage()]);
    const students = ["student01", "student02"];
    const userIds = ["U-01", "U-03"];
    await Promise.all(tabs.map(async (tab, index) => {
      await tab.goto(base + "/#/student/hub-search");
      await tab.locator("dialog [name=username]").fill(students[index]);
      await tab.locator('form[data-action="authenticate"] button[type=submit]').click();
      await previewVehicle(tab, "E-102").click();
    }));
    const payloads = await Promise.all(tabs.map((tab) => confirmVehicle(tab).getAttribute("data-payload")));
    assert.equal(JSON.parse(payloads[0]).expectedVersion, JSON.parse(payloads[1]).expectedVersion);
    await Promise.all(tabs.map((tab) => confirmVehicle(tab).click()));
    const snapshots = await Promise.all(tabs.map((tab) => state(tab)));
    const bookings = snapshots[0].reservations.filter((item) => item.vehicleId === "E-102");
    assert.equal(bookings.length, 1);
    assert.equal(bookings[0].status, "CONFIRMED");
    const winner = userIds.indexOf(bookings[0].userId);
    assert.ok(winner >= 0);
    await tabs[winner].waitForURL("**/#/student/pickup-return");
    await tabs[1 - winner].getByText("Tài nguyên vừa thay đổi. Hãy kiểm tra và xác nhận lại.", { exact: true }).waitFor();
    assert.deepEqual(snapshots.map((snapshot) => snapshot.userId), userIds);
    assert.deepEqual(snapshots[0].reservations, snapshots[1].reservations);
    await tabs[1 - winner].reload();
    assert.equal((await state(tabs[1 - winner])).userId, userIds[1 - winner]);
  } finally {
    await bookingContext.close();
  }
  console.log("PASS · hai tab xác nhận cùng version, chỉ một đơn E-102 được ghi");
} finally {
  await browser.close();
}
