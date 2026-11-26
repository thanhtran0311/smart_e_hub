import { lookup } from "../domain/resources.js";
import { User } from "../domain/entities.js";
import { cloneOperationalState, hydrateOperationalState } from "./operational-snapshot.js";

const key = "ehub_state";
const sessionKey = "ehub_session_user";
const schema = 1;
const mockSsoPrefix = "mock-vnu-sso:";

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
    return User.prototype.getUserId.call(account);
  }
  static requireRole(user, role) {
    if (!(user instanceof User ? user.hasPermission(role) : user?.roles.includes(role)))
      throw new Error("Tài khoản chưa có quyền thực hiện thao tác này.");
    return user;
  }

  static authenticateVnuSso(ssoToken, users) {
    const userId = typeof ssoToken === "string" && ssoToken.startsWith(mockSsoPrefix)
      ? ssoToken.slice(mockSsoPrefix.length) : null;
    const user = users.find((row) => row.id === userId);
    if (!user) throw new Error("Token VNU-SSO mô phỏng không hợp lệ.");
    return user;
  }

  static validateSession(token, state) {
    if (typeof token !== "string") return false;
    const userId = token.startsWith(mockSsoPrefix) ? token.slice(mockSsoPrefix.length) : token;
    return userId === state.userId && state.users.some((user) => user.id === userId);
  }

  static logout(store) {
    store.logout();
  }
}

export class OperationalStore {
  #seed;
  #storage;
  #clock;
  #state;
  #lockManager;
  #sessionStorage;
  #locked = false;
  #writing = false;

  static openShared(seed, { storage, sessionStorage, lockManager, now }) {
    return lockManager.request(key, () => {
      const store = new OperationalStore(seed, { storage, now });
      store.#lockManager = lockManager;
      store.#sessionStorage = sessionStorage;
      store.#state = immutable({
        ...store.state,
        userId: sessionStorage.getItem(sessionKey),
      });
      return store;
    });
  }

  constructor(seed, { storage = null, now = Date.now } = {}) {
    this.#seed = structuredClone(seed);
    this.#storage = storage;
    this.#clock = now;
    this.#state = this.#readSaved();
    if (!this.#state) this.reset();
  }

  #readSaved() {
    const raw = this.#storage?.getItem(key);
    let saved;
    try {
      if (raw) saved = JSON.parse(raw);
    } catch {
      return null;
    }
    if (
      saved?.schema !== schema ||
      !Object.keys(seedFiles).every((prop) =>
        prop === "config" ? saved.config?.params : Array.isArray(saved[prop]),
      ) ||
      !Number.isFinite(saved.offsetMs)
    ) return null;

    return immutable(hydrateOperationalState(withRuntimeCollections({
      ...saved,
      userId: this.#sessionStorage ? this.#sessionStorage.getItem(sessionKey) : saved.userId,
      hubs: saved.hubs.map((hub) => {
        const origin = this.#seed.hubs.find((row) => row.id === hub.id);
        return { lat: origin?.lat, lon: origin?.lon, ...hub };
      }),
    })));
  }

  // Refresh inside the origin-wide lock so validation sees the last committed snapshot.
  withExclusive(change) {
    if (!this.#lockManager) return change();
    return this.#lockManager.request(key, async () => {
      this.#locked = true;
      try {
        this.#state = this.#readSaved() ?? immutable(this.#initialState(this.state.userId));
        return await change();
      } finally {
        this.#locked = false;
      }
    });
  }

  get state() {
    return this.getRealtimeNetworkStatus();
  }

  getRealtimeNetworkStatus() {
    return this.#state;
  }

  readConfig(key, hubId) {
    const config = this.state.config;
    if (key === "HUB_POWER_LIMIT" || key === "hubPowerLimitKw")
      return hubId == null ? config.hubPowerLimitKw : config.hubPowerLimitKw[hubId];
    return config.params[key] ?? config[key];
  }
  get user() {
    const { userId, users } = this.state;
    return AuthService.validateSession(userId, this.state) ? lookup(users, userId) : null;
  }
  now() {
    return this.#clock() + this.state.offsetMs;
  }
  requireRole(role) {
    return AuthService.requireRole(this.user, role);
  }

  #persist(next) {
    hydrateOperationalState(next);
    // A quota error leaves the previous in-memory snapshot and disk snapshot untouched.
    try {
      const stored = this.#sessionStorage ? { ...next, userId: null } : next;
      this.#storage?.setItem(key, JSON.stringify(stored));
    } catch {
      throw new Error(
        "Không lưu được trạng thái demo. Kiểm tra dung lượng hoặc quyền lưu trữ.",
      );
    }
    this.#state = immutable(next);
  }

  #requireLock() {
    if (this.#lockManager && !this.#locked)
      throw new Error("Thay đổi dữ liệu dùng chung cần được thực hiện trong khóa.");
  }

  transaction(change) {
    return this.beginTransaction(change);
  }

  beginTransaction(change) {
    this.#requireLock();
    if (this.#writing) throw new Error("Giao dịch lồng nhau không hợp lệ.");
    this.#writing = true;
    try {
      const next = cloneOperationalState(this.state);
      const value = change(next, this.now());
      if (value?.then) throw new Error("Giao dịch phải kết thúc đồng bộ.");
      next.revision++;
      this.#persist(next);
      return value;
    } finally {
      this.#writing = false;
    }
  }
  #initialState(userId) {
    return hydrateOperationalState(withRuntimeCollections({
      ...seedTime(this.#seed, this.#clock()),
      schema,
      offsetMs: 0,
      revision: 0,
      userId,
    }));
  }

  reset() {
    this.#requireLock();
    this.#persist(this.#initialState(null));
    this.#sessionStorage?.removeItem(sessionKey);
  }

  #setUserId(userId) {
    if (this.#sessionStorage) {
      if (userId) this.#sessionStorage.setItem(sessionKey, userId);
      else this.#sessionStorage.removeItem(sessionKey);
      this.#state = immutable({ ...this.state, userId });
    } else {
      this.transaction((draft) => {
        draft.userId = userId;
      });
    }
  }

  login(username, password, role) {
    const userId = AuthService.authenticate(
      this.state.users,
      username,
      password,
    );
    const account = AuthService.authenticateVnuSso(mockSsoPrefix + userId, this.state.users);
    if (role) AuthService.requireRole(account, role);
    this.#setUserId(userId);
    return lookup(this.state.users, userId);
  }
  logout() {
    this.#setUserId(null);
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
    if (!hub.offline) hub.updateTelemetryHeartbeat(time);
  }
}

export async function loadStore() {
  if (!navigator.locks)
    throw new Error("Trình duyệt cần hỗ trợ Web Locks. Hãy mở demo trên localhost hoặc 127.0.0.1.");
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
  return OperationalStore.openShared(Object.fromEntries(entries), {
    storage: window.localStorage,
    sessionStorage: window.sessionStorage,
    lockManager: navigator.locks,
  });
}
