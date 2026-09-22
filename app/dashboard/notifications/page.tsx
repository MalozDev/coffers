"use client";

import { useEffect, useState } from "react";
import { Bell, CheckCircle2, Info, ShieldAlert, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface NotificationItem {
  _id: string;
  type: "welcome" | "info" | "warning" | "success" | "reminder";
  title: string;
  message: string;
  readAt?: string;
  createdAt: string;
}

const icons = { welcome: Sparkles, info: Info, warning: ShieldAlert, success: CheckCircle2, reminder: Bell };

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadNotifications = async () => {
    const response = await fetch("/api/notifications");
    const result = await response.json();
    if (result.success) {
      setNotifications(result.data.notifications);
      setUnreadCount(result.data.unreadCount);
    }
    setLoading(false);
  };

  useEffect(() => { loadNotifications(); }, []);

  const markRead = async (id: string) => {
    await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    await loadNotifications();
  };

  const markAllRead = async () => {
    await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) });
    await loadNotifications();
  };

  return <div className="mx-auto max-w-3xl space-y-5">
    <div className="flex items-center justify-between gap-3"><div><h1 className="text-xl font-bold">Notifications</h1><p className="mt-1 text-sm text-muted-foreground">Updates and helpful reminders from Coffers.</p></div>{unreadCount > 0 && <Button size="sm" variant="outline" onClick={markAllRead}>Mark all read</Button>}</div>
    {loading ? <div className="h-24 animate-pulse rounded-xl bg-muted" /> : notifications.length === 0 ? <Card><CardContent className="py-12 text-center"><Bell className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-3 text-sm text-muted-foreground">You are all caught up.</p></CardContent></Card> : <div className="space-y-3">{notifications.map((notification) => { const Icon = icons[notification.type]; return <Card key={notification._id} className={notification.readAt ? "opacity-75" : "border-accent/40"}><CardContent className="flex items-start gap-3 p-4"><div className="rounded-lg bg-muted p-2 text-accent"><Icon className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold">{notification.title}</h2>{!notification.readAt && <Badge variant="secondary" className="text-[10px]">New</Badge>}</div><p className="mt-1 text-sm text-muted-foreground">{notification.message}</p><p className="mt-2 text-xs text-muted-foreground">{new Date(notification.createdAt).toLocaleString()}</p></div>{!notification.readAt && <Button size="sm" variant="ghost" onClick={() => markRead(notification._id)}>Mark read</Button>}</CardContent></Card>; })}</div>}
  </div>;
}
