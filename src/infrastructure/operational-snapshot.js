import {
  AuditLog, ChargingCommand, ChargingPlan, ChargingPort, ChargingSchedule, ChargingSession,
  DispatchOrder, Hub, Incident, Notification, ParkingReservation, ParkingSpace, PrivateVehicle,
  Recommendation, Reservation, Sensor, SharedVehicle, SimulationScenario, TelemetryEvent, Trip,
  User, WorkOrder,
} from "../domain/entities.js";

const entityCollections = {
  audit: AuditLog,
  deviceCommands: ChargingCommand,
  plans: ChargingPlan,
  ports: ChargingPort,
  schedules: ChargingSchedule,
  sessions: ChargingSession,
  orders: DispatchOrder,
  hubs: Hub,
  incidents: Incident,
  notifications: Notification,
  slots: ParkingSpace,
  privateVehicles: PrivateVehicle,
  recommendations: Recommendation,
  reservations: Reservation,
  sensors: Sensor,
  vehicles: SharedVehicle,
  scenarios: SimulationScenario,
  telemetry: TelemetryEvent,
  trips: Trip,
  users: User,
  workOrders: WorkOrder,
};

export function hydrateOperationalState(state) {
  for (const [collection, Entity] of Object.entries(entityCollections)) {
    if (!Array.isArray(state[collection])) continue;
    const rows = state[collection];
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const Type = collection === "reservations" && row.type === "PARKING" ? ParkingReservation : Entity;
      if (!(row instanceof Type)) rows[index] = new Type(row);
    }
  }
  return state;
}

export function cloneOperationalState(state) {
  return hydrateOperationalState(structuredClone(state));
}
