"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { useRouter } from "next/navigation";

export default function Dashboard() {
  const { user, logout, loading } = useAuth();
  const router = useRouter();
  const [tickets, setTickets] = useState<any[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      apiFetch("/tickets")
        .then((data) => setTickets(data))
        .catch((err) => setError(err.message || "Failed to load tickets"));
    }
  }, [user]);

  if (loading || !user) {
    return <div className="p-8 text-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex items-center justify-between rounded-lg bg-white p-6 shadow">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-sm text-gray-500">
              Logged in as {user.name} ({user.email}) - <span className="font-semibold text-blue-600">{user.role}</span>
            </p>
          </div>
          <button
            onClick={logout}
            className="rounded border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 text-black"
          >
            Logout
          </button>
        </header>

        {error && (
          <div className="rounded-md bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="rounded-lg bg-white shadow">
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="text-lg font-medium text-gray-900">
              {user.role === 'SUPERVISOR' ? 'All Tickets (Queue)' : 'My Assigned & Collaborating Tickets'}
            </h2>
          </div>
          
          <ul className="divide-y divide-gray-200">
            {tickets.length === 0 ? (
              <li className="px-6 py-8 text-center text-gray-500">No tickets found.</li>
            ) : (
              tickets.map((ticket) => (
                <li key={ticket.id} className="px-6 py-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{ticket.subject}</p>
                      <p className="text-sm text-gray-500">
                        Status: {ticket.status} | Priority: {ticket.priority} | Category: {ticket.category}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        Assignee: {ticket.primaryAssignee?.name || 'Unassigned'}
                      </p>
                    </div>
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
