import { AuthService, loadStore } from "./infrastructure/store.js";
import {
  studentCommand,
  expireStudentHolds,
  ReservationService,
  ParkingService,
  ChargingScheduleService,
} from "./application/student.js";
import { ChargingSessionService } from "./application/charging.js";
import { AuditLogService, operatorCommand } from "./application/operator.js";
import { processPendingEffects } from "./application/pending-effects.js";
import { TelemetryService } from "./application/telemetry.js";
import { MonitoringService } from "./application/monitoring.js";
import { resolveRoute, home } from "./router.js";
import { hubMetrics } from "./domain/resources.js";
import {
  button,
  esc,
  field,
  form,
  icon,
  money,
  submit,
  time,
} from "./components/ui.js";
import { hubSearchField, searchView } from "./pages/student/hub-search.js";
import { tripView } from "./pages/student/pickup-return.js";
import { parkingView } from "./pages/student/parking-charging.js";
import { operatorView } from "./pages/operator/views.js";

const app = document.querySelector("#app");
const dialog = document.querySelector("#dialog");
const toast = document.querySelector("#toast");
let store;
let ui = {};
let menu = false;
let toastTimer;
let loginTarget = "";

function notify(message, error = false) {
  clearTimeout(toastTimer);
  toast.className = error ? "error" : "";
  toast.textContent = message;
  toastTimer = setTimeout(() => {
    toast.textContent = "";
  }, 5200);
}

function go(key) {
  const target = "#/" + key;
  if (location.hash === target) render();
  else location.hash = target;
}

function showDialog(title, body, { caption = "", description = "" } = {}) {
  dialog.className = caption ? "login-dialog" : "";
  dialog.setAttribute("aria-labelledby", "dialog-title");
  dialog.innerHTML =
    `<div class="dialog-heading"><div>
      ${caption ? '<div class="dialog-caption">' + esc(caption) + "</div>" : ""}
      <h2 id="dialog-title">${esc(title)}</h2>
      ${description ? '<p class="muted">' + esc(description) + "</p>" : ""}
    </div><button class="close" data-dialog-close aria-label="Đóng">${icon("close", 20)}</button></div>${body}`;
  if (!dialog.open) dialog.showModal();
}

function login(role, target) {
  loginTarget = target;
  const example = role === "operator" ? "operator01" : "student01";
  const accounts =
    '<div class="demo-accounts"><button data-account="student01">Sinh viên</button>' +
    '<button data-account="operator01">Vận hành</button><button data-account="dual01">Hai vai trò</button></div>';
  const credentials = form(
    "authenticate",
    field(
      "Tên đăng nhập",
      '<input name="username" required autocomplete="username" value="' +
        example +
        '">',
    ) +
      field(
        "Mật khẩu",
        '<input type="password" name="password" required autocomplete="current-password" value="123456">',
      ) +
      '<p class="error-line" aria-live="polite"></p>' +
      '<div class="dialog-actions"><button type="button" class="btn quiet" data-dialog-close>Hủy</button>' +
      submit("Đăng nhập") +
      "</div>",
  );
  showDialog(
    role === "operator" ? "Phân hệ Vận hành" : "Phân hệ Sinh viên",
    credentials + '<div class="demo-footer"><small>Mật khẩu demo dùng chung: 123456.</small>' + accounts + "</div>",
    {
      caption: "Đăng nhập hệ thống",
      description: role === "operator"
        ? "Đăng nhập để truy cập các chức năng giám sát và điều phối vận hành."
        : "Đăng nhập để sử dụng các dịch vụ dành cho sinh viên.",
    },
  );
}

function demoDialog() {
  const controls = [1, 2, 15, 60]
    .map((minutes) =>
      button("+ " + minutes + " phút", "advance", { minutes }, "secondary"),
    )
    .join("");
  showDialog(
    "Điều khiển bản demo",
    '<p class="muted">Đồng hồ hiện tại · ' +
      time(store.now()) +
      '</p><div class="row">' +
      controls +
      "</div><hr>" +
      "<p>Khôi phục dữ liệu mẫu sẽ xóa các thay đổi của phiên demo trên trình duyệt này.</p>" +
      button("Khôi phục dữ liệu mẫu", "requestReset", {}, "secondary"),
  );
}

