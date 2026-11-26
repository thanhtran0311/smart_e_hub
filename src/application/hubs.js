import { ensure, getRow, touch } from "../domain/student-rules.js";
import { VehicleService } from "./vehicle.js";

export class HubService {
  static searchHubs(
    state,
    { nearby, ...filters } = {},
    now = Date.now(),
  ) {
    const hubs = nearby ? HubService.getNearbyHubs(state.hubs, nearby) : state.hubs;
    return HubService.filterHubs(state, filters, now, hubs);
  }

  static filterHubs(
    state,
    { query = "", type = "", minSoc = 0, minAvailableVehicles = 0 } = {},
    now = Date.now(),
    hubs = state.hubs,
  ) {
    const fold = (value) =>
      value
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .replaceAll("đ", "d");
    return hubs
      .filter((hub) =>
        fold(hub.id + " " + hub.name + " " + hub.zone).includes(fold(query)),
      )
      .map((hub) => ({
        hub,
        vehicles: HubService.getHubVehicles(state, hub.id, { type, minSoc }, now),
      }))
      .filter((result) => result.vehicles.length >= minAvailableVehicles);
  }

  static getHubDetail(state, hubId) {
    return getRow(state.hubs, hubId);
  }

  static getHubVehicles(state, hubId, filters, now) {
    return VehicleService.findAvailableVehicles(state, hubId, filters, now);
  }

  static updateHubTelemetry(hub, currentPowerKw, timestamp, now) {
    hub.updateTelemetryHeartbeat(timestamp);
    hub.offline = false;
    if (currentPowerKw !== undefined)
      touch(hub, { measuredPowerKw: currentPowerKw, measuredPowerAt: timestamp }, now);
  }

  static getNearbyHubs(hubs, { lat, lon, radiusKm }) {
    ensure(
      Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lon) && Math.abs(lon) <= 180 &&
      Number.isFinite(radiusKm) && radiusKm > 0,
      "Tọa độ hoặc bán kính tra cứu không hợp lệ.",
    );
    const radians = Math.PI / 180;
    return hubs.filter((hub) => Number.isFinite(hub.lat) && Number.isFinite(hub.lon))
      .map((hub) => {
        const a = Math.sin((hub.lat - lat) * radians / 2) ** 2 +
          Math.cos(lat * radians) * Math.cos(hub.lat * radians) * Math.sin((hub.lon - lon) * radians / 2) ** 2;
        return { hub, distance: 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a))) };
      }).filter(({ distance }) => distance <= radiusKm)
      .sort((a, b) => a.distance - b.distance)
      .map(({ hub }) => hub);
  }
}
