"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface AnalyticsData {
  headlines: {
    openTickets: number;
    pendingTickets: number;
    breachingTickets: number;
    resolvedThisWeek: number;
  };
  statusBreakdown: { status: string; count: number }[];
  agentBreakdown: { agentName: string; count: number }[];
  weeklyResolved: { weekLabel: string; count: number }[];
}

const STATUS_COLORS: Record<string, string> = {
  NEW: "#6366f1",      // Indigo
  OPEN: "#3b82f6",     // Blue
  PENDING: "#f59e0b",  // Amber
  RESOLVED: "#10b981", // Emerald
  CLOSED: "#6b7280",   // Gray
};

export default function AnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    apiFetch("/analytics")
      .then((res) => setData(res))
      .catch((err) => setError(err.message || "Failed to load analytics"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-gray-500 text-sm">Loading analytics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 p-4 text-sm text-red-700">{error}</div>
    );
  }

  if (!data) return null;

  const { headlines, statusBreakdown, agentBreakdown, weeklyResolved } = data;

  return (
    <div className="space-y-6">
      {/* Headline Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <HeadlineCard
          title="Open Tickets"
          value={headlines.openTickets}
          icon="📬"
          color="border-blue-400 bg-blue-50"
          valueColor="text-blue-700"
        />
        <HeadlineCard
          title="Pending on Customer"
          value={headlines.pendingTickets}
          icon="⏳"
          color="border-amber-400 bg-amber-50"
          valueColor="text-amber-700"
        />
        <HeadlineCard
          title="Resolved This Week"
          value={headlines.resolvedThisWeek}
          icon="✅"
          color="border-emerald-400 bg-emerald-50"
          valueColor="text-emerald-700"
        />
        <HeadlineCard
          title="Breaching SLA"
          value={headlines.breachingTickets}
          icon="🚨"
          color="border-red-400 bg-red-50"
          valueColor="text-red-700"
        />
      </div>

      {/* Breakdowns Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By Status */}
        <div className="rounded-lg bg-white shadow p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Tickets by Status</h3>
          <div className="space-y-3">
            {statusBreakdown.length === 0 ? (
              <p className="text-sm text-gray-400">No tickets found.</p>
            ) : (
              statusBreakdown.map((item) => {
                const total = statusBreakdown.reduce((sum, s) => sum + s.count, 0);
                const pct = total > 0 ? (item.count / total) * 100 : 0;
                return (
                  <div key={item.status}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-700">{item.status}</span>
                      <span className="text-sm text-gray-500">{item.count}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2.5">
                      <div
                        className="h-2.5 rounded-full transition-all duration-500"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: STATUS_COLORS[item.status] || "#9ca3af",
                        }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* By Agent */}
        <div className="rounded-lg bg-white shadow p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Tickets by Agent</h3>
          <div className="space-y-3">
            {agentBreakdown.length === 0 ? (
              <p className="text-sm text-gray-400">No tickets found.</p>
            ) : (
              agentBreakdown.map((item) => {
                const total = agentBreakdown.reduce((sum, a) => sum + a.count, 0);
                const pct = total > 0 ? (item.count / total) * 100 : 0;
                return (
                  <div key={item.agentName}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-700">{item.agentName}</span>
                      <span className="text-sm text-gray-500">{item.count}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2.5">
                      <div
                        className="h-2.5 rounded-full bg-indigo-500 transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* 8-Week Resolution Chart */}
      <div className="rounded-lg bg-white shadow p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">
          Tickets Resolved Per Week (Last 8 Weeks)
        </h3>
        {weeklyResolved.every((w) => w.count === 0) ? (
          <p className="text-sm text-gray-400 text-center py-8">No resolutions in the last 8 weeks.</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={weeklyResolved} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="weekLabel"
                tick={{ fontSize: 12, fill: "#6b7280" }}
                tickLine={false}
                axisLine={{ stroke: "#e5e7eb" }}
              />
              <YAxis
                tick={{ fontSize: 12, fill: "#6b7280" }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#fff",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  fontSize: "13px",
                }}
                cursor={{ fill: "rgba(59, 130, 246, 0.08)" }}
              />
              <Bar dataKey="count" name="Resolved" radius={[6, 6, 0, 0]}>
                {weeklyResolved.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={index === weeklyResolved.length - 1 ? "#3b82f6" : "#93c5fd"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

// --- Headline Card ---
function HeadlineCard({
  title,
  value,
  icon,
  color,
  valueColor,
}: {
  title: string;
  value: number;
  icon: string;
  color: string;
  valueColor: string;
}) {
  return (
    <div className={`rounded-xl border-l-4 ${color} p-5 shadow-sm`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{title}</p>
          <p className={`text-3xl font-bold mt-1 ${valueColor}`}>{value}</p>
        </div>
        <span className="text-3xl">{icon}</span>
      </div>
    </div>
  );
}
