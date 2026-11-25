import {
  esc,
  card,
  badge,
  button,
  field,
  form,
  submit,
  select,
  time,
  empty,
  money,
  icon,
} from "../../components/ui.js";
import { chargeReading } from "../../application/student.js";
import { isHubOnline, slotAvailable } from "../../domain/resources.js";
import { usable } from "../../domain/student-rules.js";

const hidden = (name, value) =>
  '<input type="hidden" name="' + esc(name) + '" value="' + esc(value) + '">';
const booked = ["CONFIRMED", "REPLACED", "RESCHEDULED"];
const scheduled = ["SCHEDULED", "REPLACED", "RESCHEDULED"];

function localInput(ms) {
  const d = new Date(ms);
  return new Date(ms - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

function windowFields(start, end) {
  return (
    field(
      "Bắt đầu",
      '<input type="datetime-local" required name="start" value="' +
        localInput(start) +
        '">',
    ) +
    field(
      "Kết thúc",
      '<input type="datetime-local" required name="end" value="' +
        localInput(end) +
        '">',
    )
  );
}

function outcome() {
  return field(
    "Phản hồi thiết bị",
    select("outcome", [
      ["ok", "Thành công"],
      ["timeout", "Thiết bị không phản hồi"],
      ["fault", "Sự cố an toàn"],
    ]),
  );
}

function renderParkingForm(s, user, now, ui) {
  const hub = s.hubs.find((x) => x.id === ui.parkingHub) || s.hubs[0];
  const cars = s.privateVehicles.filter(
    (x) => (x.userId || x.ownerId) === user.id,
  );
  const picker = select(
    "parkingHub",
    s.hubs.map((h) => [h.id, h.name]),
    hub.id,
  ).replace("<select", '<select data-setting="parkingHub"');
  const slots = s.slots.filter(
    (x) => x.hubId === hub.id && x.type === "PRIVATE" && usable(x),
  );
  const free = slots.find((x) => slotAvailable(s, x));
  const start = Math.floor(now / 60000) * 60000;
  const location = field("Hub", picker);
  if (!isHubOnline(s, hub.id, now))
    return (
      location + empty("Hub đang mất kết nối. Hãy chọn trạm khác để giữ chỗ.")
    );
  if (!cars.length || !slots.length)
    return location + empty("Cần có xe cá nhân đã đăng ký và ô đỗ phù hợp.");
  return (
    location +
    form(
      "bookParking",
      field(
        "Phương tiện cá nhân",
        select(
          "vehicleId",
          cars.map((v) => [v.id, v.name || v.id]),
        ),
      ) +
        field(
          "Vị trí đỗ",
          select(
            "slotId",
            slots.map((x) => [
              x.id,
              x.id +
                " · " +
                (slotAvailable(s, x) ? "Đang trống" : "Đang sử dụng"),
              x.version,
            ]),
            free?.id,
          ),
        ) +
        windowFields(start, start + 3600000) +
        submit("Giữ chỗ · " + money(s.config.params.PARKING_DEPOSIT_VND)),
    )
  );
}

function parkingRecord(s, r, now) {
  const params = { reservationId: r.id };
  let actions = "";
  if (booked.includes(r.status))
    actions =
      button("Xác nhận xe vào ô", "checkInParking", params) +
      button("Hủy đặt chỗ", "cancelParking", params, "secondary");
  if (r.status === "CHECKED_IN")
    actions = button("Xác nhận xe rời ô", "leaveParking", params, "secondary");
  const ports = s.ports.filter((p) => p.hubId === r.hubId && usable(p));
  const free = ports.find((p) => p.status === "AVAILABLE");
  let book = "";
  if (
    ports.length &&
    r.end > now &&
    (r.status === "CHECKED_IN" || booked.includes(r.status))
  ) {
    book =
      "<details><summary>Đăng ký lịch sạc theo chỗ đỗ</summary>" +
      form(
        "bookCharging",
        hidden("reservationId", r.id) +
          field(
            "Cổng sạc",
            select(
              "portId",
              ports.map((p) => [p.id, p.id + " · " + p.powerKw + " kW", p.version]),
              free?.id,
            ),
          ) +
          windowFields(
            Math.max(Math.floor(now / 60000) * 60000, r.start),
            r.end,
          ) +
          submit("Xác nhận lịch sạc"),
      ) +
      "</details>";
  }
  const deposit = {
    HELD: "Đang giữ cọc",
    RELEASED: "Đã giải phóng cọc",
    FORFEITED: "Đã khấu trừ cọc do quá hạn",
  };
  return (
    '<article class="record"><div class="section-head"><strong>' +
    esc(r.slotId) +
    " · " +
    esc(r.vehicleId) +
    "</strong>" +
    badge(r.status) +
    '</div><p class="muted">' +
    time(r.start) +
    " – " +
    time(r.end) +
    " · " +
    esc(r.id) +
    '</p><p class="muted">' +
    esc(deposit[r.depositStatus] || "") +
    " " +
    money(r.deposit) +
    '</p><div class="row">' +
    actions +
    "</div>" +
    book +
    "</article>"
  );
}

function chargingRecord(s, c, now) {
  const params = hidden("scheduleId", c.id);
  const payload = { scheduleId: c.id };
  let actions = "";
  if (scheduled.includes(c.status))
    actions =
      form(
        "plugCharger",
        params +
          field(
            "Mã quét tại cổng",
            '<input required name="code" placeholder="' +
              esc(c.code || c.portId) +
              '">',
          ) +
          submit("Xác nhận cắm đầu sạc"),
      ) + button("Hủy lịch", "cancelCharging", payload, "secondary");
  if (c.status === "PLUGGED")
    actions =
      form(
        "startCharging",
        params + outcome() + submit("Kiểm tra an toàn & đóng relay"),
      ) +
      button(
        "Rút đầu cắm khi chưa cấp điện",
        "unplugCharger",
        payload,
        "secondary",
      );
  if (c.status === "CHARGING")
    actions = form(
      "stopCharging",
      params + outcome() + submit("Dừng sạc an toàn"),
    );
  if (c.status === "STOPPED")
    actions = button("Xác nhận đã rút đầu cắm", "unplugCharger", payload);
  const session = s.sessions.find((x) => x.scheduleId === c.id);
  let reading = "";
  if (session) {
    const { energyKwh, cost } = chargeReading(s, session, now);
    reading =
      '<p class="detail-line" data-session-reading="' +
      esc(session.id) +
      '">' +
      Number(energyKwh).toLocaleString("vi-VN", { maximumFractionDigits: 3 }) +
      " kWh · " +
      money(cost) +
      (session.status === "CHARGING" ? " tạm tính" : "") +
      "</p>";
  }
  const error = c.operationError
    ? '<p class="error-line">' + esc(c.operationError) + "</p>"
    : "";
  return (
    '<article class="record"><div class="section-head"><strong>' +
    esc(c.portId) +
    "</strong>" +
    badge(c.status) +
    '</div><p class="muted">' +
    time(c.start) +
    " – " +
    time(c.end) +
    (c.code ? " · Mã " + esc(c.code) : "") +
    "</p>" +
    reading +
    error +
    actions +
    "</article>"
  );
}

export function parkingView(s, user, now, ui) {
  const records = s.reservations
    .filter((r) => r.type === "PARKING" && r.userId === user.id)
    .slice()
    .reverse();
  const schedules = s.schedules
    .filter((c) => c.userId === user.id)
    .slice()
    .reverse();
  return (
    '<div class="page-heading"><div><h1>Phương tiện Cá nhân: Đặt chỗ đỗ, Lịch sạc &amp; Phiên sạc</h1><p>Đặt khung giờ cho xe cá nhân và theo dõi phiên sạc tại Hub.</p></div>' +
    '<div class="wallet-pill">' + icon("wallet") + '<div>Số dư khả dụng: <strong>' +
    money(user.balance - user.held) + '</strong><small>Đang giữ ' +
    money(user.held) + " · " + time(now) + "</small></div></div></div>" +
    '<div class="grid parking-columns">' +
    card("Đặt chỗ đỗ xe", renderParkingForm(s, user, now, ui)) +
    card(
      "Chỗ đỗ của tôi",
      records.map((r) => parkingRecord(s, r, now)).join("") ||
        empty("Chưa có lịch đỗ xe."),
    ) +
    card(
      "Lịch và phiên sạc",
      schedules.map((c) => chargingRecord(s, c, now)).join("") ||
        empty("Chọn một chỗ đỗ đã đặt để đăng ký sạc."),
    ) +
    "</div>"
  );
}
