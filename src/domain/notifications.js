import { uid } from "./resources.js";
import { Notification } from "./entities.js";
import { NOTIFICATION_TYPE, ROLE } from "../utils/status.js";

export function appendNotification(state, message, now) {
  const record = new Notification({ id: uid("NTF"), ...message, at: now });
  state.notifications.push(record);
  return record;
}

export class NotificationService {
  static sendNotification(state, recipientIds, message, now) {
    const known = new Set(state.users.map((user) => user.id));
    return [...new Set(recipientIds)].filter((userId) => known.has(userId))
      .map((userId) => appendNotification(state, { ...message, userId }, now));
  }

  static checkRateLimit(notifications, userId, type, cutoff) {
    return notifications.some((notification) =>
      notification.userId === userId && notification.type === type && notification.at > cutoff);
  }

  static notifyRedirect(state, title, message, relatedId, now) {
    const interval = (state.config.params.REDIRECT_NOTIFICATION_INTERVAL_SEC ?? 60) * 1000;
    const recipients = state.users.filter((user) => user.hasPermission(ROLE.STUDENT));
    const selected = recipients.filter((user) => !NotificationService.checkRateLimit(
      state.notifications, user.id, NOTIFICATION_TYPE.REDIRECT, now - interval,
    )).map((user) => user.id);
    return NotificationService.sendNotification(state, selected, {
      title, message, relatedId, type: NOTIFICATION_TYPE.REDIRECT,
    }, now);
  }
}

export const { notifyRedirect } = NotificationService;
