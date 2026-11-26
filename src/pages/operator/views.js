import {
  badge,
  button,
  card,
  empty,
  esc,
  field,
  form,
  icon,
  select,
  submit,
  time,
} from "../../components/ui.js";
import { campusMap } from "../../components/hub-map.js";
import { hubMetrics } from "../../domain/resources.js";
import { incidentCategories, incidentSeverities } from "../../domain/incidents.js";
import { TelemetryService } from "../../application/telemetry.js";
import { MonitoringService } from "../../application/monitoring.js";
import { SimulationService } from "../../application/simulation.js";
import {
  RebalanceController,
  ChargingSchedulerController,
  IncidentService,
  RecommendationService,
} from "../../application/operator.js";

const stack = (body, className = "") => '<div class="stack ' + className + '">' + body + "</div>";
const updateTime = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short", timeStyle: "medium",
});
const row = (body) => '<div class="row">' + body + "</div>";
const muted = (text) => '<small class="muted">' + esc(text) + "</small>";
const hubName = (s, id) => s.hubs.find((h) => h.id === id)?.name || id;
const options = (rows) => rows.map((x) => [x.id, x.name || x.id]);
const hidden = (name, value, json = false) =>
  '<input type="hidden" name="' +
  esc(name) +
  '" ' +
  (json ? "data-json " : "") +
  'value="' +
  esc(json ? JSON.stringify(value) : value) +
  '">';
const setting = (name, items, current) =>
  select(name, items, current).replace(
    "<select ",
    '<select data-setting="' + esc(name) + '" ',
  );
const number = (name, value, min, max) =>
  '<input type="number" required name="' +
  name +
  '" min="' +
  min +
  '" max="' +
  max +
  '" value="' +
  value +
  '">';
const line = (main, detail, after = "") =>
  '<div class="list-row"><div><strong>' +
  esc(main) +
  "</strong><br>" +
  muted(detail) +
  "</div>" +
  after +
  "</div>";
const table = (labels, rows, label) =>
  `<section class="scroll table-panel" aria-label="${esc(label)}" tabindex="0">
    <table><thead><tr>${labels.map((column) => "<th scope='col'>" + esc(column) + "</th>").join("")}</tr></thead>
    <tbody>${rows}</tbody></table>
  </section>`;
const hubPick = (s, k, v, title) =>
  field(title, setting(k, options(s.hubs), v));