const navItems = {
  "student/hub-search": ["Tra cứu & Đặt xe", "compass"],
  "student/pickup-return": ["Nhận & Trả xe", "bike"],
  "student/parking-charging": ["Đỗ & Sạc xe cá nhân", "plug"],
  "operator/network-dashboard": ["Giám sát mạng lưới", "chart"],
  "operator/vehicle-dispatch": ["Điều phối luân chuyển", "route"],
  "operator/charging-schedule": ["Lập lịch sạc thông minh", "bolt"],
  "operator/incidents": ["Xử lý sự cố kỹ thuật", "wrench"],
  "operator/what-if": ["Mô phỏng What-if", "sliders"],
  "operator/telemetry": ["Đồng bộ cảm biến IoT", "radio"],
};

function navGroup(title, role, current) {
  const links = Object.entries(navItems).filter(([key]) =>
    key.startsWith(role + "/"),
  );
  return (
    '<div class="nav-group"><h2>' +
    title +
    "</h2>" +
    links
      .map(([key, [label, symbol]]) => {
        const active = key === current;
        return (
          '<a href="#/' +
          key +
          '" class="nav-link ' +
          (active ? "active" : "") +
          '" ' +
          (active ? 'aria-current="page"' : "") +
          ">" +
          icon(symbol) +
          " " +
          "<span>" + esc(label) + "</span>" +
          (key === "student/hub-search" ? '<span class="nav-dot"></span>' : "") +
          "</a>"
        );
      })
      .join("") +
    "</div>"
  );
}

function pageContent(route, state, user, now) {
  if (route.error)
    return '<section class="panel"><h1>Màn hình không tồn tại</h1><a href="#/">Về trang giới thiệu</a></section>';
  const page = route.key?.split("/")[1];
  if (route.role === "operator" && !route.denied) {
    return operatorView(page, state, now, ui);
  }
  if (page === "pickup-return") return tripView(state, user, now);
  if (page === "parking-charging") return parkingView(state, user, now, ui);
  return searchView(state, user, ui, now);
}

function networkSummary(state, now) {
  const online = state.hubs.map((hub) => hubMetrics(state, hub.id, now)).filter((hub) => hub.online);
  const sum = (key) => online.reduce((total, hub) => total + hub[key], 0);
  return {
    hubs: online.length,
    vehicles: sum("availableVehicles"),
    slots: sum("freeSlots"),
    ports: sum("freePorts"),
  };
}

function brand(landing = false) {
  return `<a class="brand" href="#/"><span class="brand-mark">BK</span><span>
    <b>${landing ? "Smart E-Mobility Hub" : "VNU-HCM E-Mobility"}</b>
    <small>${landing ? "Khu đô thị ĐHQG-HCM" : "Smart Campus Coordination"}</small>
  </span></a>`;
}

