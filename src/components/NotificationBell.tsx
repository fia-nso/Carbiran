import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/supabaseClient";
import type { Notification } from "@/types";

const MAX_DISPLAYED = 20;

export default function NotificationBell() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Fetch
  // -------------------------------------------------------------------------

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("notifications")
      .select("id, user_id, message, type, lu, demande_id, created_at")
      .order("created_at", { ascending: false })
      .limit(MAX_DISPLAYED);

    if (!error) {
      setNotifications((data as Notification[]) ?? []);
    }
    setInitialLoading(false);
  }, []);

  // Resolve current user ID once
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
  }, []);

  // Initial load
  useEffect(() => { void load(); }, [load]);

  // Realtime — channel créé une seule fois par userId grâce au ref
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channelRef = useRef<any>(null);

  useEffect(() => {
    if (!userId || channelRef.current) return;

    channelRef.current = supabase
      .channel(`notifications-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => { void load(); }
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [userId, load]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  async function markAsRead(id: string) {
    await supabase.from("notifications").update({ lu: true }).eq("id", id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, lu: true } : n))
    );
  }

  async function markAllAsRead() {
    const unreadIds = notifications.filter((n) => !n.lu).map((n) => n.id);
    if (unreadIds.length === 0) return;
    await supabase.from("notifications").update({ lu: true }).in("id", unreadIds);
    setNotifications((prev) => prev.map((n) => ({ ...n, lu: true })));
  }

  function handleNotificationClick(notif: Notification) {
    if (!notif.lu) void markAsRead(notif.id);
    if (notif.demande_id) navigate(`/demandes/${notif.demande_id}`);
    setOpen(false);
  }

  // -------------------------------------------------------------------------
  // Derived
  // -------------------------------------------------------------------------

  const unreadCount = notifications.filter((n) => !n.lu).length;
  const badgeLabel  = unreadCount > 99 ? "99+" : String(unreadCount);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="relative" ref={containerRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} non lues)` : ""}`}
        className="relative p-2 rounded-lg bg-white/15 hover:bg-white/25 transition-all border border-white/10 hover:border-white/20"
      >
        <svg
          className="w-5 h-5 text-white"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>

        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[1.1rem] h-[1.1rem] px-0.5 text-[10px] font-bold bg-red-500 text-white rounded-full leading-none">
            {badgeLabel}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-gray-200 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-800 text-sm">Notifications</span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-red-100 text-red-700 rounded-full">
                  {unreadCount}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs font-medium text-teal-600 hover:text-teal-800 transition-colors"
              >
                Tout marquer comme lu
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[28rem] overflow-y-auto divide-y divide-gray-100">
            {initialLoading ? (
              <div className="flex justify-center py-10">
                <div className="animate-spin w-5 h-5 border-4 border-gray-200 border-t-teal-500 rounded-full" />
              </div>
            ) : notifications.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-10">
                Aucune notification
              </p>
            ) : (
              notifications.map((notif) => (
                <button
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif)}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${
                    !notif.lu ? "bg-blue-50/70" : ""
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      className={`mt-1.5 flex-shrink-0 w-2 h-2 rounded-full transition-colors ${
                        !notif.lu ? "bg-blue-500" : "bg-transparent"
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 leading-snug">{notif.message}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(notif.created_at).toLocaleString("fr-FR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length === MAX_DISPLAYED && (
            <div className="px-4 py-2 border-t border-gray-100 text-center">
              <span className="text-xs text-gray-400">
                Seules les {MAX_DISPLAYED} dernières notifications sont affichées.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