const hubPair = (s, ui) => {
  const sourceId = ui.sourceId || s.hubs[0].id;
  const dests = s.hubs.filter((h) => h.id !== sourceId),
    destId = dests.find((h) => h.id === ui.destId)?.id || dests[0].id;
  return {
    sourceId,
    destId,
    fields: row(
      hubPick(s, "sourceId", sourceId, "Hub cấp xe") +
        field("Hub nhận xe", setting("destId", options(dests), destId)),
    ),
  };
};
function network(s, now, ui) {
  const snapshot = MonitoringService.getNetworkOverviewSnapshot(s, now);
  const hubs = snapshot.hubs.map((hub) => ({ hub, stats: hub }));
  const active = hubs.find(({ hub }) => hub.id === ui.hubId) || hubs[0];
  const format = ui.networkFormat === "csv" ? "csv" : "json";
  const report = MonitoringService.exportNetworkReport(snapshot, format);
  const downloadUrl = "data:" + (format === "csv" ? "text/csv" : "application/json") + ";charset=utf-8," + encodeURIComponent(report);
  const rows = hubs.map(({ hub, stats }) => {
    const vehicles = s.vehicles.filter((vehicle) => vehicle.hubId === hub.id);
    const occupied = stats.occupiedSlots;
    const occupancy = Math.round(100 * stats.occupancyRatio);
    const charge = vehicles.length ? Math.round(vehicles.reduce((sum, vehicle) => sum + vehicle.soc, 0) / vehicles.length) + "%" : "—";
    const conditions = !stats.online ? ["Dữ liệu cũ"] : [
      stats.loadStatus === "OVERLOAD" && "Quá tải công suất",
      stats.nearFull && "Gần đầy ô đỗ",
      stats.needsRebalance && "Thiếu xe · Cần điều phối",
    ].filter(Boolean);
    return `<tr>
      <td><strong>${esc(hub.name)}</strong>${muted("Mã trạm: " + hub.id + " • " + hub.location)}</td>
      <td class="accent-text"><strong>${stats.availableVehicles} xe</strong></td>
      <td><strong>${occupied}/${stats.totalSlots} ô (${occupancy}%)</strong>
        <span class="occupancy" aria-hidden="true"><span style="width:${occupancy}%"></span></span></td>
      <td class="green-text"><strong>${charge}</strong></td>
      <td>${stats.freePorts}/${stats.totalPorts} trống${muted(stats.currentPowerKw + "/" + stats.powerLimitKw + " kW")}</td>
      <td>${badge(stats.online ? "ONLINE" : "OFFLINE")}${conditions.map(muted).join("")}</td>
      <td>${Number.isFinite(hub.lastTelemetryAt)
        ? '<time datetime="' + new Date(hub.lastTelemetryAt).toISOString() + '">' + esc(updateTime.format(hub.lastTelemetryAt)) + "</time>"
        : "Chưa có dữ liệu"}</td>
    </tr>`;
  }).join("");
  return `<header class="page-heading"><h1>Giám sát trạng thái toàn mạng lưới</h1>
      <div class="row">${field("Định dạng", setting("networkFormat", [["json", "JSON"], ["csv", "CSV"]], format))}
      <a class="btn secondary" download="smart-e-hub-network.${format}" href="${esc(downloadUrl)}">${icon("download", 14)} Xuất báo cáo</a></div></header>
    ${table(["Mã & tên Mobility Hub", "Xe khả dụng", "Tỷ lệ lấp đầy bãi đỗ", "Pin TB", "Cổng sạc", "Trạng thái tải & kết nối", "Cập nhật cuối"], rows, "Tình trạng từng Hub")}
    <div class="grid dashboard-details">
      <details class="panel" data-details="dashboardMap"${ui.dashboardMap ? " open" : ""}><summary>Bản đồ vận hành</summary>
        <div class="map-area operator-map">${campusMap(hubs, active.hub.id)}</div>
        ${
        line(active.hub.name,
          "Cập nhật cuối " + time(active.hub.lastTelemetryAt) + " · " +
          active.stats.availableVehicles + " xe · " + active.stats.freeSlots + " ô trống",
          badge(active.stats.online ? "ONLINE" : "OFFLINE"))}
      </details>
      <details class="panel" data-details="dashboardLog"${ui.dashboardLog ? " open" : ""}><summary>Nhật ký vận hành</summary>
        ${s.audit.slice(-8).reverse().map((a) => line(a.message || a.action,
          time(a.at) + " · " + (a.userId || "Hệ thống"))).join("") ||
          empty("Chưa có thao tác vận hành.")}
      </details>
    </div>`;
}

const recallConfirmation = (id) =>
  button("Đội xác nhận thu hồi, xe chưa rời Hub", "dispatch.confirmRecall", { id }, "secondary");

