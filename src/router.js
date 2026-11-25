export const pages = {
  "student/hub-search": ["Bản đồ Hub", "map"],
  "student/pickup-return": ["Hành trình của tôi", "bike"],
  "student/parking-charging": ["Đỗ xe & sạc pin", "bolt"],
  "operator/network-dashboard": ["Giám sát mạng lưới", "activity"],
  "operator/vehicle-dispatch": ["Điều phối xe", "route"],
  "operator/charging-schedule": ["Lịch sạc", "clock"],
  "operator/incidents": ["Sự cố & bảo trì", "wrench"],
  "operator/what-if": ["Mô phỏng What-if", "layers"],
  "operator/telemetry": ["Telemetry IoT", "radio"],
};
export function resolveRoute(hash, user) {
  const key = hash.replace(/^#\/?/, "");
  if (!key) return { key: "", role: null };
  if (!Object.hasOwn(pages, key)) return { error: "Không tìm thấy màn hình này." };
  const role = key.split("/")[0];
  return user?.roles.includes(role)
    ? { key, role }
    : { key, denied: true, role };
}
export function home(user) {
  return user?.roles.includes("student")
    ? "student/hub-search"
    : "operator/network-dashboard";
}
