import { badge, button, esc, empty, field, icon, select, vehicleType } from "../../components/ui.js";
import { campusMap } from "../../components/hub-map.js";
import { HubService } from "../../application/student.js";
import { hubMetrics } from "../../domain/resources.js";

export function hubSearchField(query = "") {
  return `<label class="searchbox">${icon("search", 14)}
    <input id="query" type="search" aria-label="Tìm Hub hoặc khu vực" placeholder="Tìm Hub (Ga Metro, KTX A, BK...)" value="${esc(query)}">
  </label>`;
}

function hubFilters(ui, minSoc) {
  const types = [["", "Tất cả xe"], ["BIKE", "E-Bikes"], ["SCOOTER", "E-Scooters"]];
  return `<div class="map-toolbar">
    <div class="vehicle-filters" role="group" aria-label="Lọc phương tiện">
      ${types.map(([value, label]) => `<button type="button" data-set="type" value="${value}" aria-pressed="${(ui.type || "") === value}">${label}</button>`).join("")}
      <label class="battery-filter"><input type="checkbox" data-setting="high" ${ui.high ? "checked" : ""}>
        ${icon("battery", 14)} Pin ≥ ${esc(minSoc)}%
      </label>
    </div>
    <span class="refresh-label"><i class="status-dot"></i> Đang cập nhật</span>
  </div>`;
}

function resourceCard(label, symbol, count, capacity, note, className = "") {
  return `<div class="hub-resource ${className}">
    <div>${label}${icon(symbol, 14)}</div>
    <strong>${count}${capacity ? `<small>/${capacity}</small>` : ""}</strong>
    <small>${note}</small>
  </div>`;
}

function vehicleCard(vehicle, user) {
  return `<article class="vehicle-card">
    <span class="vehicle-icon">${icon(vehicle.type === "BIKE" ? "bike" : "bolt")}</span>
    <div class="vehicle-label"><strong>${esc(vehicleType(vehicle))} #${esc(vehicle.id)}</strong>
      <small>Ô ${esc(vehicle.slotId || "—")} · Pin <b>${esc(vehicle.soc)}%</b></small>
    </div>
    ${button(
      user ? "Đặt xe" : "Đăng nhập để đặt",
      user ? "previewBooking" : "login",
      { vehicleId: vehicle.id, hubId: vehicle.hubId, expectedVersion: vehicle.version },
      "secondary",
    )}
  </article>`;
}

function hubInspector(s, hub, stats, vehicles, user) {
  return `<div class="hub-overview">
    <div class="hub-heading"><span class="hub-code">HUB #${esc(hub.id)}</span>${badge(stats.online ? "ONLINE" : "OFFLINE")}</div>
    <h2>${esc(hub.name)}</h2>
    <p>${icon("pin", 14)} ${esc(hub.location)}</p>
  </div>
  <div class="hub-resources">
    ${resourceCard("Xe chia sẻ", "bike", stats.availableVehicles, 0, "Khả dụng (Pin ≥ " + esc(s.config.params.MIN_SOC_BOOK_PCT) + "%)", "hub-bikes")}
    ${resourceCard("Ô đỗ trống", "park", stats.freeSlots, stats.totalSlots, "Sẵn sàng nhận xe")}
    ${resourceCard("Cổng sạc", "plug", stats.freePorts, stats.totalPorts, "Cổng sạc tại Hub", "hub-ports")}
  </div>
  <section class="hub-vehicles">
    <div class="section-head"><h3>Phương tiện tại trạm</h3><span class="soft-label">${vehicles.length} xe sẵn sàng</span></div>
    <div class="vehicle-list">${vehicles.map((vehicle) => vehicleCard(vehicle, user)).join("") || empty("Chưa có xe đủ điều kiện đặt tại Hub này.")}</div>
  </section>
  <section class="reservation-summary">
    <div class="section-head"><h3>${icon("check")} Đặt trước phương tiện</h3></div>
    <p>Chọn xe tại Hub để giữ chỗ. Theo dõi mã nhận xe và hạn giữ trong mục Nhận &amp; Trả xe.</p>
    <a class="btn secondary" href="#/student/parking-charging">${icon("park")} Đặt trước vị trí đỗ xe cá nhân</a>
  </section>`;
}

export function searchView(s, user, ui, now = Date.now()) {
  const center = s.hubs.find((hub) => hub.id === ui.nearbyHub);
  const nearby = center && { lat: center.lat, lon: center.lon, radiusKm: Number(ui.nearbyRadius || 1) };
  const snapshots = HubService.searchHubs(
    s,
    {
      query: (ui.query || "").trim(),
      type: ui.type,
      minSoc: ui.high ? s.config.params.DEFAULT_SOC_FILTER_PCT : 0,
      nearby,
    },
    now,
  );
  const filtered = snapshots.filter((row) => !(ui.type || ui.high) || row.vehicles.length);
  const selected = filtered.find(({ hub }) => hub.id === ui.hubId) || filtered[0];
  const hubs = filtered.map(({ hub }) => ({
    hub,
    stats: hubMetrics(s, hub.id, now),
  }));
  const active = hubs.find(({ hub }) => hub.id === selected?.hub.id);
  const firstHub = s.hubs[0];
  return `<section class="explorer" aria-labelledby="explorer-title">
    <h1 class="sr-only" id="explorer-title">Bản đồ mạng lưới Hub</h1>
    <div class="map-area">
      ${campusMap(hubs, selected?.hub.id)}
      ${hubFilters(ui, s.config.params.DEFAULT_SOC_FILTER_PCT)}
      <div class="map-footer">
        <span>Bản đồ khu đô thị ĐHQG-HCM</span>
        ${firstHub && hubs.some(({ hub }) => hub.id === firstHub.id) ? `<button type="button" data-set="hubId" value="${esc(firstHub.id)}">${icon("location", 14)} ${esc(firstHub.name)}</button>` : ""}
      </div>
    </div>
    <aside class="hub-inspector" aria-label="Chi tiết Hub">
      <details data-details="nearbyFilter"${ui.nearbyFilter ? " open" : ""}><summary>Lọc theo bán kính</summary>
        ${field("Mốc tọa độ", select("nearbyHub", [["", "Tất cả Hub"], ...s.hubs.map((hub) => [hub.id, hub.name])],
          ui.nearbyHub || "").replace("<select ", '<select data-setting="nearbyHub" '))}
        ${field("Bán kính", select("nearbyRadius", [[0.5, "0,5 km"], [1, "1 km"], [2, "2 km"], [5, "5 km"]],
          ui.nearbyRadius || "1").replace("<select ", '<select data-setting="nearbyRadius" '))}
      </details>
      ${active ? hubInspector(s, active.hub, active.stats, selected.vehicles, user) : empty("Chưa tìm thấy Hub phù hợp.")}
      <div class="hub-list" role="group" aria-label="Danh sách Hub">
        ${hubs.map(({ hub, stats }) => `<button class="hub-choice" type="button" data-set="hubId" value="${esc(hub.id)}" aria-pressed="${hub.id === selected?.hub.id}">
          <span class="status-dot ${stats.online ? "" : "offline"}"></span><span>${esc(hub.name)}</span>${icon("chevron", 14)}
        </button>`).join("")}
      </div>
    </aside>
  </section>`;
}
