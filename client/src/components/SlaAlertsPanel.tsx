"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import Loader from "@/components/Loader";

interface SlaAlert {
  ticketId: string;
  subject: string;
  priority: string;
  status: string;
  assigneeName: string;
  assigneeEmail: string | null;
  slaTargetAt: string;
  isBreached: boolean;
  timeLabel: string;
  createdAt: string;
}

interface SlaAlertsPanelProps {
  onTicketClick?: (ticketId: string) => void;
  onAlertAcknowledged?: () => void;
}

const PRIORITY_COLORS: Record<string, string> = {
  URGENT: "bg-red-100 text-red-800 border-red-300",
  HIGH: "bg-orange-100 text-orange-800 border-orange-300",
  MEDIUM: "bg-yellow-100 text-yellow-800 border-yellow-300",
  LOW: "bg-green-100 text-green-800 border-green-300",
};

export default function SlaAlertsPanel({ onTicketClick, onAlertAcknowledged }: SlaAlertsPanelProps) {
  const [alerts, setAlerts] = useState<SlaAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [acknowledging, setAcknowledging] = useState<string | null>(null);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await apiFetch("/sla-alerts");
      setAlerts(res.alerts || []);
      setError("");
    } catch (err: any) {
      setError(err.message || "Failed to load SLA alerts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const handleAcknowledge = async (ticketId: string) => {
    setAcknowledging(ticketId);
    try {
      await apiFetch(`/sla-alerts/${ticketId}/acknowledge`, { method: "POST" });
      // Remove from local state immediately for instant feedback
      setAlerts((prev) => prev.filter((a) => a.ticketId !== ticketId));
      onAlertAcknowledged?.();
    } catch (err: any) {
      alert(err.message || "Failed to acknowledge alert");
    } finally {
      setAcknowledging(null);
    }
  };

  if (loading) {
    return <Loader text="Loading SLA alerts..." />;
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 shadow p-6 text-center text-red-700">
        {error}
      </div>
    );
  }

  const breached = alerts.filter((a) => a.isBreached);
  const nearBreach = alerts.filter((a) => !a.isBreached);

  return (
    <div className="space-y-6">
      {/* Summary Header */}
      <div className="rounded-xl bg-white/60 backdrop-blur-lg shadow-xl border border-white/40 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          🚨 SLA Alerts
        </h2>
        <div className="flex gap-6 text-sm">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-red-100 text-red-700 font-bold text-sm">
              {breached.length}
            </span>
            <span className="text-gray-600">Breached</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-orange-100 text-orange-700 font-bold text-sm">
              {nearBreach.length}
            </span>
            <span className="text-gray-600">Near Breach</span>
          </div>
        </div>
      </div>

      {/* Breached Section */}
      {breached.length > 0 && (
        <div className="rounded-xl bg-white/80 backdrop-blur-md shadow-xl border border-white/40 overflow-hidden">
          <div className="px-6 py-3 bg-red-50/80 border-b border-red-200">
            <h3 className="text-sm font-semibold text-red-800">
              🔴 Breached ({breached.length})
            </h3>
          </div>
          <ul className="divide-y divide-gray-100">
            {breached.map((alert) => (
              <AlertRow
                key={alert.ticketId}
                alert={alert}
                acknowledging={acknowledging}
                onAcknowledge={handleAcknowledge}
                onTicketClick={onTicketClick}
              />
            ))}
          </ul>
        </div>
      )}

      {/* Near Breach Section */}
      {nearBreach.length > 0 && (
        <div className="rounded-xl bg-white/80 backdrop-blur-md shadow-xl border border-white/40 overflow-hidden">
          <div className="px-6 py-3 bg-orange-50/80 border-b border-orange-200">
            <h3 className="text-sm font-semibold text-orange-800">
              🟠 Near Breach ({nearBreach.length})
            </h3>
          </div>
          <ul className="divide-y divide-gray-100">
            {nearBreach.map((alert) => (
              <AlertRow
                key={alert.ticketId}
                alert={alert}
                acknowledging={acknowledging}
                onAcknowledge={handleAcknowledge}
                onTicketClick={onTicketClick}
              />
            ))}
          </ul>
        </div>
      )}

      {/* Empty State */}
      {alerts.length === 0 && (
        <div className="rounded-xl bg-white/60 backdrop-blur-lg shadow-xl border border-white/40 p-12 text-center">
          <div className="text-4xl mb-3">✅</div>
          <p className="text-gray-600 font-medium">No SLA alerts</p>
          <p className="text-sm text-gray-400 mt-1">
            All tickets are within their SLA response windows.
          </p>
        </div>
      )}
    </div>
  );
}

function AlertRow({
  alert,
  acknowledging,
  onAcknowledge,
  onTicketClick,
}: {
  alert: SlaAlert;
  acknowledging: string | null;
  onAcknowledge: (ticketId: string) => void;
  onTicketClick?: (ticketId: string) => void;
}) {
  const isAcking = acknowledging === alert.ticketId;

  return (
    <li className="px-6 py-4 hover:bg-white/40 transition-colors">
      <div className="flex items-center justify-between gap-4">
        {/* Left: ticket info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <button
              onClick={() => onTicketClick?.(alert.ticketId)}
              className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline truncate text-left cursor-pointer"
              title={alert.subject}
            >
              {alert.subject}
            </button>
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                PRIORITY_COLORS[alert.priority] || "bg-gray-100 text-gray-700"
              }`}
            >
              {alert.priority}
            </span>
            <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-600 border border-gray-200 px-2 py-0.5 text-xs">
              {alert.status}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span>Assigned to: {alert.assigneeName}</span>
            <span>•</span>
            <span
              className={`font-semibold ${
                alert.isBreached ? "text-red-600" : "text-orange-600"
              }`}
            >
              {alert.timeLabel}
            </span>
          </div>
        </div>

        {/* Right: acknowledge button */}
        <button
          onClick={() => onAcknowledge(alert.ticketId)}
          disabled={isAcking}
          className={`cursor-pointer transition-all duration-200 active:scale-95 shrink-0 rounded-md px-3 py-1.5 text-xs font-medium shadow-sm ${
            isAcking
              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
              : "bg-gradient-to-r from-blue-50 to-blue-100 text-blue-700 border border-blue-300 hover:opacity-90"
          }`}
        >
          {isAcking ? "..." : "Acknowledge"}
        </button>
      </div>
    </li>
  );
}