function landingView(state, summary) {
  return `<div class="landing">
    <header class="landing-header"><div>${brand(true)}</div></header>
    <main class="landing-main"><div class="landing-hero">
      <div class="landing-kicker"><span class="status-dot"></span>Kết nối chặng cuối Ga Metro Số 1 – Khu đô thị ĐHQG-HCM</div>
      <h1>Hệ thống Quản lý &amp; Điều phối Phương tiện Điện Thông minh <span>VNU-HCM</span></h1>
      <p>Quản lý phương tiện điện, chỗ đỗ, lịch sạc và điều phối vận hành trong khu đô thị ĐHQG-HCM.</p>
      <div class="landing-metrics">
        <div><small>Mobility Hubs</small><strong>${String(state.hubs.length).padStart(2, "0")} Trạm chính</strong><span class="green-text">● ${summary.hubs} đang hoạt động</span></div>
        <div><small>Xe điện sẵn sàng</small><strong class="accent-text">${summary.vehicles} / ${state.vehicles.length} Xe</strong><span>Sẵn sàng phục vụ</span></div>
        <div><small>Ô đỗ còn trống</small><strong>${summary.slots} / ${state.slots.length} Ô</strong><span>Vị trí đỗ tại Hub</span></div>
        <div><small>Cổng sạc khả dụng</small><strong class="green-text">${summary.ports} / ${state.ports.length} Cổng</strong><span>Đang sẵn sàng</span></div>
      </div>
      <div class="landing-actions">
        <a class="btn primary" href="#/student/hub-search">${icon("compass")} Mở WebApp – Phân hệ Sinh viên</a>
        <a class="btn secondary" href="#/operator/network-dashboard">${icon("activity")} Mở Dashboard – Đơn vị Vận hành</a>
      </div>
    </div></main>
  </div>`;
}

function statusBar(state, summary) {
  return `<div class="status-bar"><div class="status-pills">
    <span>${icon("bike", 14)} <span>XE KHẢ DỤNG: <strong>${summary.vehicles}</strong></span></span>
    <span>${icon("park", 14)} <span>Ô ĐỖ TRỐNG: <strong>${summary.slots}</strong>/${state.slots.length}</span></span>
    <span>${icon("plug", 14)} <span>CỔNG SẠC SẴN SÀNG: <strong>${summary.ports}</strong>/${state.ports.length}</span></span>
    <span>${icon("navigation", 14)} <span>HUB TRỰC TUYẾN: <strong>${summary.hubs}</strong>/${state.hubs.length}</span></span>
  </div><p class="status-message">Sẵn sàng: Chọn Hub hoặc chức năng bên trái để thao tác.</p></div>`;
}

function accountProfile(user) {
  return user.username === "student01"
    ? { name: "Trần Tiến Thành", studentCode: "2413181" }
    : user;
}

function endSession() {
  if (store.state.userId != null) AuthService.logout(store);
  ui = {};
  menu = false;
  loginTarget = "";
  if (dialog.open) dialog.close();
}

function render() {
  const route = resolveRoute(location.hash, store.user);
  if (route.role === null && (store.state.userId != null || loginTarget)) {
    endSession();
  }
  const { state, user } = store;
  if (route.denied) {
    if (user) {
      notify("Tài khoản hiện tại không có quyền truy cập phân hệ này.", true);
      location.replace("#/" + home(user));
      return;
    }
    if (loginTarget !== route.key) login(route.role, route.key);
  }

  const now = store.now();
  const summary = networkSummary(state, now);
  if (!user) {
    app.innerHTML = landingView(state, summary);
    return;
  }

  const current = route.key;
  const isOperator = route.role === "operator";
  const explorer = current === "student/hub-search";
  const { roles } = user;
  const navigation =
    (roles.includes("student")
      ? navGroup("Dịch vụ Sinh viên", "student", current)
      : "") +
    (roles.includes("operator")
      ? navGroup("Trung tâm Vận hành", "operator", current)
      : "");
  const { name, studentCode } = accountProfile(user);
  const accountLabel = isOperator
    ? "Đơn vị Vận hành"
    : studentCode
      ? `MSSV: ${studentCode}`
      : "Sinh viên";
  const account = `<button class="account" data-command="account" aria-label="Tài khoản ${esc(name)}">
    <span class="avatar">${isOperator ? "OP" : "SV"}</span>
    <span class="account-name"><strong>${esc(name)}</strong><small>${esc(accountLabel)}</small></span>
  </button>`;
  app.innerHTML = `<div class="shell ${menu ? "menu-open" : ""} ${isOperator ? "shell-operator" : ""}">
      <header class="topbar">
        <div class="top-left">
          <button class="mobile-menu" data-menu aria-label="Trình đơn" aria-controls="sidebar" aria-expanded="${menu}">${icon("menu", 20)}</button>
          ${brand()}
          <span class="zone">${icon("pin", 14)} Zone: Khu đô thị ĐHQG-HCM (Thủ Đức / Dĩ An)</span>
          ${explorer ? hubSearchField(ui.query) : ""}
        </div>
        <div class="top-right">
          ${state.notifications.some((item) => item.userId === user.id || item.target === route.role)
            ? button("Thông báo", "inbox", { role: route.role }, "secondary", "bell") : ""}
          ${isOperator ? '<a class="alert-link" href="#/operator/incidents" aria-label="Cảnh báo hệ thống">' + icon("bell") + "</a>" : ""}
          ${account}
        </div>
      </header>
      <aside class="side" id="sidebar">
        <nav class="side-nav" aria-label="Phân hệ">${navigation}</nav>
        <div class="sidebar-foot">
          <div class="sidebar-status">
            <span><i class="status-dot"></i> Campus Grid: ${summary.hubs}/${state.hubs.length} Hub</span>
            ${!isOperator ? `<p><span>Số dư khả dụng</span><strong>${money(user.balance - user.held)}</strong></p>` : ""}
            <button data-command="demo">${icon("settings", 14)} Điều khiển demo</button>
          </div>
          <a class="back-home" href="#/">${icon("home", 14)} Quay về trang giới thiệu</a>
        </div>
      </aside>
      <div class="workspace">
        ${statusBar(state, summary)}
        <main class="main ${explorer ? "main-explorer" : ""}" id="main">${pageContent(route, state, user, now)}</main>
      </div>
    </div>`;
}