function dispatchView(s, now, ui) {
  const pair = hubPair(s, ui),
    { sourceId, destId } = pair,
    live = RebalanceController.getEligibleVehicles(s, sourceId, destId);
  const formBody =
    hidden("sourceId", sourceId) +
    hidden("destId", destId) +
    hidden("versions", live.versions, true) +
    hidden("capacityVersion", live.capacityVersion) +
    "<fieldset><legend>Xe tại Hub nguồn</legend>" +
    (live.vehicles
      .map(
        (v) =>
          '<label class="list-row"><span><input type="checkbox" name="vehicleIds" value="' +
          esc(v.id) +
          '"> ' +
          esc(v.name) +
          " · " +
          esc(v.id) +
          "</span>" +
          muted(v.soc + "% pin") +
          "</label>",
      )
      .join("") || empty("Không có xe đủ điều kiện.")) +
    "</fieldset>" +
    field(
      "Đội tiếp nhận",
      select(
        "teamId",
        options(
          s.teams.filter(
            (t) => !t.type || ["TRANSPORT", "DISPATCH"].includes(t.type),
          ),
        ),
        "",
      ),
    ) +
    submit("Phát hành lệnh");
  const orders = s.orders
    .slice()
    .reverse()
    .map((o) => {
      const controls =
        o.status === "PENDING"
          ? o.assignmentStatus === "RECALL_REQUESTED"
            ? muted("Đang chờ xác nhận thu hồi. Các ô đích vẫn được giữ.") +
              row(
                recallConfirmation(o.id) +
                button("Đội báo xe đã rời Hub", "dispatch.start", { id: o.id }),
              )
            : row(
                button("Xác nhận xe đã rời Hub", "dispatch.start", { id: o.id }) +
                button("Hủy lệnh", "dispatch.cancel", { id: o.id }, "secondary"),
              )
          : "";
      return (
        "<article>" +
        line(
          o.id,
          hubName(s, o.sourceId) +
            " → " +
            hubName(s, o.destId) +
            " · " +
            o.items.filter((i) => i.status === "COMPLETED").length +
            "/" +
            o.items.length +
            " xe đã đến",
          badge(o.status),
        ) +
        o.items
          .map((i) =>
            line(
              i.vehicleId,
              "Ô đích " + i.slotId,
              i.status === "IN_TRANSIT"
                ? row(
                    button("Đã đến", "dispatch.receive", {
                      id: o.id,
                      vehicleId: i.vehicleId,
                      success: true,
                    }) +
                      button(
                        "Chưa bàn giao",
                        "dispatch.receive",
                        { id: o.id, vehicleId: i.vehicleId, success: false },
                        "secondary",
                      ),
                  )
                : badge(i.status),
            ),
          )
          .join("") +
        controls +
        "</article>"
      );
    })
    .join("");
  return stack(
    card(
      "Lập lệnh điều phối",
      pair.fields +
        line(
          "Sức chứa tại Hub nhận",
          live.slots.length + " ô dùng chung có thể giữ trước",
          badge(hubMetrics(s, destId, now).online ? "ONLINE" : "OFFLINE"),
        ) +
        form("dispatch.create", formBody),
    ) + card("Theo dõi bàn giao", orders || empty("Chưa có lệnh điều phối.")),
    "ops-columns dispatch-columns",
  );
}

function chargeView(s, now, ui) {
  const id = ui.opsHub || s.hubs[0].id,
    priority = ui.priorityId || "",
    plan = ChargingSchedulerController.getProposedSchedule(s, id, now, priority);
  const live = s.plans.findLast((p) => p.hubId === id);
  const rows = plan.rows.map((r, i) => `<tr>
    <td><strong>#${i + 1}</strong></td><td class="accent-text"><strong>${esc(r.vehicleId)}</strong></td>
    <td>${esc(r.portId)}</td><td>${time(r.start)} – ${time(r.end)}</td>
    <td>${esc(r.powerKw)} kW</td><td>${badge(r.active ? "CHARGING" : "CONFIRMED")}</td>
  </tr>`).join("");
  return stack(
    '<section class="panel power-panel">' +
      '<div><small>Phân bổ công suất</small><p><strong>' +
        esc(plan.liveKw + " kW đang sử dụng") +
        '</strong> / Giới hạn ' + esc(plan.limit) + ' kW</p><small>Dự kiến cao nhất ' + esc(plan.peakKw) + ' kW</small></div>' +
      hubPick(s, "opsHub", id, "Hub lập lịch") +
        field(
          "Ưu tiên trong hàng đợi",
          setting(
            "priorityId",
            [
              ["", "Theo điểm ưu tiên"],
              ...plan.rows.map((r) => [r.id, r.id + " · " + r.vehicleId]),
            ],
            priority,
          ),
        ) +
        field("Phản hồi cổng khi đủ điều kiện", setting("scheduleOutcome", [
          ["ok", "Xác nhận cấp điện"], ["timeout", "Không phản hồi"], ["fault", "Báo lỗi"],
        ], ui.scheduleOutcome || "ok")) +
        ((ui.scheduleOutcome && ui.scheduleOutcome !== "ok")
          ? field("Cổng mô phỏng phản hồi", setting("scheduleFailurePort", [
              ["", "Tất cả cổng"], ...options(s.ports.filter((port) => port.hubId === id)),
            ], ui.scheduleFailurePort || ""))
          : "") +
        button("Áp dụng kế hoạch", "schedule.apply", {
          hubId: id,
          priorityId: priority,
          outcome: ui.scheduleOutcome || "ok",
          failurePortId: ui.scheduleFailurePort || "",
          plan: { signature: plan.signature },
        }, "success") +
      "</section>" +
      table(["Thứ tự", "Phương tiện", "Cổng sạc", "Khung giờ sạc", "Công suất", "Trạng thái"], rows ||
        '<tr><td colspan="6">' + empty("Chưa có lịch sạc tại Hub này.") + "</td></tr>", "Lịch sạc tại Hub") +
      card(
        "Kế hoạch đã áp dụng",
        live
          ? line(
              live.id,
              time(live.createdAt) +
                " · " +
                live.rows.map((r) => r.vehicleId).join(" → "),
            ) + s.deviceCommands.filter((request) => request.planId === live.id)
              .map((request) => line(request.targetId + " · " + request.id,
                request.message || "Chờ xác nhận thiết bị", badge(request.result))).join("")
          : empty("Chưa có kế hoạch được duyệt tại Hub này."),
        "panel-info",
      ),
  );
}

