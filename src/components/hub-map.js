import { esc } from "./ui.js";

const mapLabels = {
  "H-02": "KTX Khu A",
  "H-04": "ĐH Bách Khoa",
  "H-05": "KTX Khu B",
};

export function campusMap(hubs, selected) {
  return `<img class="map-art" src="./assets/images/campus-schematic.svg" alt="">
    <div class="map-pins" aria-label="Các Hub trên bản đồ">
      ${hubs.map(({ hub, stats }) => `<button type="button"
        class="map-pin ${hub.id === selected ? "picked" : ""} ${stats.online ? "" : "offline"}"
        data-set="hubId" value="${esc(hub.id)}" aria-label="${esc(hub.name)}" aria-pressed="${hub.id === selected}"
        style="--hub-x:${Number(hub.x)}%;--hub-y:${Number(hub.y)}%">
        <span class="status-dot"></span><span><b>${esc(mapLabels[hub.id] || hub.name)}</b>
        <small>${stats.online ? stats.availableVehicles + " Xe • " + stats.freeSlots + " Ô trống • " + stats.freePorts + " Cổng sạc" : "Mất kết nối"}</small></span>
      </button>`).join("")}
    </div>`;
}
