import { useCallback, useEffect, useState } from "react";
import { getCalendarEvents } from "../api";
import { BellIcon } from "../components/icons";
import type { CalendarEvent } from "../types";

export interface CalendarReminder {
  id: string;
  title: string;
  message: string;
}

function reminderMessage(event: CalendarEvent, now: Date): string {
  const startsAt = new Date(event.start_at);
  const minutesUntil = Math.ceil((startsAt.getTime() - now.getTime()) / 60_000);
  if (minutesUntil <= 0) return "Starting now";
  if (minutesUntil < 60) return `Starts in ${minutesUntil} min`;
  if (minutesUntil < 24 * 60) {
    const hours = Math.floor(minutesUntil / 60);
    const minutes = minutesUntil % 60;
    return `Starts in ${hours} hr${hours === 1 ? "" : "s"}${minutes ? ` ${minutes} min` : ""}`;
  }
  return `Starts ${startsAt.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
}

export function useCalendarReminders(userId: string | undefined) {
  const [reminders, setReminders] = useState<CalendarReminder[]>([]);

  useEffect(() => {
    if (!userId) {
      setReminders([]);
      return;
    }

    let active = true;
    let polling = false;
    const storageKey = `ila.calendar-reminders.${userId}`;
    const shown = new Set<string>();
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          for (const id of parsed) if (typeof id === "string") shown.add(id);
        } else {
          console.warn("Ignoring malformed saved calendar reminder state.");
        }
      }
    } catch (error) {
      console.error("Could not read saved calendar reminder state.", error);
    }

    const poll = async () => {
      if (polling) return;
      polling = true;
      const now = new Date();
      const rangeStart = new Date(now.getTime() - 10 * 60_000);
      const rangeEnd = new Date(now.getTime() + 25 * 60 * 60_000);
      try {
        const events = await getCalendarEvents(rangeStart.toISOString(), rangeEnd.toISOString());
        if (!active) return;
        const dueEvents = events.filter((event) => {
          if (event.reminder_minutes === null || shown.has(event.id)) return false;
          const startsAt = new Date(event.start_at);
          const endsAt = new Date(event.end_at);
          const dueAt = new Date(startsAt.getTime() - event.reminder_minutes * 60_000);
          const upcoming = startsAt > now;
          const justStarted = event.reminder_minutes === 0
            && startsAt <= now
            && endsAt > now
            && startsAt.getTime() >= now.getTime() - 10 * 60_000;
          return (upcoming && dueAt <= now) || justStarted;
        });
        if (dueEvents.length === 0) return;
        for (const event of dueEvents) shown.add(event.id);
        try {
          window.localStorage.setItem(storageKey, JSON.stringify([...shown].slice(-200)));
        } catch (error) {
          console.error("Could not save calendar reminder state.", error);
        }
        setReminders((current) => [
          ...current,
          ...dueEvents.map((event) => ({
            id: event.id,
            title: event.title,
            message: reminderMessage(event, now),
          })),
        ]);
      } catch (error) {
        if (active) console.error("Could not check for calendar reminders.", error);
      } finally {
        polling = false;
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), 30_000);
    window.addEventListener("focus", poll);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", poll);
    };
  }, [userId]);

  const dismissReminder = useCallback((id: string) => {
    setReminders((current) => current.filter((reminder) => reminder.id !== id));
  }, []);

  return { reminders, dismissReminder };
}

export function CalendarReminderToasts({
  reminders,
  onDismiss,
}: {
  reminders: CalendarReminder[];
  onDismiss: (id: string) => void;
}) {
  if (!reminders.length) return null;
  return (
    <aside className="calendar-reminder-stack" aria-label="Upcoming event reminders" aria-live="polite">
      {reminders.map((reminder) => (
        <section className="calendar-reminder-toast" key={reminder.id}>
          <span className="calendar-reminder-icon" aria-hidden="true"><BellIcon width={17} height={17} /></span>
          <div>
            <strong>{reminder.title}</strong>
            <p>{reminder.message}</p>
          </div>
          <button type="button" aria-label={`Dismiss reminder for ${reminder.title}`} onClick={() => onDismiss(reminder.id)}>
            Dismiss
          </button>
        </section>
      ))}
    </aside>
  );
}
