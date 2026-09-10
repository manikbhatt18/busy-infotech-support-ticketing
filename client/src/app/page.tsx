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
import { 
  BarChart3, 
  ListTodo, 
  AlertCircle, 
  Plus, 
  Search, 
  Download, 
  FilterX, 
  Inbox, 
  Clock, 
  CheckCircle2, 
  Archive,
  LogOut,
  User,
  Tag,
  LayoutList
} from "lucide-react";

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
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1 flex items-center gap-1.5">
              <User className="w-4 h-4" /> Welcome back, <span className="font-medium text-gray-900">{user.name}</span> ({user.role})
            </p>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 shadow-sm hover:bg-gray-50 hover:text-gray-900 transition-colors"
          >
            <LogOut className="w-4 h-4" /> Log out
          </button>
        </header>

        {/* Top Navigation Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1 bg-white p-1 rounded-lg shadow-sm border border-gray-200 mb-6 sm:mb-8">
          <button
            onClick={() => setActiveView('queue')}
            className={`flex items-center justify-center sm:justify-start gap-2 rounded-md px-3 sm:px-4 py-2 text-sm font-medium transition-colors ${activeView === 'queue' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
          >
            <LayoutList className="w-4 h-4" /> Ticket Queue
          </button>
          
          <button
            onClick={() => setActiveView('analytics')}
            className={`flex items-center justify-center sm:justify-start gap-2 rounded-md px-3 sm:px-4 py-2 text-sm font-medium transition-colors ${activeView === 'analytics' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
          >
            <BarChart3 className="w-4 h-4" /> Analytics Dashboard
          </button>

          <button
            onClick={() => { setActiveView('alerts'); fetchAlertCount(); }}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium relative transition-colors ${
              activeView === 'alerts'
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <AlertCircle className="w-4 h-4" /> SLA Alerts
            {slaAlertCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-sm ring-2 ring-white">
                {slaAlertCount > 99 ? '99+' : slaAlertCount}
              </span>
            )}
          </button>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700 border border-red-200 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {error}
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

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between mb-4 gap-4 sm:gap-0">
          <div className="flex gap-2 bg-gray-100 p-1 rounded-lg w-full sm:w-auto">
            <button
              onClick={() => { setIsArchivedView(false); setPage(1); }}
              className={`flex-1 sm:flex-none flex justify-center items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${!isArchivedView ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
            >
              <Inbox className="w-4 h-4" /> Active
            </button>
            <button
              onClick={() => { setIsArchivedView(true); setPage(1); }}
              className={`flex-1 sm:flex-none flex justify-center items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${isArchivedView ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
            >
              <Archive className="w-4 h-4" /> Archived
            </button>
          </div>
          <button
            onClick={openCreateModal}
            className="flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500 transition-colors w-full sm:w-auto"
          >
            <Plus className="w-4 h-4" /> Create Ticket
          </button>
        </div>

        {/* Filters Bar */}
        <div className="rounded-xl bg-white shadow-sm border border-gray-200 p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-gray-100 pb-4 gap-3 sm:gap-0">
            <h3 className="text-sm font-semibold text-gray-900">Filters & Search</h3>
            <div className="flex gap-3 w-full sm:w-auto justify-between sm:justify-start">
              <button onClick={handleExportCsv} className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
                <Download className="w-4 h-4" /> Export CSV
              </button>
              <button onClick={clearFilters} className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
                <FilterX className="w-4 h-4" /> Clear
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Search className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Search subject..."
                className="block w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              className="block w-full rounded-lg border border-gray-300 bg-white py-2 pl-3 pr-10 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">Any Status</option>
              <option value="NEW">New</option>
              <option value="OPEN">Open</option>
              <option value="PENDING">Pending</option>
              <option value="RESOLVED">Resolved</option>
              <option value="CLOSED">Closed</option>
            </select>

            <select
              value={priority}
              onChange={(e) => { setPriority(e.target.value); setPage(1); }}
              className="block w-full rounded-lg border border-gray-300 bg-white py-2 pl-3 pr-10 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">Any Priority</option>
              <option value="URGENT">Urgent</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>

            <select
              value={assigneeId}
              onChange={(e) => { setAssigneeId(e.target.value); setPage(1); }}
              className="block w-full rounded-lg border border-gray-300 bg-white py-2 pl-3 pr-10 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">Any Assignee</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>

            {/* Additional sorting line */}
            <select
              value={sortBy}
              onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
              className="block w-full rounded-lg border border-gray-300 bg-white py-2 pl-3 pr-10 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            >
              <option value="createdAt">Sort by: Created Date</option>
              <option value="priority">Sort by: Priority</option>
              <option value="updatedAt">Sort by: Last Update</option>
            </select>

            <select
              value={sortOrder}
              onChange={(e) => { setSortOrder(e.target.value); setPage(1); }}
              className="block w-full rounded-lg border border-gray-300 bg-white py-2 pl-3 pr-10 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            >
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
          </div>
        </div>

        {/* Bulk Actions Toolbar */}
        {selectedTicketIds.length > 0 && (
          <div className="rounded-xl bg-gray-900 shadow-xl border border-gray-800 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between animate-in slide-in-from-top-2 fade-in gap-3 sm:gap-0">
            <span className="text-sm font-medium text-white flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-indigo-400" />
              {selectedTicketIds.length} ticket(s) selected
            </span>
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <select
                  value={bulkAssigneeId}
                  onChange={(e) => setBulkAssigneeId(e.target.value)}
                  className="w-full sm:w-auto rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-white focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">Assign to...</option>
                  {users.filter(u => u.role === 'AGENT').map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
                <button
                  onClick={handleBulkReassign}
                  disabled={!bulkAssigneeId}
                  className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 shadow-sm disabled:opacity-50 transition-colors shrink-0"
                >
                  Reassign
                </button>
              </div>
              <button
                onClick={handleBulkClose}
                className="w-full sm:w-auto rounded-lg bg-gray-800 border border-gray-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-700 shadow-sm transition-colors"
              >
                Close Selected
              </button>
            </div>
          </div>
        )}

        {/* Ticket List */}
        {/* Ticket List */}
        <div className="rounded-xl bg-white shadow-sm border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200 bg-gray-50/50 px-6 py-4 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                checked={tickets.length > 0 && selectedTicketIds.length === tickets.length}
                onChange={toggleSelectAll}
                title="Select all on page"
              />
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">
                {isArchivedView ? 'Archived Tickets' : (user.role === 'SUPERVISOR' ? 'All Active Tickets' : 'My Active Tickets')}
              </h2>
            </div>
            <span className="text-sm font-medium text-gray-500">
              {totalTickets} total
            </span>
          </div>
          
          <ul className="divide-y divide-gray-200">
            {tickets.length === 0 ? (
              <li className="px-6 py-8 text-center text-gray-500">No tickets found matching your filters.</li>
            ) : (
              tickets.map((ticket) => (
                <li key={ticket.id} className="px-4 sm:px-6 py-4 hover:bg-gray-50 flex items-start sm:items-center transition-colors group">
                  <div className="mr-3 sm:mr-4 mt-1 sm:mt-0">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      checked={selectedTicketIds.includes(ticket.id)}
                      onChange={() => toggleSelectTicket(ticket.id)}
                    />
                  </div>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between flex-1 gap-3 sm:gap-0 min-w-0">
                    <div 
                      className="cursor-pointer flex-1 mr-0 sm:mr-4 min-w-0 w-full"
                      onClick={() => setDetailsModalTicket(ticket)}
                    >
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
                        <p className="font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors w-full sm:w-auto truncate">{ticket.subject}</p>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] sm:text-xs font-medium border ${
                          ticket.status === 'NEW' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                          ticket.status === 'OPEN' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          ticket.status === 'PENDING' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          ticket.status === 'RESOLVED' ? 'bg-green-50 text-green-700 border-green-200' :
                          'bg-gray-100 text-gray-700 border-gray-200'
                        }`}>
                          {ticket.status}
                        </span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] sm:text-xs font-medium border ${
                          ticket.priority === 'URGENT' ? 'bg-red-50 text-red-700 border-red-200' :
                          ticket.priority === 'HIGH' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                          ticket.priority === 'MEDIUM' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          'bg-gray-50 text-gray-600 border-gray-200'
                        }`}>
                          {ticket.priority}
                        </span>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] sm:text-xs text-gray-500">
                        <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" /> {ticket.requesterEmail}</span>
                        <span className="flex items-center gap-1"><Tag className="w-3.5 h-3.5" /> {ticket.category}</span>
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Assignee: {ticket.primaryAssignee?.name || 'Unassigned'}
                        </span>
                        
                        {/* Supervisor reassign select */}
                        {user.role === 'SUPERVISOR' && (
                          <select
                            className="rounded border border-gray-300 bg-white text-xs px-2 py-1 text-black shadow-sm"
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
                    
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setDetailsModalTicket(ticket)}
                        className="rounded bg-white border border-gray-200 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-indigo-600 transition-colors shadow-sm"
                      >
                        View
                      </button>

                      {canActOnTicket(ticket) && (
                        <>
                          <button
                            onClick={() => openEditModal(ticket)}
                            className="rounded bg-white border border-gray-200 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleToggleArchive(ticket)}
                            className="rounded bg-white border border-gray-200 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
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
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 shadow-sm transition-colors"
              >
                Previous
              </button>
              <span className="text-sm font-medium text-gray-500">
                Page {page} of {totalPages}
              </span>
              <button
                disabled={page === totalPages || totalPages === 0}
                onClick={() => setPage(page + 1)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 shadow-sm transition-colors"
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
