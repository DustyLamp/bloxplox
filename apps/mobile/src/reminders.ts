import * as Notifications from 'expo-notifications';
import { dueHabits, getCompletion, localDate, resultId, shiftDate, reminderInstant, type Document } from '../../../packages/domain/src/index';
import { credentials } from './storage';
Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }) });
async function updateReminders(docs: Document[], timezone: string) {
  if (credentials.getItem('reminders') !== 'enabled') return;
  const status = await Notifications.getPermissionsAsync(); if (!status.granted) return;
  const next: { id: string; name: string; date: number }[] = [];
  for (let offset = 0; offset < 14; offset++) { const day = shiftDate(localDate(timezone), offset); for (const habit of dueHabits(docs, day)) { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(habit.reminder)) continue; const status = getCompletion(docs, resultId(habit.id, day)).status, date = reminderInstant(day, habit.reminder, timezone); if (date > Date.now() && status !== 'done' && status !== 'skip') next.push({ id: `habit:${habit.id}:${day}`, name: habit.name, date }); } }
  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const reminder of next.sort((a, b) => a.date - b.date).slice(0, 60)) await Notifications.scheduleNotificationAsync({ identifier: reminder.id, content: { title: reminder.name, data: { habit: reminder.id } }, trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(reminder.date) } });
}
export async function enableReminders(docs: Document[], timezone: string) { const result = await Notifications.requestPermissionsAsync(); if (!result.granted) throw new Error('Reminders are disabled in device settings.'); credentials.setItem('reminders', 'enabled'); await refreshReminders(docs, timezone); }

let notificationWork: Promise<unknown> = Promise.resolve();
export function refreshReminders(docs: Document[], timezone: string) { const next = notificationWork.catch(() => {}).then(() => updateReminders(docs, timezone)); notificationWork = next; return next; }
export function disableReminders() { credentials.removeItem('reminders'); const next = notificationWork.catch(() => {}).then(() => Notifications.cancelAllScheduledNotificationsAsync()); notificationWork = next; return next; }
