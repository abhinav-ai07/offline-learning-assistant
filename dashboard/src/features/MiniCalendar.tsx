import { useEffect, useMemo, useState } from "react";
import { getCalendarEvents } from "../api";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "../components/icons";
import type { CalendarEvent } from "../types";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

function dayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function MiniCalendar({ onOpenCalendar }: { onOpenCalendar: () => void }) {
  const today = new Date();
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState(() => dayKey(today));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [error, setError] = useState("");

  const dates = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return [
      ...Array.from({ length: offset }, () => null),
      ...Array.from({ length: count }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index + 1)),
    ];
  }, [month]);

  useEffect(() => {
    let active = true;
    const start = new Date(month.getFullYear(), month.getMonth(), 1);
    const end = new Date(month.getFullYear(), month.getMonth() + 1, 1);
    getCalendarEvents(start.toISOString(), end.toISOString())
      .then((items) => {
        if (active) {
          setEvents(items);
          setError("");
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load events.");
      });
    return () => {
      active = false;
    };
  }, [month]);

  const eventCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const event of events) {
      const key = dayKey(new Date(event.start_at));
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [events]);
  const selectedCount = eventCounts.get(selectedDay) ?? 0;
  const monthLabel = month.toLocaleDateString([], { month: "long", year: "numeric" });

  const changeMonth = (amount: number) => {
    const next = new Date(month.getFullYear(), month.getMonth() + amount, 1);
    setMonth(next);
    setSelectedDay(dayKey(next));
  };

  return (
    <section className="mini-calendar" aria-label="Calendar overview">
      <header className="mini-calendar-heading">
        <div>
          <h3><CalendarIcon width={16} height={16} /> Calendar</h3>
          <span>{monthLabel}</span>
        </div>
        <div className="mini-calendar-month-nav">
          <button type="button" aria-label="Previous month" onClick={() => changeMonth(-1)}><ChevronLeftIcon width={16} height={16} /></button>
          <button type="button" aria-label="Next month" onClick={() => changeMonth(1)}><ChevronRightIcon width={16} height={16} /></button>
        </div>
      </header>
      <div className="mini-calendar-grid" role="grid" aria-label={monthLabel}>
        {WEEKDAYS.map((day, index) => (
          <span className="mini-calendar-weekday" role="columnheader" key={`${day}-${index}`}>{day}</span>
        ))}
        {dates.map((date, index) => {
          if (!date) return <span className="mini-calendar-blank" role="gridcell" key={`blank-${index}`} />;
          const key = dayKey(date);
          const count = eventCounts.get(key) ?? 0;
          const todayDate = key === dayKey(new Date());
          return (
            <button
              type="button"
              className={`mini-calendar-day${key === selectedDay ? " is-selected" : ""}${todayDate ? " is-today" : ""}${count ? " has-events" : ""}`}
              role="gridcell"
              aria-label={`${date.toLocaleDateString([], { dateStyle: "full" })}${count ? `, ${count} ${count === 1 ? "event" : "events"}` : ""}`}
              aria-pressed={key === selectedDay}
              key={key}
              onClick={() => setSelectedDay(key)}
            >
              {date.getDate()}
              {count > 0 && <span className="mini-calendar-event-dot" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      <footer className="mini-calendar-footer">
        <span>{selectedCount ? `${selectedCount} event${selectedCount === 1 ? "" : "s"} selected` : "No events selected"}</span>
        <button type="button" onClick={onOpenCalendar}>Open calendar</button>
      </footer>
      {error && <span className="mini-calendar-error" role="status">{error}</span>}
    </section>
  );
}
