import { icons } from "../../assets/icons/lucide.js";

export function esc(value = "") {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ],
  );
}
export function icon(name, size = 16) {
  return `<svg class="icon" aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">${icons[name] ?? icons.grid}</svg>`;
}
const labels = {
  AVAILABLE: "Sẵn sàng",
  READY: "Sẵn sàng",
  RESERVED: "Đã giữ",
  ACTIVE: "Đang hoạt động",
  OCCUPIED: "Có xe",
  CHARGING: "Đang sạc",
  OFFLINE: "Mất kết nối",
  ONLINE: "Trực tuyến",
  CONFIRMED: "Đã xác nhận",
  COMPLETED: "Hoàn tất",
  CANCELLED: "Đã hủy",
  EXPIRED: "Hết hạn",
  FAILED: "Thất bại",
  IN_TRANSIT: "Đang vận chuyển",
  PARTIALLY_COMPLETED: "Hoàn tất một phần",
  PENDING: "Đang chờ",
  RELOCATING: "Đang điều phối",
  AFFECTED: "Bị ảnh hưởng",
  FAULTED: "Có sự cố",
  OUT_OF_SERVICE: "Ngừng phục vụ",
  CHECKING_IN: "Đang nhận xe",
  IN_USE: "Đang sử dụng",
  PLUGGED: "Đã cắm",
  STOPPED: "Đã ngắt điện",
  PENDING_RECONCILIATION: "Chờ đối soát",
  REJECTED: "Đã từ chối",
  APPLIED: "Đã áp dụng",
  RESCHEDULED: "Đã đổi lịch",
  REPLACED: "Đã thay thế",
  UNLOCKED: "Đã mở khóa",
  CONSUMED: "Đã nhận xe",
  CHECKED_IN: "Xe đã vào ô",
  RETURN_PENDING: "Đã giữ ô trả",
  PENDING_VERIFICATION: "Chờ xác nhận hoàn tất",
  SCHEDULED: "Đã lên lịch",
  PENDING_CHECK: "Chờ kiểm tra",
  WAITING_CHARGE: "Chờ sạc",
  ISOLATING: "Đang cách ly",
  ISOLATED: "Đã cách ly",
  IN_REPAIR: "Đang bảo trì",
  RESOLVED: "Đã xử lý",
  SENT: "Đã gửi",
  IN_PROGRESS: "Đang thực hiện",
  CHARGED_FULL: "Đã sạc đầy",
  DONE: "Đã hoàn tất bảo trì",
  PENDING_RESEND: "Chờ gửi lại",
  IGNORED_DUPLICATE: "Đã bỏ gói trùng",
  IGNORED_STALE: "Đã bỏ gói cũ",
  REJECTED_CORRUPT: "Dữ liệu không hợp lệ",
  TIMEOUT: "Quá hạn phản hồi",
  SKIPPED: "Đã bỏ qua",
  COMPENSATED: "Đã xử lý bù",
};
export function badge(status) {
  let mood = /FAILED|OFFLINE|FAULT|AFFECTED|EXPIRED|REJECTED/.test(status)
    ? "red"
    : /PENDING|PARTIAL|RESERVED|CHECK|HOLD/.test(status)
      ? "gold"
      : /ONLINE|AVAILABLE|COMPLETED|ACTIVE|CONFIRMED|APPLIED/.test(status)
        ? "green"
        : "blue";
  return (
    '<span class="badge ' +
    mood +
    '"><i></i>' +
    esc(labels[status] || status) +
    "</span>"
  );
}
export function time(ms) {
  return ms
    ? new Intl.DateTimeFormat("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
      }).format(new Date(ms))
    : "—";
}
export function form(action, body) {
  return (
    '<form class="action-form" data-action="' +
    esc(action) +
    '">' +
    body +
    "</form>"
  );
}
export function submit(label, variant = "primary", symbol = "") {
  return `<button class="btn ${esc(variant)}" type="submit">${symbol ? icon(symbol) : ""}${esc(label)}</button>`;
}
export function button(label, action, payload = {}, variant = "primary", symbol = "") {
  return `<button type="button" class="btn ${esc(variant)}" data-command="${esc(action)}" data-payload="${esc(JSON.stringify(payload))}">${symbol ? icon(symbol) : ""}${esc(label)}</button>`;
}
export function select(name, items, current) {
  return (
    '<select name="' +
    esc(name) +
    '">' +
    items
      .map(
        ([v, t, version]) =>
          '<option value="' +
          esc(v) +
          '" ' +
          (version === undefined ? "" : 'data-version="' + esc(version) + '" ') +
          (String(v) === String(current) ? "selected" : "") +
          ">" +
          esc(t) +
          "</option>",
      )
      .join("") +
    "</select>"
  );
}
export function field(label, html) {
  return (
    '<label class="field"><span>' + esc(label) + "</span>" + html + "</label>"
  );
}
export function card(title, body, className = "") {
  return `<section class="panel ${esc(className)}"><h2>${esc(title)}</h2>${body}</section>`;
}
export function empty(msg) {
  return '<p class="empty">' + esc(msg) + "</p>";
}
export const vehicleType = (v) =>
  v.type === "BIKE" ? "Xe đạp điện" : "Scooter điện";
export const money = (v) => Number(v || 0).toLocaleString("vi-VN") + " ₫";