function refreshTimers() {
  const before = store.state.reservations
    .concat(store.state.schedules)
    .map((row) => row.status)
    .join("|");
  const alerts = store.state.notifications.length;
  store.transaction((state, now) => {
    expireStudentHolds(state, now);
    TelemetryService.checkTimeouts(state, now);
    MonitoringService.triggerRebalanceAlertIfNeeded(state, now);
  });
  const after = store.state.reservations
    .concat(store.state.schedules)
    .map((row) => row.status)
    .join("|");
  return before !== after || alerts !== store.state.notifications.length;
}

function updateChargeReadings() {
  for (const element of document.querySelectorAll("[data-session-reading]")) {
    const session = store.state.sessions.find(
      (row) => row.id === element.dataset.sessionReading,
    );
    if (!session) continue;
    const reading = ChargingSessionService.chargeReading(store.state, session, store.now());
    element.textContent =
      reading.energyKwh.toLocaleString("vi-VN", { maximumFractionDigits: 3 }) +
      " kWh · " +
      money(reading.cost) +
      (session.status === "CHARGING" ? " tạm tính" : "");
  }
}

function setUI(key, value) {
  for (const panel of document.querySelectorAll("details[data-details]"))
    ui[panel.dataset.details] = panel.open;
  ui[key] = value;
  render();
}

