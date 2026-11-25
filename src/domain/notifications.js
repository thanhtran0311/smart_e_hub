import { uid } from "./resources.js";
import { NOTIFICATION_TYPE, ROLE } from "../utils/status.js";

export function appendNotification(state, message, now) {
  const record = { id: uid("NTF"), ...message, at: now };
  state.notifications.push(record);
  return record;
}

export function notifyRedirect(state, title, message, relatedId, now) {
  const interval = (state.config.params.REDIRECT_NOTIFICATION_INTERVAL_SEC ?? 60) * 1000;
  const recipients = state.users.filter((user) => user.roles.includes(ROLE.STUDENT));
  return recipients.filter((user) => !state.notifications.some((notification) =>
    notification.userId === user.id && notification.type === NOTIFICATION_TYPE.REDIRECT &&
    notification.at > now - interval
  )).map((user) => appendNotification(state, {
    userId: user.id, title, message, relatedId, type: NOTIFICATION_TYPE.REDIRECT,
  }, now));
}
