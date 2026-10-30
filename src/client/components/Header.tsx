import { useEffect, useState } from "react";
import type { Notification, User } from "../../shared/types/index.ts";
import { getNotifications, markNotificationsRead } from "../lib/data.ts";
import { linkTo } from "../lib/router.ts";
import { subscribe } from "../lib/supabase.ts";

function describe(n: Notification) {
  const d = n.data;
  if (n.type === "comment") return { text: `${d.by} commented on "${d.cardTitle}" in ${d.boardTitle}: ${d.excerpt}`, href: `/boards/${d.boardId}` };
  if (n.type === "workspace:added") return { text: `${d.by} added you to ${d.workspaceName}`, href: "/" };
  return { text: n.type, href: "/" };
}

export function Header({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [items, setItems] = useState<Notification[]>([]);

  useEffect(() => {
    const load = () => getNotifications().then(setItems, () => {});
    load();
    return subscribe(
      `user:${user.id}`,
      "notification",
      (n) => setItems((xs) => [{ id: n.id, type: n.type, data: n.data, readAt: n.read_at, createdAt: n.created_at }, ...xs]),
      load,
    );
  }, [user.id]);

  const unread = items.filter((n) => !n.readAt).length;
  function markRead() {
    if (!unread) return;
    markNotificationsRead(user.id).catch(() => {});
    setItems((xs) => xs.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
  }

  return (
    <header className="topbar">
      <a href="/" onClick={linkTo} className="brand">Boards</a>
      <div className="topbar-right">
        <button popoverTarget="notifications" onClick={markRead} aria-label={`Notifications, ${unread} unread`}>
          🔔{unread > 0 && <span className="badge">{unread}</span>}
        </button>
        <div id="notifications" popover="auto" className="notifications">
          {items.length === 0 && <p className="muted">No notifications</p>}
          {items.map((n) => {
            const { text, href } = describe(n);
            return (
              <a key={n.id} href={href} onClick={linkTo} className={n.readAt ? "" : "unread"}>
                {text}
                <time className="muted">{new Date(n.createdAt).toLocaleString()}</time>
              </a>
            );
          })}
        </div>
        <span>{user.name}</span>
        <button onClick={onLogout}>Log out</button>
      </div>
    </header>
  );
}