const shellCommands = {
  login() {
    login("student", "student/hub-search");
  },
  previewBooking(payload) {
    const user = store.requireRole("student");
    refreshTimers();
    const preview = ReservationService.validateBooking(store.state, payload, { user, now: store.now() });
    showDialog(
      "Xác nhận đặt xe " + preview.vehicleId,
      `<p>${esc(preview.hubName)} · Ô ${esc(preview.slotId)} · Pin ${esc(preview.soc)}%</p>
      <p>Xe sẽ được giữ trong ${esc(store.readConfig("T_HOLD_MIN"))} phút sau khi xác nhận.</p>
      <p class="error-line" aria-live="polite"></p>
      <div class="dialog-actions">
        <button type="button" class="btn quiet" data-dialog-close>Hủy</button>
        ${button("Xác nhận giữ xe", "bookVehicle", {
          vehicleId: preview.vehicleId, hubId: preview.hubId, expectedVersion: preview.expectedVersion,
        })}
      </div>`,
    );
  },
  previewParking(payload) {
    const user = store.requireRole("student");
    const { slot, start, end } = ParkingService.checkAvailability(store.state, payload, user, store.now());
    showDialog("Ô đỗ phù hợp", `<p>${esc(slot.id)} · ${time(start)} – ${time(end)}</p><p>Bạn có thể giữ chỗ từ biểu mẫu.</p>`);
  },
  previewCharging(payload) {
    const user = store.requireRole("student");
    const { port, start, end } = ChargingScheduleService.checkAvailability(store.state, payload, user, store.now());
    showDialog("Cổng sạc phù hợp", `<p>${esc(port.id)} · ${time(start)} – ${time(end)}</p><p>Khung giờ còn đủ công suất. Bạn có thể xác nhận lịch từ biểu mẫu.</p>`);
  },
  account() {
    const user = store.user;
    showDialog(
      accountProfile(user).name,
      "<p>" +
        esc(user.username) +
        " · " +
        esc(
          user.roles
            .map((role) => (role === "student" ? "Sinh viên" : "Vận hành"))
            .join(" / "),
        ) +
        "</p>" +
        button("Đăng xuất", "logout", {}, "secondary"),
    );
  },
  inbox({ role }) {
    const user = store.requireRole(role);
    const messages = store.state.notifications.filter((item) => item.userId === user.id || item.target === role);
    showDialog("Thông báo", messages.slice(-20).reverse().map((item) =>
      "<p><strong>" + esc(item.title) + "</strong><br>" + esc(item.message) +
      "<br><small>" + esc(time(item.at)) + "</small></p>"
    ).join(""));
  },
  authenticate(payload) {
    const destination = loginTarget;
    if (!destination) return;
    store.login(payload.username, payload.password, destination.split("/")[0]);
    loginTarget = "";
    dialog.close();
    ui = {};
    go(destination);
    notify("Đã đăng nhập.");
  },
  logout() {
    endSession();
    go("");
    notify("Đã đăng xuất.");
  },
  demo: demoDialog,
  advance(payload) {
    store.advance(Number(payload.minutes));
    refreshTimers();
    processPendingEffects(store);
    demoDialog();
    render();
    notify("Đã tăng " + payload.minutes + " phút.");
  },
  requestReset() {
    showDialog(
      "Khôi phục dữ liệu mẫu?",
      '<p>Mọi chuyến, lịch đặt, lệnh và thay đổi dùng chung giữa các tab cùng địa chỉ demo sẽ được xóa.</p><div class="row">' +
        button("Xác nhận khôi phục", "reset") +
        '<button class="btn secondary" data-dialog-close>Giữ phiên hiện tại</button></div>',
    );
  },
  reset() {
    store.reset();
    ui = {};
    dialog.close();
    go("");
    notify("Đã nạp lại dữ liệu mẫu.");
  },
};

async function execute(action, payload = {}) {
  try {
    await store.withExclusive(() => {
      if (Object.hasOwn(shellCommands, action)) {
        shellCommands[action](payload);
        return;
      }
      const operator = action.includes(".");
      const user = store.requireRole(operator ? "operator" : "student");
      refreshTimers();
      const command = operator ? operatorCommand : studentCommand;
      const change = (state, now) => {
        const result = command(state, action, payload, { user, now });
        MonitoringService.triggerRebalanceAlertIfNeeded(state, now);
        return result;
      };
      const result = operator ? AuditLogService.runOperatorTransaction(store, user, action, payload, change)
        : store.transaction(change);
      processPendingEffects(store);
      if (action === "simulation.run") ui.savedScenarioId = "";
      render();
      if (action === "bookVehicle") {
        dialog.close();
        go("student/pickup-return");
      }
      const error = result?.operationError;
      notify(
        typeof result === "string" ? result : error || "Đã ghi nhận thay đổi.",
        !!error,
      );
    });
  } catch (error) {
    if (action === "authenticate" || (action === "bookVehicle" && dialog.open)) {
      const errorLine = dialog.querySelector(".error-line");
      if (errorLine) {
        errorLine.textContent = error.message;
        return;
      }
    }
    notify(error.message, true);
  }
}