function remedyForm(s, i, b, now) {
  if (b.status !== "AFFECTED")
    return line(b.id, "Chủ đơn " + b.userId, badge(b.remedyStatus || b.status));
  const key = b.portId
    ? "portId"
    : b.type === "PARKING"
      ? "slotId"
      : "vehicleId";
  const pool =
    key === "portId"
      ? s.ports
      : key === "slotId"
        ? s.slots.filter((x) => x.type === "PRIVATE")
        : s.vehicles;
  const choices = pool.filter(
    (x) =>
      x.id !== b[key] &&
      x.hubId === b.hubId &&
      !x.blocked &&
      (key !== "vehicleId" || x.status === "AVAILABLE"),
  );
  const timeFields =
    key === "vehicleId"
      ? ""
      : row(
          field(
            "Bắt đầu sau (phút)",
            number(
              "startMinutes",
              Math.max(1, Math.ceil((b.start - now) / 60000)),
              1,
              10080,
            ),
          ) +
            field(
              "Thời lượng (phút)",
              number(
                "durationMinutes",
                Math.max(1, Math.round((b.end - b.start) / 60000)),
                1,
                10080,
              ),
            ),
        );
  return (
    line(b.id, "Chủ đơn " + b.userId, badge("AFFECTED")) +
    form(
      "incident.remedy",
      hidden("id", i.id) +
        hidden("recordId", b.id) +
        field(
          "Tài nguyên thay thế",
          select("replacementId", options(choices), ""),
        ) +
        field(
          "Phương án",
          select(
            "decision",
            [
              ["REPLACED", "Thay thế"],
              ["RESCHEDULED", "Đặt lại lịch"],
            ],
            "",
          ),
        ) +
        timeFields +
        submit("Lưu phương án"),
    ) +
    button(
      "Hủy đơn và hoàn khoản giữ",
      "incident.remedy",
      { id: i.id, recordId: b.id, decision: "CANCELLED" },
      "secondary",
    )
  );
}
function incidents(s, now, ui) {
  const id = ui.opsHub || s.hubs[0].id,
    assets = [...s.vehicles, ...s.ports, ...s.slots].filter(
      (x) => x.hubId === id,
    );
  const closed = (incident) => ["RESOLVED", "CANCELLED"].includes(incident.status);
  const pendingResend = s.workOrders.some((order) => order.status === "PENDING_RESEND");
  return stack(
    card(
      "Ghi nhận sự cố",
      hubPick(s, "opsHub", id, "Chọn Hub") +
        form(
          "incident.open",
          field(
            "Tài nguyên",
            select(
              "targetId",
              assets.map((x) => [x.id, x.id + " · " + (x.name || x.status)]),
              "",
            ),
          ) +
            field(
              "Hiện tượng",
              '<input required maxlength="240" name="reason" placeholder="Ví dụ: thiết bị không xác nhận khóa">',
            ) +
            submit("Chặn cấp phát và lập hồ sơ", "danger"),
        ),
    ) +
      card(
        "Hồ sơ xử lý",
        (pendingResend ? button("Gửi lại các phiếu đang chờ", "incident.resendPending", {}, "secondary") : "") +
        (s.incidents.length
          ? IncidentService.syncDashboard(s)
              .map((i) => {
                const wo = s.workOrders.find((w) => w.incidentId === i.id);
                const inspectionStatus = assets.find((asset) => asset.id === i.targetId)?.inspectionStatus;
                const stop = !closed(i) && s.ports.some((p) => p.id === i.targetId && p.relayOn)
                  ? button("Yêu cầu ngắt điện an toàn", "incident.stopCharging", { id: i.id, outcome: "ok" }, "danger") +
                    button("Mô phỏng ngắt điện lỗi", "incident.stopCharging", { id: i.id, outcome: "fault" }, "secondary")
                  : "";
                const controls = [
                  "ISOLATING",
                  "PENDING_CHECK",
                  "ALERT",
                ].includes(i.status)
                  ? button("Xác nhận cách ly an toàn", "incident.isolate", {
                      id: i.id,
                      outcome: "OK",
                    }) +
                    button(
                      "Thiết bị không phản hồi",
                      "incident.isolate",
                      { id: i.id, outcome: "TIMEOUT" },
                      "secondary",
                    )
                  : i.status === "ISOLATED"
                    ? button("Gửi phiếu bảo trì", "incident.work", {
                        id: i.id,
                        outcome: "OK",
                      }) +
                      button(
                        "Mô phỏng gửi lỗi",
                        "incident.work",
                        { id: i.id, outcome: "TIMEOUT" },
                        "secondary",
                      )
                    : i.status === "IN_REPAIR"
                      ? (wo?.status === "SENT" ? button("Xác nhận đang sửa", "incident.workInProgress", { id: i.id }, "secondary") : "") +
                        button("Xác nhận sửa xong", "incident.resolve", {
                          id: i.id,
                        })
                      : "";
                return (
                  "<article>" +
                  line(
                    i.targetId + " · " + i.reason,
                    i.id + " · " + time(i.createdAt) + " · " +
                      (incidentCategories[i.category] || "Chưa phân loại") + " · " +
                      (incidentSeverities[i.severity] || "Trung bình"),
                    badge(i.status),
                  ) +
                  (closed(i) ? "" : '<details><summary>Phân loại và xếp mức độ</summary>' +
                    form("incident.classify",
                      hidden("id", i.id) +
                      field("Loại sự cố", select("category", Object.entries(incidentCategories), i.category || "OTHER")) +
                      field("Mức độ", select("severity", Object.entries(incidentSeverities), i.severity || "MEDIUM")) +
                      submit("Lưu phân loại", "secondary")) + "</details>") +
                  (inspectionStatus && !closed(i) ? line("Kiểm tra tài nguyên", i.targetId, badge(inspectionStatus)) : "") +
                  row(stop + controls) +
                  (IncidentService.canCancel(s, i) ? '<details><summary>Hủy hồ sơ sự cố</summary>' +
                    form("incident.cancel", hidden("id", i.id) +
                      field("Lý do hủy", '<input name="reason" maxlength="240" required>') +
                      submit("Xác nhận hủy", "secondary")) + "</details>" : "") +
                  (i.cancelReason ? muted(i.cancelReason) : "") +
                  (wo ? line(wo.id, (s.teams.find((team) => team.id === wo.teamId)?.name || "Phiếu bảo trì") +
                    " · Ưu tiên " + (incidentSeverities[wo.priority || i.severity] || "Trung bình"), badge(wo.status)) : "") +
                  (i.affected || [])
                    .map((id) =>
                      [...s.reservations, ...s.schedules].find(
                        (b) => b.id === id,
                      ),
                    )
                    .filter(Boolean)
                    .map((b) => remedyForm(s, i, b, now))
                    .join("") +
                  "</article>"
                );
              })
              .join("")
          : empty("Chưa có hồ sơ sự cố.")),
      ),
    "ops-columns incident-columns",
  );
}

