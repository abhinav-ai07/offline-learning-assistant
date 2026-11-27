import { useEffect, useRef, useState, type ReactNode } from "react";
import { BellIcon, XIcon } from "../../components/icons";
import { request } from "../../api";
import { messageOf } from "../../format";

interface Notice {
  id: string;
  title: string;
  message: string;
  created_at: string;
  is_read: boolean;
}

interface Props {
  items: Notice[];
  onOpen: (id: string) => void;
  onCleared: (id?: string) => void;
  footer?: (close: () => void) => ReactNode;
}

export function NotificationMenu({items, onOpen, onCleared, footer}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const bell = useRef<HTMLButtonElement>(null);
  const unread = items.filter(n => !n.is_read).length;
  function close() { setOpen(false); bell.current?.focus(); }

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  async function clear(id?: string) {
    setBusy(true); setError("");
    try {
      await request("/api/notifications" + (id ? "?notification_id=" + encodeURIComponent(id) : ""), {method: "DELETE"});
      onCleared(id);
    } catch (e) { setError(messageOf(e)); }
    finally { setBusy(false); }
  }

  return <div className="notification-dropdown-wrapper" ref={root} onKeyDown={e => {if (e.key === "Escape") close();}}>
    <button ref={bell} type="button" className="header-icon-btn" aria-expanded={open}
      aria-label={`Notifications, ${unread} unread`} onClick={() => setOpen(v => !v)}>
      <BellIcon width={18} height={18}/>{unread > 0 && <span className="notification-badge">{unread}</span>}
    </button>
    {open && <section className="notification-panel" aria-label="Notifications">
      <header className="notification-panel-header"><strong>Notifications</strong>
        {items.length > 0 && <button className="notice-clear-all" disabled={busy} onClick={() => clear()}>Clear all</button>}
        <button className="btn-icon" aria-label="Close notifications" onClick={close}><XIcon width={16} height={16}/></button>
      </header>
      {error && <p role="alert">{error}</p>}
      <div className="notification-list">
        {items.length === 0 && <p className="notification-empty">No notifications.</p>}
        {items.map(n => <div className={`notice-row ${n.is_read ? "" : "unread"}`} key={n.id}>
          <button className="notification-item" onClick={() => {close(); onOpen(n.id);}}>
            <span className="notice-dot" aria-label={n.is_read ? "Read" : "Unread"}/>
            <span className="notification-item-content"><strong className="notification-title">{n.title}</strong>
              <span className="notification-message">{n.message}</span>
              <time className="notification-date" dateTime={n.created_at}>{new Date(n.created_at).toLocaleDateString(undefined, {month:"short", day:"numeric", year:"numeric"})}</time>
            </span>
          </button>
          <button className="notice-dismiss" title="Clear notification" aria-label={"Clear notification: " + n.title}
            disabled={busy} onClick={() => clear(n.id)}><XIcon width={14} height={14}/></button>
        </div>)}
      </div>
      {footer && <footer className="notice-footer">{footer(close)}</footer>}
    </section>}
  </div>;
}
