"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { useRouter } from "next/navigation";
import TicketModal, { TicketFormData } from "@/components/TicketModal";
import TicketDetailsModal from "@/components/TicketDetailsModal";
import AnalyticsDashboard from "@/components/AnalyticsDashboard";
import BulkResultsModal, { BulkResult } from "@/components/BulkResultsModal";
import SlaAlertsPanel from "@/components/SlaAlertsPanel";
import Loader from "@/components/Loader";

export default function Dashboard() {
  const { user, logout, loading } = useAuth();
  const router = useRouter();
  
  const [tickets, setTickets] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [error, setError] = useState("");

  // Top-level view: supervisors default to analytics, agents to ticket queue (Decision 24)
  const [activeView, setActiveView] = useState<'queue' | 'analytics' | 'alerts'>(
    user?.role === 'SUPERVISOR' ? 'analytics' : 'queue'
  );

  // SLA Alert count badge (Goal 10) — polled every 30s
  const [slaAlertCount, setSlaAlertCount] = useState(0);
  
  // Base view
  const [isArchivedView, setIsArchivedView] = useState(false);
  
  // Filter States
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [category, setCategory] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState("desc");
  
  // Pagination States
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalTickets, setTotalTickets] = useState(0);
  const limit = 10;
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"CREATE" | "EDIT">("CREATE");
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [detailsModalTicket, setDetailsModalTicket] = useState<any | null>(null);

  // Bulk Action States
  const [selectedTicketIds, setSelectedTicketIds] = useState<string[]>([]);
  const [isBulkResultsOpen, setIsBulkResultsOpen] = useState(false);
  const [bulkResults, setBulkResults] = useState<BulkResult[]>([]);
  const [bulkAssigneeId, setBulkAssigneeId] = useState("");

  // Debounce search input automatically
  useEffect(() => {
    const handler = setTimeout(() => {
      if (search !== searchInput) {
        setSearch(searchInput);
        setPage(1);
      }
    }, 300);
    return () => clearTimeout(handler);
  }, [searchInput, search]);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  const fetchTickets = () => {
    if (user) {
      const params = new URLSearchParams();
      params.append('isArchived', String(isArchivedView));
      params.append('page', String(page));
      params.append('limit', String(limit));
      
      if (search) params.append('search', search);
      if (status) params.append('status', status);
      if (priority) params.append('priority', priority);
      if (category) params.append('category', category);
      if (assigneeId) params.append('assigneeId', assigneeId);
      if (sortBy) params.append('sortBy', sortBy);
      if (sortOrder) params.append('sortOrder', sortOrder);

      apiFetch(`/tickets?${params.toString()}`)
        .then((res) => {
          setTickets(res.data || []);
          setTotalTickets(res.total || 0);
          setTotalPages(res.totalPages || 1);
        })
        .catch((err) => setError(err.message || "Failed to load tickets"));
    }
  };

  const fetchUsers = () => {
    if (user) {
      apiFetch('/auth/users')
        .then((data) => setUsers(data))
        .catch(() => {});
    }
  };

  useEffect(() => {
    fetchTickets();
    setSelectedTicketIds([]);
  }, [user, isArchivedView, search, status, priority, category, assigneeId, sortBy, sortOrder, page]);

  useEffect(() => {
    fetchUsers();
  }, [user]);

  // Goal 10: Poll SLA alert count every 30 seconds
  const fetchAlertCount = useCallback(() => {
    if (user) {
      apiFetch('/sla-alerts/count')
        .then((res) => setSlaAlertCount(res.count || 0))
        .catch(() => {}); // silent fail for badge polling
    }
  }, [user]);

  useEffect(() => {
    fetchAlertCount();
    const interval = setInterval(fetchAlertCount, 30000);
    return () => clearInterval(interval);
  }, [fetchAlertCount]);

  if (loading || !user) {
    return <Loader text="Authenticating..." />;
  }

  const canActOnTicket = (ticket: any) => {
    if (user.role === 'SUPERVISOR') return true;
    const isAssignee = ticket.primaryAssigneeId === user.id;
    const isCollaborator = ticket.collaborators?.some((c: any) => c.userId === user.id);
    return isAssignee || isCollaborator;
  };

  const openCreateModal = () => {
    setModalMode("CREATE");
    setSelectedTicket(null);
    setIsModalOpen(true);
  };

  const openEditModal = (ticket: any) => {
    setModalMode("EDIT");
    setSelectedTicket(ticket);
    setIsModalOpen(true);
  };

  const handleModalSubmit = async (data: TicketFormData) => {
    try {
      if (modalMode === "CREATE") {
        await apiFetch("/tickets", { method: "POST", body: JSON.stringify(data) });
      } else if (modalMode === "EDIT" && selectedTicket) {
        await apiFetch(`/tickets/${selectedTicket.id}`, { method: "PUT", body: JSON.stringify(data) });
      }
      setIsModalOpen(false);
      fetchTickets();
    } catch (err: any) {
      alert(err.message || "Failed to save ticket");
    }
  };

  const handleToggleArchive = async (ticket: any) => {
    try {
      const endpoint = isArchivedView ? `/tickets/${ticket.id}/restore` : `/tickets/${ticket.id}/archive`;
      await apiFetch(endpoint, { method: "PATCH" });
      fetchTickets();
    } catch (err: any) {
      alert(err.message || "Failed to update ticket");
    }
  };

  const handleReassignTicket = async (ticketId: string, primaryAssigneeId: string) => {
    try {
      await apiFetch(`/tickets/${ticketId}/triage`, {
        method: "PATCH",
        body: JSON.stringify({ primaryAssigneeId }),
      });
      fetchTickets();
    } catch (err: any) {
      alert(err.message || "Failed to reassign ticket");
    }
  };

  const clearFilters = () => {
    setSearchInput("");
    setSearch("");
    setStatus("");
    setPriority("");
    setCategory("");
    setAssigneeId("");
    setSortBy("createdAt");
    setSortOrder("desc");
    setPage(1);
  };

  const handleExportCsv = async () => {
    const params = new URLSearchParams();
    params.append('isArchived', String(isArchivedView));
    if (search) params.append('search', search);
    if (status) params.append('status', status);
    if (priority) params.append('priority', priority);
    if (category) params.append('category', category);
    if (assigneeId) params.append('assigneeId', assigneeId);
    if (sortBy) params.append('sortBy', sortBy);
    if (sortOrder) params.append('sortOrder', sortOrder);

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
      const response = await fetch(`${API_URL}/tickets/export?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (!response.ok) throw new Error("Failed to export");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tickets_export_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert("Error exporting CSV");
    }
  };

  const handleBulkClose = async () => {
    if (!confirm(`Are you sure you want to close ${selectedTicketIds.length} tickets?`)) return;
    try {
      const res = await apiFetch('/tickets/bulk/close', {
        method: 'POST',
        body: JSON.stringify({ ticketIds: selectedTicketIds })
      });
      setBulkResults(res.results || []);
      setIsBulkResultsOpen(true);
      setSelectedTicketIds([]);
    } catch (err: any) {
      alert(err.message || "Failed to execute bulk close");
    }
  };

  const handleBulkReassign = async () => {
    try {
      const res = await apiFetch('/tickets/bulk/reassign', {
        method: 'POST',
        body: JSON.stringify({ 
          ticketIds: selectedTicketIds, 
          primaryAssigneeId: bulkAssigneeId || null 
        })
      });
      setBulkResults(res.results || []);
      setIsBulkResultsOpen(true);
      setSelectedTicketIds([]);
      setBulkAssigneeId("");
    } catch (err: any) {
      alert(err.message || "Failed to execute bulk reassign");
    }
  };

  const toggleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedTicketIds(tickets.map(t => t.id));
    } else {
      setSelectedTicketIds([]);
    }
  };

  const toggleSelectTicket = (id: string) => {
    setSelectedTicketIds(prev => 
      prev.includes(id) ? prev.filter(tId => tId !== id) : [...prev, id]
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        {/* Header section */}
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">Welcome back, {user.name} ({user.role})</p>
          </div>
          <button
            onClick={logout}
            className="rounded-md border border-red-300 bg-white/70 backdrop-blur-sm px-4 py-2 text-sm font-medium text-red-600 shadow-sm hover:bg-red-50 cursor-pointer transition-all duration-200 active:scale-95"
          >
            Log out
          </button>
        </header>

        {/* Top-level view toggle: Analytics vs Ticket Queue vs SLA Alerts */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveView('analytics')}
            className={`cursor-pointer transition-all duration-200 active:scale-95 rounded-md px-4 py-2 text-sm font-medium shadow-sm ${
              activeView === 'analytics'
                ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white border border-indigo-600'
                : 'bg-white/70 backdrop-blur-md text-gray-700 border border-white/20 hover:bg-white'
            }`}
          >
            📊 Analytics
          </button>
          <button
            onClick={() => setActiveView('queue')}
            className={`cursor-pointer transition-all duration-200 active:scale-95 rounded-md px-4 py-2 text-sm font-medium shadow-sm ${
              activeView === 'queue'
                ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white border border-indigo-600'
                : 'bg-white/70 backdrop-blur-md text-gray-700 border border-white/20 hover:bg-white'
            }`}
          >
            📋 Ticket Queue
          </button>
          <button
            onClick={() => { setActiveView('alerts'); fetchAlertCount(); }}
            className={`cursor-pointer transition-all duration-200 active:scale-95 rounded-md px-4 py-2 text-sm font-medium relative shadow-sm ${
              activeView === 'alerts'
                ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white border border-indigo-600'
                : 'bg-white/70 backdrop-blur-md text-gray-700 border border-white/20 hover:bg-white'
            }`}
          >
            🚨 SLA Alerts
            {slaAlertCount > 0 && (
              <span className="absolute -top-2 -right-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-600 text-white text-xs font-bold animate-pulse shadow-lg">
                {slaAlertCount > 99 ? '99+' : slaAlertCount}
              </span>
            )}
          </button>
        </div>

        {error && (
          <div className="rounded-md bg-red-50/80 backdrop-blur-sm p-4 text-sm text-red-700 border border-red-200">
            {error}
          </div>
        )}

        {/* Render the active view */}
        {activeView === 'analytics' ? (
          <AnalyticsDashboard />
        ) : activeView === 'alerts' ? (
          <SlaAlertsPanel
            onTicketClick={async (ticketId) => {
              try {
                const ticket = await apiFetch(`/tickets?search=${ticketId}&limit=1`);
                const found = ticket.data?.find((t: any) => t.id === ticketId);
                if (found) setDetailsModalTicket(found);
              } catch {}
            }}
            onAlertAcknowledged={() => setSlaAlertCount((c) => Math.max(0, c - 1))}
          />
        ) : (
        <>

        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-2">
            <button
              onClick={() => { setIsArchivedView(false); setPage(1); }}
              className={`cursor-pointer transition-all duration-200 active:scale-95 rounded-md px-4 py-2 text-sm font-medium shadow-sm ${!isArchivedView ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white border-blue-600' : 'bg-white/70 backdrop-blur-md text-gray-700 border border-white/20 hover:bg-white'}`}
            >
              Active Queue
            </button>
            <button
              onClick={() => { setIsArchivedView(true); setPage(1); }}
              className={`cursor-pointer transition-all duration-200 active:scale-95 rounded-md px-4 py-2 text-sm font-medium shadow-sm ${isArchivedView ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white border-blue-600' : 'bg-white/70 backdrop-blur-md text-gray-700 border border-white/20 hover:bg-white'}`}
            >
              Archived Queue
            </button>
          </div>
          <button
            onClick={openCreateModal}
            className="cursor-pointer transition-all duration-200 active:scale-95 rounded-md bg-gradient-to-r from-green-500 to-emerald-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90 shadow-md"
          >
            + Create Ticket
          </button>
        </div>

        {/* Filters Bar */}
        <div className="rounded-xl bg-white/60 backdrop-blur-lg shadow-xl border border-white/40 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-700">Find Tickets</h3>
            <div className="flex gap-4">
              <button onClick={handleExportCsv} className="text-sm text-green-600 hover:underline">
                ↓ Export CSV
              </button>
              <button onClick={clearFilters} className="text-sm text-blue-600 hover:underline">
                Clear Filters
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <input
                type="text"
                placeholder="Search subject or description..."
                className="w-full rounded border border-gray-300 bg-white/50 px-3 py-2 text-sm text-black"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              className="w-full rounded border border-gray-300 bg-white/50 px-3 py-2 text-sm text-black"
            >
              <option value="">Any Status</option>
              <option value="NEW">NEW</option>
              <option value="OPEN">OPEN</option>
              <option value="PENDING">PENDING</option>
              <option value="RESOLVED">RESOLVED</option>
              <option value="CLOSED">CLOSED</option>
            </select>

            <select
              value={priority}
              onChange={(e) => { setPriority(e.target.value); setPage(1); }}
              className="w-full rounded border border-gray-300 bg-white/50 px-3 py-2 text-sm text-black"
            >
              <option value="">Any Priority</option>
              <option value="URGENT">URGENT</option>
              <option value="HIGH">HIGH</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="LOW">LOW</option>
            </select>

            <input
              type="text"
              placeholder="Category (Exact match)"
              className="w-full rounded border border-gray-300 bg-white/50 px-3 py-2 text-sm text-black"
              value={category}
              onChange={(e) => { setCategory(e.target.value); setPage(1); }}
            />

            <select
              value={assigneeId}
              onChange={(e) => { setAssigneeId(e.target.value); setPage(1); }}
              className="w-full rounded border border-gray-300 bg-white/50 px-3 py-2 text-sm text-black"
            >
              <option value="">Any Assignee</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>

            <select
              value={sortBy}
              onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
              className="w-full rounded border border-gray-300 bg-white/50 px-3 py-2 text-sm text-black"
            >
              <option value="createdAt">Sort by: Created Date</option>
              <option value="priority">Sort by: Priority</option>
              <option value="updatedAt">Sort by: Last Update</option>
            </select>

            <select
              value={sortOrder}
              onChange={(e) => { setSortOrder(e.target.value); setPage(1); }}
              className="w-full rounded border border-gray-300 bg-white/50 px-3 py-2 text-sm text-black"
            >
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
          </div>
        </div>

        {/* Bulk Actions Toolbar */}
        {selectedTicketIds.length > 0 && (
          <div className="rounded-xl bg-indigo-50/80 backdrop-blur-md shadow-lg border border-indigo-200 p-4 flex items-center justify-between animate-in slide-in-from-top-2">
            <span className="text-sm font-medium text-indigo-800">
              {selectedTicketIds.length} ticket(s) selected
            </span>
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <select
                  value={bulkAssigneeId}
                  onChange={(e) => setBulkAssigneeId(e.target.value)}
                  className="rounded border border-indigo-300 bg-white/50 px-3 py-1.5 text-sm text-black"
                >
                  <option value="">Select Assignee...</option>
                  {users.filter(u => u.role === 'AGENT').map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
                <button
                  onClick={handleBulkReassign}
                  disabled={!bulkAssigneeId}
                  className="cursor-pointer transition-all duration-200 active:scale-95 rounded bg-gradient-to-r from-indigo-600 to-indigo-500 px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 shadow-sm disabled:opacity-50"
                >
                  Reassign
                </button>
              </div>
              <button
                onClick={handleBulkClose}
                className="cursor-pointer transition-all duration-200 active:scale-95 rounded bg-gradient-to-r from-red-600 to-rose-500 px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 shadow-sm"
              >
                Close Selected
              </button>
            </div>
          </div>
        )}

        {/* Ticket List */}
        <div className="rounded-xl bg-white/60 backdrop-blur-lg shadow-xl border border-white/40 overflow-hidden">
          <div className="border-b border-gray-200/50 bg-white/50 px-6 py-4 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                checked={tickets.length > 0 && selectedTicketIds.length === tickets.length}
                onChange={toggleSelectAll}
                title="Select all on page"
              />
              <h2 className="text-lg font-medium text-gray-900">
                {isArchivedView ? 'Archived Tickets' : (user.role === 'SUPERVISOR' ? 'All Active Tickets' : 'My Active Tickets')}
              </h2>
            </div>
            <span className="text-sm text-gray-500">
              Showing {tickets.length} of {totalTickets}
            </span>
          </div>
          
          <ul className="divide-y divide-gray-200">
            {tickets.length === 0 ? (
              <li className="px-6 py-8 text-center text-gray-500">No tickets found matching your filters.</li>
            ) : (
              tickets.map((ticket) => (
                <li key={ticket.id} className="px-6 py-4 hover:bg-white/40 flex items-center transition-colors">
                  <div className="mr-4">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      checked={selectedTicketIds.includes(ticket.id)}
                      onChange={() => toggleSelectTicket(ticket.id)}
                    />
                  </div>
                  <div className="flex items-center justify-between flex-1">
                    <div 
                      className="cursor-pointer flex-1 mr-4"
                      onClick={() => setDetailsModalTicket(ticket)}
                    >
                      <p className="font-medium text-gray-900 hover:text-blue-600">{ticket.subject}</p>
                      <p className="text-sm text-gray-500">
                        Requester: {ticket.requesterEmail} | Status: {ticket.status} | Priority: {ticket.priority} | Category: {ticket.category}
                      </p>
                      <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                        <span>Assignee: {ticket.primaryAssignee?.name || 'Unassigned'}</span>
                        {/* Supervisor reassign select */}
                        {user.role === 'SUPERVISOR' && (
                          <select
                            className="rounded border border-gray-300 bg-white/50 text-xs px-2 py-1 text-black"
                            value={ticket.primaryAssigneeId || ""}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => handleReassignTicket(ticket.id, e.target.value)}
                          >
                            <option value="" disabled>Reassign to...</option>
                            {users.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name} ({u.role})
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setDetailsModalTicket(ticket)}
                        className="cursor-pointer transition-all duration-200 active:scale-95 rounded border border-blue-300 bg-blue-50/50 px-3 py-1 text-sm font-medium text-blue-700 hover:bg-blue-100"
                      >
                        View Details
                      </button>

                      {canActOnTicket(ticket) && (
                        <>
                          <button
                            onClick={() => openEditModal(ticket)}
                            className="cursor-pointer transition-all duration-200 active:scale-95 rounded border border-gray-300 bg-white/50 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleToggleArchive(ticket)}
                            className="cursor-pointer transition-all duration-200 active:scale-95 rounded border border-gray-300 bg-white/50 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50"
                          >
                            {isArchivedView ? 'Restore' : 'Archive'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              ))
            )}
          </ul>
          
          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="border-t border-gray-200 px-6 py-4 flex items-center justify-between">
              <button
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
                className="cursor-pointer transition-all duration-200 active:scale-95 rounded-md border border-gray-300 bg-white/80 backdrop-blur-sm px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-sm text-gray-700">
                Page {page} of {totalPages}
              </span>
              <button
                disabled={page === totalPages || totalPages === 0}
                onClick={() => setPage(page + 1)}
                className="cursor-pointer transition-all duration-200 active:scale-95 rounded-md border border-gray-300 bg-white/80 backdrop-blur-sm px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </div>

      <TicketModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleModalSubmit}
        initialData={selectedTicket ? {
          subject: selectedTicket.subject,
          description: selectedTicket.description,
          requesterEmail: selectedTicket.requesterEmail,
          priority: selectedTicket.priority,
          category: selectedTicket.category,
          primaryAssigneeId: selectedTicket.primaryAssigneeId,
        } : null}
        title={modalMode === "CREATE" ? "Create New Ticket" : "Edit Ticket"}
        users={users}
        isSupervisor={user.role === 'SUPERVISOR'}
      />
      <TicketDetailsModal
        isOpen={!!detailsModalTicket}
        onClose={() => setDetailsModalTicket(null)}
        ticket={detailsModalTicket}
        currentUser={user}
        allUsers={users}
        onTicketUpdated={(updatedTicket) => {
          setTickets((prev) =>
            prev.map((t) => (t.id === updatedTicket.id ? { ...t, ...updatedTicket } : t))
          );
          setDetailsModalTicket(updatedTicket);
        }}
      />

      <BulkResultsModal
        isOpen={isBulkResultsOpen}
        onClose={() => setIsBulkResultsOpen(false)}
        results={bulkResults}
      />
      </>
        )}
      </main>
    </div>
  );
}