function whatIf(s, now, ui) {
  const pair = hubPair(s, ui);
  const results = s.scenarios.filter((item) => ["COMPLETED", "FAILED"].includes(item.status));
  const resultId = results.find((item) => item.id === ui.savedScenarioId)?.id || results.at(-1)?.id;
  const scenario = resultId && SimulationService.getSavedScenario(s, resultId);
  const templates = s.scenarios.filter((item) => item.status === "DRAFT");
  const recLabel = (item) => ({
    REDISTRIBUTE: "Điều phối " + item.amount + " xe",
    RESCHEDULE_CHARGING: "Áp dụng thứ tự sạc tại Hub",
    REDIRECT_USERS: "Thông báo chuyển hướng nhận xe",
  })[item.type];
  const recs = RecommendationService.getRecommendations(s, scenario?.id);
  const snapshotHasSensorFreshness = scenario?.snapshot?.every((hub) => Array.isArray(hub.staleSensorIds));
  const confidence = scenario?.confidence === "LIMITED" ? "Độ tin cậy hạn chế"
    : snapshotHasSensorFreshness ? "Độ tin cậy cao" : "Chưa có đánh giá độ mới từng cảm biến";
  const pending = recs.filter((r) => r.status === "PENDING");
  const batch =
    pending.length > 1
      ? form(
          "recommendation.batch",
          hidden("scenarioId", scenario.id) +
            "<fieldset><legend>Áp dụng theo nhóm</legend>" +
            pending
              .map(
                (r) =>
                  '<label class="list-row"><span><input type="checkbox" checked name="ids" value="' +
                  esc(r.id) +
                  '"> ' +
                  esc(recLabel(r)) +
                  "</span></label>",
              )
              .join("") +
            "</fieldset>" +
            submit("Áp dụng các mục đã chọn") + '<details><summary>Từ chối các mục đã chọn</summary>' +
            field("Lý do từ chối", '<input name="reason" maxlength="240">') +
            '<button type="submit" class="btn secondary" data-submit-action="recommendation.rejectBatch">Từ chối nhóm</button></details>',
        )
      : "";
  const recActions = (r) => {
    if (r.status === "PENDING")
      return row(
          button("Áp dụng", "recommendation.apply", { id: r.id }) +
            button(
              "Từ chối",
              "recommendation.reject",
              { id: r.id },
              "secondary",
            ),
      ) + '<details><summary>Từ chối kèm lý do</summary>' + form("recommendation.reject",
        hidden("id", r.id) + field("Lý do từ chối", '<input name="reason" maxlength="240" required>') +
        submit("Lưu lý do và từ chối", "secondary")) + "</details>";
    if (r.status === "APPLIED")
      return button("Xử lý bù", "recommendation.compensate", { id: r.id }, "secondary");
    const order = s.orders.find((item) => item.id === r.orderId);
    return r.status === "PENDING_CHECK" && order?.assignmentStatus === "RECALL_REQUESTED"
      ? recallConfirmation(order.id) : "";
  };
  return stack(
    card(
      "Kịch bản nhu cầu di chuyển",
      pair.fields +
        form(
          "simulation.run",
          hidden("sourceId", pair.sourceId) +
            hidden("destId", pair.destId) +
            row(
              field(
                "Nhu cầu so với thông thường (%)",
                number(
                  "demandPct",
                  s.config.simulation.defaultDemandPct,
                  0,
                  500,
                ),
              ) +
                field(
                  "Thời gian dự báo (phút)",
                  number(
                    "durationMin",
                    60,
                    1,
                    s.config.simulation.maxDurationMin,
                  ),
                ),
            ) +
            submit("Chạy mô phỏng") +
            '<button type="submit" class="btn secondary" data-submit-action="simulation.template">Lưu mẫu kịch bản</button>',
        ) +
        (templates.length ? '<details><summary>Mẫu kịch bản đã lưu</summary>' +
          templates.slice().reverse().map((item) => line(item.name,
            item.demandPct + "% · " + item.durationMin + " phút",
            button("Chạy mẫu", "simulation.run", { templateId: item.id }, "secondary"))).join("") + "</details>" : "") +
        (results.length ? field("Kết quả đã lưu", setting("savedScenarioId", [["", "Mới nhất"], ...results.toReversed().map((item) =>
          [item.id, time(item.createdAt) + " · " + hubName(s, item.destId) + " · " + item.id])], ui.savedScenarioId || "")) : "") +
        '<section class="forecast"><h3>Dự báo diễn biến</h3>' +
        (scenario?.status === "FAILED" ? empty("Mô phỏng thất bại: " + scenario.error) : scenario
          ? line(
              hubName(s, scenario.destId),
              "Bản chụp " +
                time(scenario.createdAt) +
                " · " +
                scenario.durationMin +
                " phút · Nhu cầu " +
                scenario.demandPct +
                "% · " + confidence,
            ) +
              muted(
                "Nguồn dữ liệu: " +
                  scenario.snapshot
                    .map(
                      (h) =>
                        h.id +
                        " (" +
                        (h.online ? "trực tuyến" : "dữ liệu cũ") +
                        (h.staleSensorIds?.length ? ", cảm biến có dữ liệu cũ " + h.staleSensorIds.join(", ") : "") +
                        ", " +
                        time(h.lastTelemetryAt) +
                        ")",
                    )
                    .join(" · "),
              ) +
              scenario.forecast
                .map((f) =>
                  line(
                    "Phút " + f.minute,
                    f.pickups +
                      " lượt dự kiến · " +
                      f.available +
                      " xe còn lại" +
                      (f.freeSpaces === undefined ? "" : " · " + f.freeSpaces + " ô trống · " +
                        f.projectedKw + "/" + f.powerLimitKw + " kW · Hàng đợi " + f.queueLength),
                    muted("Thiếu " + f.shortfall + " xe"),
                  ),
                )
                .join("") +
              (scenario.bottlenecks || []).map((item) => muted(({
                VEHICLE_SHORTAGE: "Thiếu xe", PARKING_FULL: "Đầy ô", CHARGING_OVERLOAD: "Quá tải sạc",
              })[item.type] + " ở phút " + item.minute)).join("")
          : empty("Chạy kịch bản để xem dự báo và độ mới dữ liệu đầu vào.")) +
        "</section>",
    ) +
      card(
        "Duyệt khuyến nghị",
        recs.length
          ? recs
              .map(
                (r) =>
                  line(
                    recLabel(r),
                    r.note || r.reason ||
                      hubName(s, r.sourceId) + " → " + hubName(s, r.destId),
                    badge(r.status),
                  ) + recActions(r) + recommendationResults(s, r),
              )
              .join("") + batch
          : empty("Chưa có khuyến nghị cho kịch bản này."),
      ),
    "ops-columns scenario-columns",
  );
}