document.addEventListener("click", (event) => {
  const element = event.target.closest("button,a");
  if (!element) return;
  if (element.hasAttribute("data-dialog-close")) {
    dialog.close();
    return;
  }
  if (element.hasAttribute("data-menu")) {
    menu = !menu;
    render();
    return;
  }
  if (element.dataset.account) {
    dialog.querySelector("[name=username]").value = element.dataset.account;
    dialog.querySelector("[name=password]").value = "123456";
    return;
  }
  if (element.hasAttribute("data-set")) {
    setUI(element.dataset.set, element.value);
    return;
  }
  if (element.dataset.command) {
    execute(
      element.dataset.command,
      JSON.parse(element.dataset.payload || "{}"),
    );
    return;
  }
  if (element.matches('a[href^="#"]')) {
    menu = false;
    if (element.getAttribute("href") === "#/" && location.hash === "#/") {
      window.scrollTo(0, 0);
    }
  }
});

document.addEventListener("toggle", (event) => {
  const panel = event.target;
  if (panel.isConnected && panel.dataset.details) {
    ui[panel.dataset.details] = panel.open;
  }
}, true);

document.addEventListener("submit", (event) => {
  const element = event.target;
  if (!element.dataset.action) return;
  event.preventDefault();
  const data = new FormData(element);
  const payload = Object.fromEntries(data);
  const version = element.querySelector("select option:checked[data-version]")?.dataset.version;
  if (version !== undefined) payload.expectedVersion = version;
  for (const input of element.querySelectorAll("[data-json]"))
    payload[input.name] = JSON.parse(input.value);
  for (const input of element.querySelectorAll(
    "[type=checkbox],select[multiple]",
  )) {
    if (input.name) payload[input.name] = data.getAll(input.name);
  }
  for (const input of element.querySelectorAll("[type=datetime-local]"))
    payload[input.name] = new Date(input.value).getTime();
  if ("issue" in payload) payload.issue = payload.issue === "true";
  execute(event.submitter?.dataset.submitAction || element.dataset.action, payload);
});

document.addEventListener("change", (event) => {
  const element = event.target;
  if (element.dataset.setting)
    setUI(
      element.dataset.setting,
      element.type === "checkbox" ? element.checked : element.value,
    );
});
document.addEventListener("input", (event) => {
  if (event.target.id !== "query") return;
  const position = event.target.selectionStart;
  setUI("query", event.target.value);
  const input = document.querySelector("#query");
  input.focus();
  input.setSelectionRange(position, position);
});
window.addEventListener("hashchange", () => {
  menu = false;
  render();
  window.scrollTo(0, 0);
});
dialog.addEventListener("close", () => {
  if (dialog.open || !loginTarget) return;
  const route = resolveRoute(location.hash, store.user);
  const target = loginTarget;
  loginTarget = "";
  if (route.denied && route.key === target) go("");
});

try {
  store = await loadStore();
  await store.withExclusive(() => {
    store.heartbeat();
    refreshTimers();
    processPendingEffects(store);
  });
  render();
  setInterval(async () => {
    try {
      await store.withExclusive(() => {
        store.heartbeat();
        const statusChanged = refreshTimers();
        const revision = store.state.revision;
        processPendingEffects(store);
        const editing =
          document.querySelector("main form") ||
          ["INPUT", "SELECT", "TEXTAREA"].includes(
            document.activeElement?.tagName,
          );
        if (!dialog.open && (statusChanged || store.state.revision !== revision || !editing)) render();
        else updateChargeReadings();
      });
    } catch (error) {
      notify(error.message, true);
    }
  }, 15000);
} catch (error) {
  app.innerHTML =
    '<main class="main"><h1>Chưa thể mở ứng dụng</h1><p>' +
    esc(error.message) +
    "</p><p>Chạy python -m http.server 8000 tại thư mục dự án rồi mở localhost:8000.</p></main>";
}
