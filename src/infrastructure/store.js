import { lookup } from "../domain/resources.js";

const key = "ehub_state";
const schema = 1;

export const seedFiles = {
  config: "config",
  hubs: "hubs",
  users: "users",
  slots: "parking-spaces",
  vehicles: "vehicles",
  ports: "charging-points",
  privateVehicles: "private-vehicles",
  reservations: "reservations",
  trips: "trips",
  schedules: "charging-schedules",
  sessions: "charging-sessions",
  orders: "dispatch-orders",
  incidents: "incidents",
  workOrders: "work-orders",
  scenarios: "simulation-scenarios",
  recommendations: "recommendations",
  telemetry: "telemetry-events",
  notifications: "notifications",
  audit: "audit-logs",
  teams: "teams",
  tariffs: "tariffs",
};

// Relative seed times keep bookings demonstrable whenever a fresh demo starts.
function seedTime(value, now) {
  if (Array.isArray(value)) return value.map((item) => seedTime(item, now));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([name, item]) => [name, seedTime(item, now)]),
    );
  if (typeof value === "string" && /^@now([+-]\d+m)?$/.test(value))
    return now + (parseInt(value.slice(4), 10) || 0) * 60_000;
  return value;
}

function immutable(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(immutable);
    Object.freeze(value);
  }
  return value;
}

function withRuntimeCollections(snapshot) {
  const collections = ["plans", "deviceCommands", "sensors"];
  return {
    ...snapshot,
    ...Object.fromEntries(collections.map((name) => [
      name,
      Array.isArray(snapshot[name]) ? snapshot[name] : [],
    ])),
  };
}

export class AuthService {
  static authenticate(users, username, password) {
    const account = users.find(
      (row) => row.username === username && row.password === password,
    );
    if (!account) throw new Error("Tên đăng nhập hoặc mật khẩu chưa đúng.");
    return account.id;
  }
  static requireRole(user, role) {
    if (!user?.roles.includes(role))
      throw new Error("Tài khoản chưa có quyền thực hiện thao tác này.");
    return user;
  }
}

export class OperationalStore {
  #seed;
  #storage;
  #clock;
  #state;
  #writing = false;
  constructor(seed, { storage = null, now = Date.now } = {}) {
    this.#seed = structuredClone(seed);
    this.#storage = storage;
    this.#clock = now;
    const raw = storage?.getItem(key);
    if (raw) {
      let saved;
      try {
        saved = JSON.parse(raw);
      } catch {
        /* Recover from an interrupted or obsolete demo. */
      }
      if (
        saved?.schema === schema &&
        Object.entries(seedFiles).every(([prop]) =>
          prop === "config" ? saved.config?.params : Array.isArray(saved[prop]),
        ) &&
        Number.isFinite(saved.offsetMs)
      )
        this.#state = immutable(withRuntimeCollections({
          ...saved,
          hubs: saved.hubs.map((hub) => {
            const origin = this.#seed.hubs.find((row) => row.id === hub.id);
            return { lat: origin?.lat, lon: origin?.lon, ...hub };
          }),
        }));
    }
    if (!this.#state) this.reset();
  }

  get state() {
    return this.#state;
  }
  get user() {
    return this.state.users.find((row) => row.id === this.state.userId) ?? null;
  }
  now() {
    return this.#clock() + this.state.offsetMs;
  }
  requireRole(role) {
    return AuthService.requireRole(this.user, role);
  }

  #persist(next) {
    // A quota error leaves the previous in-memory snapshot and disk snapshot untouched.
    try {
      this.#storage?.setItem(key, JSON.stringify(next));
    } catch {
      throw new Error(
        "Không lưu được trạng thái demo. Kiểm tra dung lượng hoặc quyền lưu trữ.",
      );
    }
    this.#state = immutable(next);
  }
  transaction(change) {
    if (this.#writing) throw new Error("Giao dịch lồng nhau không hợp lệ.");
    this.#writing = true;
    try {
      const next = structuredClone(this.state);
      const value = change(next, this.now());
      if (value?.then) throw new Error("Giao dịch phải kết thúc đồng bộ.");
      next.revision++;
      this.#persist(next);
      return value;
    } finally {
      this.#writing = false;
    }
  }
  reset() {
    const initial = seedTime(this.#seed, this.#clock());
    this.#persist(withRuntimeCollections({
      ...initial,
      schema,
      offsetMs: 0,
      revision: 0,
      userId: null,
    }));
  }
  login(username, password, role) {
    const userId = AuthService.authenticate(
      this.state.users,
      username,
      password,
    );
    if (role) AuthService.requireRole(lookup(this.state.users, userId), role);
    this.transaction((draft) => {
      draft.userId = userId;
    });
    return lookup(this.state.users, userId);
  }
  logout() {
    this.transaction((draft) => {
      draft.userId = null;
    });
  }
  heartbeat() {
    this.transaction((draft, now) => updateHeartbeats(draft, now));
  }
  advance(minutes) {
    if (!Number.isFinite(minutes) || minutes <= 0)
      throw new Error("Khoảng tăng thời gian phải lớn hơn 0.");
    this.transaction((draft, now) => {
      draft.offsetMs += minutes * 60_000;
      updateHeartbeats(draft, now + minutes * 60_000);
    });
  }
}

function updateHeartbeats(draft, time) {
  for (const hub of draft.hubs) {
    if (!hub.offline) hub.lastTelemetryAt = Math.max(hub.lastTelemetryAt, time);
  }
}

export async function loadStore() {
  const entries = await Promise.all(
    Object.entries(seedFiles).map(async ([collection, name]) => {
      const response = await fetch(
        new URL("../../data/" + name + ".json", import.meta.url),
      );
      if (!response.ok)
        throw new Error("Không thể đọc dữ liệu mẫu " + name + ".");
      return [collection, await response.json()];
    }),
  );
  return new OperationalStore(Object.fromEntries(entries), {
    storage: window.localStorage,
  });
}
