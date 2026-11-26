import { uid } from "./resources.js";
import { Notification } from "./entities.js";
import { NOTIFICATION_TYPE, ROLE } from "../utils/status.js";

export class NotificationService {
  static sendNotification(state, message, now) {
    const record = new Notification({ id: uid("NTF"), ...message, at: now });
    state.notifications.push(record);
    return record;
  }

  static checkRateLimit(notifications, userId, type, cutoff) {
    return notifications.some((notification) =>
      notification.userId === userId && notification.type === type && notification.at > cutoff);
  }

  static notifyRedirect(state, title, message, relatedId, now) {
    const interval = (state.config.params.REDIRECT_NOTIFICATION_INTERVAL_SEC ?? 60) * 1000;
    const recipients = state.users.filter((user) => user.hasPermission(ROLE.STUDENT));
    return recipients.filter((user) => !NotificationService.checkRateLimit(
      state.notifications, user.id, NOTIFICATION_TYPE.REDIRECT, now - interval,
    )).map((user) => NotificationService.sendNotification(state, {
      userId: user.id, title, message, relatedId, type: NOTIFICATION_TYPE.REDIRECT,
    }, now));
  }
}

export const { sendNotification: appendNotification, notifyRedirect } = NotificationService;
