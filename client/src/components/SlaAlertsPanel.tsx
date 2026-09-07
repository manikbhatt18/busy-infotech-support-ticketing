"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import Loader from "@/components/Loader";
import { Bell, AlertTriangle, AlertCircle, CheckCircle2, Clock } from "lucide-react";

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
      <div className="rounded-xl bg-white shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
          <Bell className="w-5 h-5 text-red-500" /> SLA Alerts
        </h2>
        <div className="flex gap-6 text-sm">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-red-100 text-red-700 font-bold text-sm">
              {breached.length}
            </span>
            <span className="text-gray-600 font-medium">Breached</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-orange-100 text-orange-700 font-bold text-sm">
              {nearBreach.length}
            </span>
            <span className="text-gray-600 font-medium">Near Breach</span>
          </div>
        </div>
      </div>

      {/* Breached Section */}
      {breached.length > 0 && (
        <div className="rounded-xl bg-white shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-3 bg-red-50 border-b border-red-100 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600" />
            <h3 className="text-sm font-semibold text-red-800">
              Breached ({breached.length})
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
        <div className="rounded-xl bg-white shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-3 bg-orange-50 border-b border-orange-100 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-orange-600" />
            <h3 className="text-sm font-semibold text-orange-800">
              Near Breach ({nearBreach.length})
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
        <div className="rounded-xl bg-white shadow-sm border border-gray-200 p-12 flex flex-col items-center justify-center">
          <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mb-4">
            <CheckCircle2 className="w-8 h-8 text-green-500" />
          </div>
          <p className="text-gray-900 font-semibold text-lg">No SLA alerts</p>
          <p className="text-sm text-gray-500 mt-1">
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
    <li className="px-6 py-4 hover:bg-gray-50 transition-colors group">
      <div className="flex items-center justify-between gap-4">
        {/* Left: ticket info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <button
              onClick={() => onTicketClick?.(alert.ticketId)}
              className="text-sm font-semibold text-gray-900 hover:text-indigo-600 transition-colors truncate text-left cursor-pointer"
              title={alert.subject}
            >
              {alert.subject}
            </button>
            <span
              className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium border ${
                PRIORITY_COLORS[alert.priority] || "bg-gray-100 text-gray-700 border-gray-200"
              }`}
            >
              {alert.priority}
            </span>
            <span className="inline-flex items-center rounded bg-gray-100 text-gray-600 border border-gray-200 px-2 py-0.5 text-xs font-medium">
              {alert.status}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span>Assignee: {alert.assigneeName}</span>
            <span>•</span>
            <span
              className={`font-semibold flex items-center gap-1 ${
                alert.isBreached ? "text-red-600" : "text-orange-600"
              }`}
            >
              <Clock className="w-3.5 h-3.5" /> {alert.timeLabel}
            </span>
          </div>
        </div>

        {/* Right: acknowledge button */}
        <button
          onClick={() => onAcknowledge(alert.ticketId)}
          disabled={isAcking}
          className={`shrink-0 rounded-lg px-4 py-1.5 text-sm font-medium shadow-sm transition-colors ${
            isAcking
              ? "bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200"
              : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
          }`}
        >
          {isAcking ? "..." : "Acknowledge"}
        </button>
      </div>
    </li>
  );
}
