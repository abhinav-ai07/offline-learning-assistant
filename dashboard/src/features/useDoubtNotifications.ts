import { useCallback, useEffect, useState } from "react";
import { request } from "../api";
import { subscribeRealtime } from "../realtime";

export interface DoubtNotice {
  id: string;
  is_read: boolean;
  student_name: string;
  message: string;
  created_at: string;
}

export function useDoubtNotifications(teacherId?: string) {
  const [items, setItems] = useState<DoubtNotice[]>([]);
  useEffect(() => {
    setItems([]);
    if (!teacherId) return;
    let live = true;
    let generation = 0;
    const load = async () => {
      const version = ++generation;
      try {
        const list = await request<DoubtNotice[]>("/api/teacher/doubt-notifications");
        if (live && version === generation) setItems(list);
      } catch { /* Retry on reconnect, focus, or the next poll. */ }
    };
    void load();
    const unsub = subscribeRealtime(["doubt_updated"], load);
    const timer = window.setInterval(load, 15000);
    window.addEventListener("focus", load);
    return () => { live = false; unsub(); window.clearInterval(timer); window.removeEventListener("focus", load); };
  }, [teacherId]);
  const markRead = useCallback(async (id: string) => {
    await request("/api/teacher/doubts/" + id + "/view", {method: "POST"});
    setItems(list => list.map(n => n.id === id ? {...n, is_read: true} : n));
  }, []);
  const remove = (id?: string) => setItems(list => id ? list.filter(n => n.id !== id) : []);
  return {items, markRead, remove};
}
