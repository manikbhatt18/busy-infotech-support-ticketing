"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { useRouter } from "next/navigation";
import TicketModal, { TicketFormData } from "@/components/TicketModal";
import TicketDetailsModal from "@/components/TicketDetailsModal";

export default function Dashboard() {
  const { user, logout, loading } = useAuth();
  const router = useRouter();
  
  const [tickets, setTickets] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [error, setError] = useState("");
  
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
  }, [user, isArchivedView, search, status, priority, category, assigneeId, sortBy, sortOrder, page]);

  useEffect(() => {
    fetchUsers();
  }, [user]);

  if (loading || !user) {
    return <div className="p-8 text-center">Loading...</div>;
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

        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={() => { setIsArchivedView(false); setPage(1); }}
              className={`rounded-md px-4 py-2 text-sm font-medium ${!isArchivedView ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'}`}
            >
              Active Queue
            </button>
            <button
              onClick={() => { setIsArchivedView(true); setPage(1); }}
              className={`rounded-md px-4 py-2 text-sm font-medium ${isArchivedView ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'}`}
            >
              Archived Queue
            </button>
          </div>
          <button
            onClick={openCreateModal}
            className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            + Create Ticket
          </button>
        </div>

        {/* Filters Bar */}
        <div className="rounded-lg bg-white shadow p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-700">Find Tickets</h3>
            <button onClick={clearFilters} className="text-sm text-blue-600 hover:underline">
              Clear Filters
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <input
                type="text"
                placeholder="Search subject or description..."
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-black"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-black"
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
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-black"
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
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-black"
              value={category}
              onChange={(e) => { setCategory(e.target.value); setPage(1); }}
            />

            <select
              value={assigneeId}
              onChange={(e) => { setAssigneeId(e.target.value); setPage(1); }}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-black"
            >
              <option value="">Any Assignee</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>

            <select
              value={sortBy}
              onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-black"
            >
              <option value="createdAt">Sort by: Created Date</option>
              <option value="priority">Sort by: Priority</option>
              <option value="updatedAt">Sort by: Last Update</option>
            </select>

            <select
              value={sortOrder}
              onChange={(e) => { setSortOrder(e.target.value); setPage(1); }}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-black"
            >
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
          </div>
        </div>

        {/* Ticket List */}
        <div className="rounded-lg bg-white shadow">
          <div className="border-b border-gray-200 px-6 py-4 flex justify-between items-center">
            <h2 className="text-lg font-medium text-gray-900">
              {isArchivedView ? 'Archived Tickets' : (user.role === 'SUPERVISOR' ? 'All Active Tickets' : 'My Active Tickets')}
            </h2>
            <span className="text-sm text-gray-500">
              Showing {tickets.length} of {totalTickets}
            </span>
          </div>
          
          <ul className="divide-y divide-gray-200">
            {tickets.length === 0 ? (
              <li className="px-6 py-8 text-center text-gray-500">No tickets found matching your filters.</li>
            ) : (
              tickets.map((ticket) => (
                <li key={ticket.id} className="px-6 py-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
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
                            className="rounded border border-gray-300 text-xs px-2 py-1 text-black"
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
                        className="rounded border border-blue-300 bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700 hover:bg-blue-100"
                      >
                        View Details
                      </button>

                      {canActOnTicket(ticket) && (
                        <>
                          <button
                            onClick={() => openEditModal(ticket)}
                            className="rounded border border-gray-300 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleToggleArchive(ticket)}
                            className="rounded border border-gray-300 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50"
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
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600">
                Page {page} of {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          )}
        </div>
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
    </div>
  );
}
