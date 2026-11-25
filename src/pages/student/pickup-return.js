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
} from "../../components/ui.js";
import { slotAvailable } from "../../domain/resources.js";

const hidden = (key, value) =>
  '<input type="hidden" name="' + esc(key) + '" value="' + esc(value) + '">';
const outcome = () =>
  field(
    "Phản hồi thiết bị",
    select("outcome", [
      ["ok", "Xác nhận thành công"],
      ["timeout", "Mô phỏng timeout"],
      ["fault", "Mô phỏng lỗi thiết bị"],
    ]),
  );
const confirmed = ["CONFIRMED", "RESCHEDULED", "REPLACED"];

function heading(id, status, detail) {
  return (
    '<div class="section-head"><div><strong>' +
    esc(id) +
    '</strong><p class="muted">' +
    esc(detail) +
    "</p></div>" +
    badge(status) +
    "</div>"
  );
}

function pickupCard(r) {
  const params = { reservationId: r.id };
  const identity = hidden("reservationId", r.id);
  let action;
  if (confirmed.includes(r.status)) {
    action =
      form(
        "beginPickup",
        identity +
          field(
            "Quét mã xe (nhập mã hiển thị trên xe)",
            '<input required name="code" placeholder="' +
              esc(r.vehicleId) +
              '">',
          ) +
          submit("Bắt đầu nhận xe", "primary", "unlock"),
      ) + button("Hủy giữ xe", "cancelBooking", params, "secondary");
  } else {
    action =
      r.status === "CHECKING_IN"
        ? form(
            "unlockAck",
            identity + outcome() + submit("Nhận phản hồi mở khóa"),
          )
        : button("Xác nhận đã nhận xe", "confirmPickup", params);
    action +=
      "<details><summary>Báo sự cố khi nhận xe</summary>" +
      form(
        "reportPickup",
        identity +
          field(
            "Mô tả sự cố",
            '<input name="reason" required placeholder="Ví dụ: Khóa xe bị kẹt">',
          ) +
          submit("Gửi báo cáo và hủy nhận xe"),
      ) +
      "</details>";
  }
  const until = confirmed.includes(r.status) ? r.expiresAt : r.checkInDeadline;
  return (
    '<article class="record">' +
    heading(
      r.vehicleId,
      r.status,
      r.hubId + " · Ô " + r.slotId + " · Hạn " + time(until),
    ) +
    (r.operationError
      ? '<p class="error-line">' + esc(r.operationError) + "</p>"
      : "") +
    action +
    "</article>"
  );
}

function journeyCard(s, t) {
  const identity = hidden("tripId", t.id);
  let body = "";
  if (!t.departed)
    body = button("Cảm biến xác nhận xe rời ô", "leaveSlot", { tripId: t.id });
  else if (t.status === "ACTIVE") {
    const available = s.hubs.filter(
      (h) =>
        !h.offline &&
        s.slots.some(
          (slot) =>
            slot.hubId === h.id &&
            slot.type === "SHARED" &&
            slotAvailable(s, slot),
        ),
    );
    body = form(
      "requestReturn",
      identity +
        field(
          "Hub muốn trả xe",
          select(
            "hubId",
            s.hubs.map((h) => [h.id, h.name]),
            available.find((h) => h.id !== t.pickupHubId)?.id ||
              available[0]?.id,
          ),
        ) +
        submit("Giữ chỗ trả xe"),
    );
  } else if (t.status === "RETURN_PENDING") {
    body = form(
      "lockReturn",
      identity +
        field(
          "Mã xe tại chốt",
          '<input required name="vehicleId" value="' + esc(t.vehicleId) + '">',
        ) +
        field(
          "Mã ô trả",
          '<input required name="slotId" value="' + esc(t.returnSlotId) + '">',
        ) +
        outcome() +
        submit("Xác minh chốt & khóa xe", "success", "lock"),
    ) + '<details><summary>Đổi chốt trả xe</summary>' +
      form(
        "requestReturn",
        identity +
          field("Chốt trả thay thế", select("slotId", s.slots.filter((slot) =>
            slot.type === "SHARED" && slotAvailable(s, slot) &&
            s.hubs.some((hub) => hub.id === slot.hubId && !hub.offline)
          ).map((slot) => [slot.id, slot.id + " · " + s.hubs.find((hub) => hub.id === slot.hubId).name]))) +
          submit("Giữ chốt trả khác", "secondary"),
      ) + "</details>";
  } else {
    body = form(
      "finishReturn",
      identity +
        field(
          "Tình trạng sau chuyến",
          select("issue", [
            ["", "Bình thường"],
            ["true", "Cần kiểm tra kỹ thuật"],
          ]),
        ) +
        submit("Đối soát & hoàn tất chuyến", "success", "check"),
    );
  }
  return (
    '<article class="record">' +
    heading(
      t.vehicleId,
      t.status,
      t.id + (t.returnSlotId ? " · Ô trả " + t.returnSlotId : ""),
    ) +
    (t.operationError
      ? '<p class="error-line">' + esc(t.operationError) + "</p>"
      : "") +
    body +
    "</article>"
  );
}

export function tripView(s, user) {
  const reservations = s.reservations
    .filter((r) => r.userId === user.id && r.type === "VEHICLE")
    .slice()
    .reverse();
  const trips = s.trips
    .filter((r) => r.userId === user.id)
    .slice()
    .reverse();
  const pickups = reservations
    .filter((r) => [...confirmed, "CHECKING_IN", "UNLOCKED"].includes(r.status))
    .map(pickupCard)
    .join("");
  const journeys = trips
    .filter((t) => t.status !== "COMPLETED")
    .map((t) => journeyCard(s, t))
    .join("");
  return (
    '<div class="page-heading"><div><h1>Nhận &amp; Trả xe dùng chung</h1><p>Nhận xe đã giữ và xác nhận trả xe tại Hub đích.</p></div></div><div class="grid trip-columns">' +
    card(
      "Xe đang giữ",
      pickups ||
        empty("Bạn chưa giữ xe. Chọn một phương tiện trên bản đồ Hub.") +
          '<a class="btn secondary" href="#/student/hub-search">Tra cứu xe</a>',
      "pickup-panel",
    ) +
    card(
      "Chuyến đang thực hiện",
      journeys || empty("Chuyến đi sẽ xuất hiện sau khi bạn xác nhận nhận xe."),
      "return-panel",
    ) +
    "</div>" +
    card(
      "Lịch sử đặt và di chuyển",
      [...trips, ...reservations]
        .map(
          (r) =>
            '<div class="list-row"><span>' +
            esc(r.id) +
            " · " +
            esc(r.vehicleId) +
            "</span>" +
            badge(r.status) +
            "</div>",
        )
        .join("") || empty("Chưa có hành trình."),
    )
  );
}
