import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  getCalendarEvents,
  updateCalendarEvent,
  type CalendarEventPayload,
} from "../api";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon } from "../components/icons";
import { Dialog } from "../shared/components/AcademicUI";
import type { CalendarEvent } from "../types";
import "./calendar.css";

interface EventForm {
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  reminderMinutes: string;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const REMINDER_OPTIONS = [
  ["none", "No reminder"],
  ["0", "At event time"],
  ["5", "5 minutes before"],
  ["10", "10 minutes before"],
  ["15", "15 minutes before"],
  ["30", "30 minutes before"],
  ["60", "1 hour before"],
  ["1440", "1 day before"],
];

function dayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateTimeLocal(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatTime(dateString: string): string {
  return new Date(dateString).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function reminderLabel(minutes: number | null): string {
  if (minutes === null) return "No reminder";
  if (minutes === 0) return "At event time";
  if (minutes < 60) return `${minutes} min before`;
  if (minutes === 60) return "1 hour before";
  return "1 day before";
}

function initialForm(selectedDay: string): EventForm {
  const day = new Date(`${selectedDay}T09:00:00`);
  const end = new Date(day.getTime() + 60 * 60_000);
  return {
    title: "",
    description: "",
    startAt: dateTimeLocal(day),
    endAt: dateTimeLocal(end),
    reminderMinutes: "15",
  };
}

function eventForm(event: CalendarEvent): EventForm {
  return {
    title: event.title,
    description: event.description,
    startAt: dateTimeLocal(new Date(event.start_at)),
    endAt: dateTimeLocal(new Date(event.end_at)),
    reminderMinutes: event.reminder_minutes === null ? "none" : String(event.reminder_minutes),
  };
}

export function CalendarPage() {
  const today = new Date();
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [selectedDay, setSelectedDay] = useState(() => dayKey(today));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadKey, setLoadKey] = useState(0);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<EventForm>(() => initialForm(dayKey(today)));
  const [saving, setSaving] = useState(false);

  const gridDays = useMemo(() => {
    const first = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
    const mondayOffset = (first.getDay() + 6) % 7;
    const start = new Date(first);
    start.setDate(first.getDate() - mondayOffset);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [visibleMonth]);
  const rangeStart = gridDays[0];
  const rangeEnd = new Date(gridDays[41].getFullYear(), gridDays[41].getMonth(), gridDays[41].getDate() + 1);
  const startAt = dateTimeLocal(rangeStart);
  const endAt = dateTimeLocal(rangeEnd);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    getCalendarEvents(new Date(startAt).toISOString(), new Date(endAt).toISOString())
      .then((items) => {
        if (active) setEvents(items);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load calendar events.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [startAt, endAt, loadKey]);

  const eventsByDay = useMemo(() => {
    const grouped = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const key = dayKey(new Date(event.start_at));
      grouped.set(key, [...(grouped.get(key) ?? []), event]);
    }
    return grouped;
  }, [events]);
  const selectedEvents = eventsByDay.get(selectedDay) ?? [];

  const openNewEvent = useCallback((date = selectedDay) => {
    setSelectedDay(date);
    setEditingEvent(null);
    setForm(initialForm(date));
    setError("");
    setDialogOpen(true);
  }, [selectedDay]);

  const showMonth = (offset: number) => {
    const next = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + offset, 1);
    setVisibleMonth(next);
    setSelectedDay(dayKey(next));
  };

  const showToday = () => {
    const now = new Date();
    setVisibleMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDay(dayKey(now));
  };

  const openEditEvent = (event: CalendarEvent) => {
    setEditingEvent(event);
    setSelectedDay(dayKey(new Date(event.start_at)));
    setForm(eventForm(event));
    setError("");
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingEvent(null);
  };

  const saveEvent = async (submitEvent: FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault();
    if (new Date(form.endAt).getTime() <= new Date(form.startAt).getTime()) {
      setError("The event end time must be after its start time.");
      return;
    }
    setSaving(true);
    setError("");
    const payload: CalendarEventPayload = {
      title: form.title.trim(),
      description: form.description.trim(),
      start_at: new Date(form.startAt).toISOString(),
      end_at: new Date(form.endAt).toISOString(),
      reminder_minutes: form.reminderMinutes === "none" ? null : Number(form.reminderMinutes),
    };
    try {
      if (editingEvent) await updateCalendarEvent(editingEvent.id, payload);
      else await createCalendarEvent(payload);
      const eventDate = new Date(payload.start_at);
      setVisibleMonth(new Date(eventDate.getFullYear(), eventDate.getMonth(), 1));
      setSelectedDay(dayKey(eventDate));
      closeDialog();
      setLoadKey((key) => key + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this event.");
    } finally {
      setSaving(false);
    }
  };

  const removeEvent = async (event: CalendarEvent) => {
    if (!window.confirm(`Delete "${event.title}" from your calendar?`)) return;
    setError("");
    try {
      await deleteCalendarEvent(event.id);
      setLoadKey((key) => key + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete this event.");
    }
  };

  const monthLabel = visibleMonth.toLocaleDateString([], { month: "long", year: "numeric" });
  const selectedLabel = new Date(`${selectedDay}T12:00:00`).toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <section className="calendar-page" aria-label="Personal calendar">
      <header className="calendar-heading">
        <div>
          <p className="calendar-eyebrow"><CalendarIcon width={17} height={17} /> YOUR SCHEDULE</p>
          <h1>Calendar</h1>
          <p>Keep track of classes, study sessions, and important dates. Only you can see your events.</p>
        </div>
        <button type="button" className="calendar-add-button" onClick={() => openNewEvent()}>
          <span aria-hidden="true">+</span> Add event
        </button>
      </header>

      <div className="calendar-toolbar">
        <div className="calendar-month-controls">
          <button type="button" aria-label="Previous month" onClick={() => showMonth(-1)}><ChevronLeftIcon /></button>
          <button type="button" aria-label="Next month" onClick={() => showMonth(1)}><ChevronRightIcon /></button>
          <h2>{monthLabel}</h2>
        </div>
        <button type="button" className="calendar-today-button" onClick={showToday}>Today</button>
      </div>

      {error && <p className="calendar-error" role="alert">{error}</p>}

      <div className="calendar-grid" role="grid" aria-label={monthLabel}>
        {WEEKDAYS.map((day) => <div className="calendar-weekday" role="columnheader" key={day}>{day}</div>)}
        {gridDays.map((day) => {
          const key = dayKey(day);
          const inMonth = day.getMonth() === visibleMonth.getMonth();
          const isToday = key === dayKey(new Date());
          const isSelected = key === selectedDay;
          const dayEvents = eventsByDay.get(key) ?? [];
          return (
            <div
              className={`calendar-day${inMonth ? "" : " is-outside"}${isSelected ? " is-selected" : ""}`}
              role="gridcell"
              aria-selected={isSelected}
              key={key}
            >
              <button
                type="button"
                className={`calendar-day-number${isToday ? " is-today" : ""}`}
                aria-label={day.toLocaleDateString([], { dateStyle: "full" })}
                onClick={() => setSelectedDay(key)}
              >
                {day.getDate()}
              </button>
              <div className="calendar-day-events">
                {dayEvents.slice(0, 3).map((event) => (
                  <button
                    type="button"
                    className="calendar-event-chip"
                    key={event.id}
                    title={`${event.title} · ${formatTime(event.start_at)}`}
                    onClick={() => openEditEvent(event)}
                  >
                    {event.title}
                  </button>
                ))}
                {dayEvents.length > 3 && <span className="calendar-more-events">+{dayEvents.length - 3} more</span>}
              </div>
            </div>
          );
        })}
      </div>
      {loading && <p className="calendar-loading" role="status">Loading your events…</p>}

      <section className="calendar-agenda" aria-label={`Events for ${selectedLabel}`}>
        <div className="calendar-agenda-heading">
          <div>
            <p className="calendar-eyebrow">YOUR DAY</p>
            <h2>{selectedLabel}</h2>
          </div>
          <button type="button" className="calendar-secondary-button" onClick={() => openNewEvent()}>
            Add to this day
          </button>
        </div>
        {!loading && selectedEvents.length === 0 ? (
          <p className="calendar-empty">Nothing planned yet. Add an event to keep this day on track.</p>
        ) : (
          <div className="calendar-agenda-list">
            {selectedEvents.map((event) => (
              <article className="calendar-agenda-event" key={event.id}>
                <div className="calendar-event-time">
                  <strong>{formatTime(event.start_at)}</strong>
                  <span>{formatTime(event.end_at)}</span>
                </div>
                <div className="calendar-event-details">
                  <h3>{event.title}</h3>
                  {event.description && <p>{event.description}</p>}
                  <span className="calendar-reminder-label"><ClockIcon width={14} height={14} /> {reminderLabel(event.reminder_minutes)}</span>
                </div>
                <div className="calendar-event-actions">
                  <button type="button" onClick={() => openEditEvent(event)}>Edit</button>
                  <button type="button" onClick={() => void removeEvent(event)}>Delete</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {dialogOpen && form.startAt !== "" && (
        <Dialog
          title={editingEvent ? "Edit event" : "Add event"}
          close={closeDialog}
        >
          <form className="calendar-event-form" onSubmit={(event) => void saveEvent(event)}>
            <div className="calendar-dialog-heading">
              <h2>{editingEvent ? "Edit event" : "Add an event"}</h2>
              <button type="button" className="calendar-dialog-close" onClick={closeDialog} aria-label="Close">×</button>
            </div>
            <label>
              Event title
              <input
                autoFocus
                required
                maxLength={120}
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="e.g. Mathematics revision"
              />
            </label>
            <label>
              Description <span className="calendar-optional">(optional)</span>
              <textarea
                maxLength={2000}
                rows={3}
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                placeholder="Add a few details"
              />
            </label>
            <div className="calendar-form-datetimes">
              <label>
                Starts
                <input
                  type="datetime-local"
                  required
                  value={form.startAt}
                  onChange={(event) => setForm({ ...form, startAt: event.target.value })}
                />
              </label>
              <label>
                Ends
                <input
                  type="datetime-local"
                  required
                  value={form.endAt}
                  onChange={(event) => setForm({ ...form, endAt: event.target.value })}
                />
              </label>
            </div>
            <label>
              Reminder
              <select
                value={form.reminderMinutes}
                onChange={(event) => setForm({ ...form, reminderMinutes: event.target.value })}
              >
                {REMINDER_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </label>
            {error && <p className="calendar-error" role="alert">{error}</p>}
            <div className="calendar-form-actions">
              <button type="button" className="calendar-secondary-button" onClick={closeDialog}>Cancel</button>
              <button type="submit" className="calendar-add-button" disabled={saving}>
                {saving ? "Saving…" : editingEvent ? "Save changes" : "Create event"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </section>
  );
}
