import { alertsForHubs, hubMetrics, networkSnapshot } from "../domain/resources.js";
import { appendNotification } from "../domain/notifications.js";
import { NOTIFICATION_TYPE, ROLE } from "../utils/status.js";

const reportColumns = [
  "id", "name", "availableVehicles", "occupiedSlots", "freeSlots", "currentPowerKw",
  "powerLimitKw", "loadStatus", "needsRebalance", "lastTelemetryAt",
];

export class MonitoringService {
  static getNetworkOverviewSnapshot(state, now) {
    return networkSnapshot(state, now, MonitoringService.checkNetworkAnomalies);
  }

  static evaluateHubLoadStatus(state, hubId, now) {
    return hubMetrics(state, hubId, now).loadStatus;
  }

  static checkNetworkAnomalies(hubs) {
    return alertsForHubs(hubs);
  }

  static exportNetworkReport(snapshot, format) {
    if (format !== "csv") return JSON.stringify(snapshot, null, 2);
    const csvCell = (value) => '"' + String(value ?? "").replaceAll('"', '""') + '"';
    const rows = snapshot.hubs.map((hub) => reportColumns.map((key) => csvCell(hub[key])).join(","));
    return "\uFEFF" + [reportColumns.join(","), ...rows].join("\r\n");
  }

  static triggerRebalanceAlertIfNeeded(state, now) {
    for (const hub of state.hubs) {
      const metrics = hubMetrics(state, hub.id, now);
      if (!metrics.online || Boolean(hub.rebalanceAlertActive) === metrics.needsRebalance) continue;
      hub.rebalanceAlertActive = metrics.needsRebalance;
      if (metrics.needsRebalance)
        appendNotification(state, {
          target: ROLE.OPERATOR, type: NOTIFICATION_TYPE.WARNING, relatedId: hub.id,
          title: "Cảnh báo thiếu xe khả dụng",
          message: hub.name + " còn " + metrics.availableVehicles + " xe khả dụng. Kiểm tra phương án điều phối.",
        }, now);
    }
  }
}

export const { triggerRebalanceAlertIfNeeded } = MonitoringService;