function recommendationResults(s, recommendation) {
  const results = RecommendationService.getCommandResults(s, recommendation);
  if (!results.length) return "";
  return '<details><summary>Kết quả lệnh</summary>' + results.map((item) =>
    line(item.id, item.message, badge(item.status))).join("") + "</details>";
}

function telemetry(s, now, ui) {
  const id = ui.opsHub || s.hubs[0].id;
  const devices = TelemetryService.telemetryDevices(s, id);
  const selected = devices.find((device) => device.resource.id === ui.telemetryDevice);
  const signal = (name, value) => select(name, [["false", "Không"], ["true", "Có"]], String(Boolean(value)));
  const payloadField = selected?.type === "PARKING_SPACE"
    ? field("Ô có xe", signal("occupied", selected.resource.vehicleId))
    : selected?.type === "CHARGING_PORT"
      ? field("Đã cắm cáp", signal("plugged", selected.resource.plugged)) +
        field("Relay đang cấp điện", signal("relayOn", selected.resource.relayOn)) +
        field("Pin phiên sạc (%)", '<input name="batteryPct" type="number" min="0" max="100" step="any" placeholder="Tùy chọn">') +
        field("Công suất đo được (kW)", '<input name="powerKw" type="number" min="0" step="any" placeholder="Tùy chọn">') +
        field("Điện năng tích lũy (kWh)", '<input name="energyKwh" type="number" min="0" step="any" placeholder="Tùy chọn">')
      : selected?.type === "VEHICLE"
        ? field("Mức pin gửi từ xe (%)", number("battery", selected.resource.soc, 0, 100))
        : field("Công suất đo được (kW)", '<input name="powerKw" type="number" min="0" step="0.1" placeholder="Tùy chọn">');
  return stack(
    '<section class="telemetry-controls" aria-label="Phát gói tin mô phỏng">' +
      hubPick(s, "opsHub", id, "Hub nguồn") +
        form(
          "telemetry.emit",
          hidden("hubId", id) +
            field(
              "Thiết bị",
              setting(
                "telemetryDevice",
                [
                  [id, "Bộ điều khiển Hub"],
                  ...devices.map(({ resource }) => [resource.id, resource.name || resource.id]),
                ],
                selected?.resource.id || id,
              ),
            ) + hidden("deviceId", selected?.resource.id || id) +
            field(
              "Loại sự kiện",
              select(
                "mode",
                [
                  ["live", "Gói hợp lệ / khôi phục kết nối"],
                  ["duplicate", "Gửi lại cùng mã gói"],
                  ["late", "Gói đến trễ"],
                  ["offline", "Hub mất kết nối"],
                  ["sensorOffline", "Cảm biến mất kết nối"],
                  ["corrupt", "Gói lỗi dữ liệu"],
                ],
                "",
              ),
            ) +
            payloadField +
            (selected ? field("Mô tả lỗi thiết bị", '<input name="fault" maxlength="240" placeholder="Tùy chọn">') : "") +
            submit("Phát gói tin") +
            '<button type="submit" class="btn secondary" data-submit-action="telemetry.register">Đăng ký cảm biến</button>',
        ) + "</section>" +
      card(
        "Nhật ký gói tin",
        s.telemetry.length
          ? s.telemetry
              .slice(-18)
              .reverse()
              .map((e) =>
                line(
                  e.deviceId + " · " + e.eventId,
                  time(e.timestamp) +
                    " · " +
                    (e.payload?.soc != null
                      ? e.payload.soc + "% pin"
                      : e.type === "PARKING_SPACE" ? "Cảm biến ô đỗ"
                        : e.type === "CHARGING_PORT" ? "Cảm biến cổng sạc" : "Tín hiệu Hub"),
                  badge(e.result),
                ),
              )
              .join("")
          : empty("Chưa nhận gói tin thủ công."),
        "telemetry-log",
      ) + card("Cảm biến đã ghi nhận", s.sensors.length
        ? s.sensors.map((sensor) => line(sensor.id, sensor.lastSeenAt ? time(sensor.lastSeenAt) : "Chưa có gói hợp lệ",
          badge(sensor.online ? "ONLINE" : "OFFLINE"))).join("")
        : empty("Chưa có bản ghi cảm biến.")),
  );
}
export function operatorView(page, s, now, ui) {
  const views = {
    "network-dashboard": ["", "", network],
    "vehicle-dispatch": ["Lập lệnh điều phối luân chuyển", "Chọn Hub nguồn, Hub nhận và phương tiện cần điều phối.", dispatchView],
    "charging-schedule": ["Lập và điều chỉnh lịch sạc", "Ưu tiên xe theo mức pin và nhu cầu sử dụng.", chargeView],
    incidents: ["Xử lý sự cố kỹ thuật", "Theo dõi sự cố, cách ly tài nguyên và gửi phiếu bảo trì.", incidents],
    "what-if": ["Mô phỏng kịch bản và áp dụng khuyến nghị", "Dự báo nhu cầu di chuyển và đánh giá phương án điều phối.", whatIf],
    telemetry: ["Cập nhật dữ liệu cảm biến", "Phát gói tin mô phỏng và kiểm tra dữ liệu IoT tại Hub.", telemetry],
  };
  const [title, description, view] = views[page];
  return (title ? `<header class="page-heading"><div><h1>${title}</h1><p>${description}</p></div></header>` : "") +
    view(s, now, ui);
}
