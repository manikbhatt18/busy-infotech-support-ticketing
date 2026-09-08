"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import Loader from "@/components/Loader";
import { X, Clock, User, Users, Tag, AlertCircle, MessageSquare, ShieldAlert, CheckCircle2, Lock } from "lucide-react";

// Goal 4: Transition table mirrored on the client so the UI only shows legal options.
// The server is the real enforcer — this is purely to avoid presenting impossible choices.
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  NEW:      ['OPEN'],
  OPEN:     ['PENDING', 'RESOLVED'],
  PENDING:  ['OPEN'],
  RESOLVED: ['CLOSED', 'OPEN'],
  CLOSED:   ['OPEN'],
};

interface TicketDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticket: any | null;
  currentUser: any;
  allUsers?: any[];
  onTicketUpdated?: (updatedTicket: any) => void;
}

/** Returns a human-readable SLA remaining string, or null if no slaTargetAt. */
function getSlaDisplay(ticket: any): { label: string; color: string } | null {
  if (!ticket?.slaTargetAt) return null;

  if (ticket.status === 'PENDING') {
    return { label: 'SLA Paused (Pending)', color: 'text-blue-600 bg-blue-50 border-blue-200' };
  }
  if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') {
    return null;
  }

  const targetAt = new Date(ticket.slaTargetAt).getTime();
  const now = Date.now();
  const diffMs = targetAt - now;

  if (diffMs <= 0) {
    return { label: 'SLA Breached', color: 'text-red-700 bg-red-50 border-red-300' };
  }

  const diffH = diffMs / (1000 * 60 * 60);
  const diffM = diffMs / (1000 * 60);

  let label: string;
  if (diffH >= 1) {
    label = `SLA: ${Math.floor(diffH)}h ${Math.floor(diffM % 60)}m remaining`;
  } else {
    label = `SLA: ${Math.floor(diffM)}m remaining`;
  }

  const urgentThresholdMs = 30 * 60 * 1000; // 30 minutes
  const color = diffMs < urgentThresholdMs
    ? 'text-orange-700 bg-orange-50 border-orange-300'
    : 'text-green-700 bg-green-50 border-green-200';

  return { label, color };
}

export default function TicketDetailsModal({
  isOpen,
  onClose,
  ticket,
  currentUser,
  allUsers,
  onTicketUpdated,
}: TicketDetailsModalProps) {
  const [replies, setReplies] = useState<any[]>([]);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [error, setError] = useState("");

  const [replyBody, setReplyBody] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Goal 4: Status transition state
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [statusError, setStatusError] = useState("");

  // Goal 5: Collaborator state
  const [collabError, setCollabError] = useState("");

  // Live ticket state (updated after status transitions)
  const [liveTicket, setLiveTicket] = useState<any | null>(null);

  useEffect(() => {
    if (isOpen && ticket) {
      setLiveTicket(ticket);
      setReplies([]); // CLEAR STALE STATE
      fetchReplies(ticket.id);
      setReplyBody("");
      setIsInternal(false);
      setStatusError("");
      setCollabError("");
    } else {
      setLiveTicket(null);
      setReplies([]);
    }
  }, [isOpen, ticket]);

  const fetchReplies = async (ticketId: string) => {
    setLoadingReplies(true);
    setError("");
    try {
      const [repliesData, timelineData] = await Promise.all([
        apiFetch(`/tickets/${ticketId}/replies`),
        apiFetch(`/tickets/${ticketId}/timeline`)
      ]);
      
      const formattedReplies = repliesData.map((r: any) => ({ ...r, type: 'REPLY' }));
      const formattedEvents = timelineData
        .filter((e: any) => e.eventType !== 'REPLY_ADDED')
        .map((e: any) => ({ ...e, type: 'EVENT' }));

      const combined = [...formattedReplies, ...formattedEvents].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      
      setReplies(combined);
    } catch (err: any) {
      setError(err.message || "Failed to load ticket timeline");
    } finally {
      setLoadingReplies(false);
    }
  };

  const handlePostReply = async (authorType: 'AGENT' | 'CUSTOMER') => {
    if (!replyBody.trim() || !liveTicket) return;

    // Client-side guard matching the Zod cross-field validation (Decision 9)
    if (authorType === 'CUSTOMER' && isInternal) {
      alert("A customer reply can never be an internal note");
      return;
    }

    setSubmitting(true);
    try {
      const newReply = await apiFetch(`/tickets/${liveTicket.id}/replies`, {
        method: "POST",
        body: JSON.stringify({ body: replyBody, isInternal, authorType }),
      });

      setReplyBody("");
      setIsInternal(false);
      fetchReplies(liveTicket.id);

      // Goal 4: if this was a customer reply on a PENDING ticket, the server auto-transitioned
      // to OPEN — refresh the live ticket status to reflect the change in UI.
      if (authorType === 'CUSTOMER' && liveTicket.status === 'PENDING') {
        setLiveTicket((prev: any) => ({
          ...prev,
          status: 'OPEN',
          pendingEnteredAt: null,
        }));
        onTicketUpdated?.({ ...liveTicket, status: 'OPEN' });
      }
    } catch (err: any) {
      alert(err.message || "Failed to post reply");
    } finally {
      setSubmitting(false);
    }
  };

  // Goal 4: Status transition handler
  const handleStatusTransition = async (newStatus: string) => {
    if (!liveTicket) return;
    setStatusUpdating(true);
    setStatusError("");
    try {
      const updated = await apiFetch(`/tickets/${liveTicket.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      setLiveTicket(updated);
      onTicketUpdated?.(updated);
    } catch (err: any) {
      setStatusError(err.message || "Failed to update status");
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleAddCollaborator = async (userId: string) => {
    if (!userId || !liveTicket) return;
    setCollabError("");
    try {
      const updated = await apiFetch(`/tickets/${liveTicket.id}/collaborators`, {
        method: "POST",
        body: JSON.stringify({ userId }),
      });
      setLiveTicket(updated);
      onTicketUpdated?.(updated);
    } catch (err: any) {
      setCollabError(err.message || "Failed to add collaborator");
    }
  };

  const handleRemoveCollaborator = async (userId: string) => {
    if (!liveTicket) return;
    setCollabError("");
    try {
      await apiFetch(`/tickets/${liveTicket.id}/collaborators/${userId}`, {
        method: "DELETE",
      });
      // Removing a collaborator returns 204 No Content. We manually update the local state.
      const updated = {
        ...liveTicket,
        collaborators: liveTicket.collaborators.filter((c: any) => c.userId !== userId),
      };
      setLiveTicket(updated);
      onTicketUpdated?.(updated);
    } catch (err: any) {
      setCollabError(err.message || "Failed to remove collaborator");
    }
  };

  if (!isOpen || !liveTicket) return null;

  const slaDisplay = getSlaDisplay(liveTicket);

  // Only show transitions legal for the current status.
  // Agents cannot see CLOSED as an option (server enforces; client also hides it).
  const legalTransitions = (ALLOWED_TRANSITIONS[liveTicket.status] ?? []).filter(
    (s) => !(s === 'CLOSED' && currentUser.role === 'AGENT')
  );

  const statusColors: Record<string, string> = {
    NEW: 'bg-gray-100 text-gray-700',
    OPEN: 'bg-blue-100 text-blue-700',
    PENDING: 'bg-yellow-100 text-yellow-700',
    RESOLVED: 'bg-green-100 text-green-700',
    CLOSED: 'bg-gray-200 text-gray-500',
  };

  // Helper to determine if current user can manage collaborators
  const canManageCollaborators =
    currentUser.role === 'SUPERVISOR' || currentUser.id === liveTicket.primaryAssigneeId;

  // Filter for available agents to add (AGENT role, not primary assignee, not already added)
  const availableAgents = allUsers?.filter((u: any) => {
    if (u.role !== 'AGENT') return false;
    if (u.id === liveTicket.primaryAssigneeId) return false;
    if (liveTicket.collaborators?.some((c: any) => c.userId === u.id)) return false;
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-gray-900/60 p-4 animate-in fade-in duration-200">
      <div className="flex h-[90vh] w-full max-w-6xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
          <div className="flex-1 min-w-0 flex items-center gap-4">
            <h2 className="text-lg font-semibold text-gray-900 truncate">
              {liveTicket.subject}
            </h2>
            <span className={`rounded-md px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${statusColors[liveTicket.status] ?? 'bg-gray-100 text-gray-700'}`}>
              {liveTicket.status}
            </span>
            {slaDisplay && (
              <span className={`rounded-md border px-2.5 py-0.5 text-xs font-semibold flex items-center gap-1 ${slaDisplay.color}`}>
                <Clock className="w-3.5 h-3.5" /> {slaDisplay.label}
              </span>
            )}
          </div>
          <button onClick={onClose} className="ml-4 text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-md hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Goal 4: Status Transition Controls */}
        {legalTransitions.length > 0 && (
          <div className="border-b border-gray-200 bg-gray-50 px-6 py-3 flex items-center gap-3 flex-wrap">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" /> Move Status:
            </span>
            {legalTransitions.map((status) => (
              <button
                key={status}
                disabled={statusUpdating}
                onClick={() => handleStatusTransition(status)}
                className={`rounded-md border px-3 py-1 text-xs font-semibold shadow-sm disabled:opacity-50 transition-colors ${
                  status === 'CLOSED'
                    ? 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                    : status === 'RESOLVED'
                    ? 'border-green-300 bg-white text-green-700 hover:bg-green-50'
                    : status === 'PENDING'
                    ? 'border-yellow-300 bg-white text-yellow-700 hover:bg-yellow-50'
                    : 'border-indigo-300 bg-white text-indigo-700 hover:bg-indigo-50'
                }`}
              >
                {statusUpdating ? '...' : `→ ${status}`}
              </button>
            ))}
            {statusError && (
              <span className="text-xs text-red-600 ml-2">{statusError}</span>
            )}
          </div>
        )}

        {/* 2-Column Split Body */}
        <div className="flex flex-1 overflow-hidden">
          
          {/* Main Left Column (Conversation & Composer) */}
          <div className="flex flex-col flex-1 border-r border-gray-200 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {loadingReplies ? (
              <div className="flex justify-center items-center h-32"><Loader /></div>
            ) : replies.map((item) => {
              if (item.type === 'EVENT') {
                let eventText = '';
                const actorName = item.actor?.name || 'System';
                
                switch(item.eventType) {
                  case 'TICKET_CREATED': eventText = `Ticket created`; break;
                  case 'STATUS_CHANGED': eventText = `Changed status from ${item.oldStatus} to ${item.newStatus}`; break;
                  case 'REASSIGNED': 
                    const oldUser = allUsers?.find(u => u.id === item.oldAssigneeId);
                    const newUser = allUsers?.find(u => u.id === item.newAssigneeId);
                    const oldName = oldUser ? oldUser.name : (item.oldAssigneeId || 'Unassigned');
                    const newName = newUser ? newUser.name : (item.newAssigneeId || 'Unassigned');
                    eventText = `Reassigned from ${oldName} to ${newName}`; 
                    break;
                  case 'COLLABORATOR_ADDED': eventText = `Added collaborator ${item.collaborator?.name || item.collaboratorId}`; break;
                  case 'COLLABORATOR_REMOVED': eventText = `Removed collaborator ${item.collaborator?.name || item.collaboratorId}`; break;
                  default: eventText = item.eventType;
                }

                return (
                  <div key={item.id} className="flex justify-center my-4">
                    <div className="bg-gray-50 border border-gray-100 rounded-full px-4 py-1.5 text-xs text-gray-500 font-medium flex items-center gap-2 shadow-sm">
                      <Clock className="w-3.5 h-3.5 text-gray-400" />
                      <span><strong className="text-gray-700">{actorName}</strong> {eventText}</span>
                      <span className="text-gray-400 ml-1">
                        {new Date(item.createdAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                    </div>
                  </div>
                );
              }

              // Normal Reply Rendering
              const isCustomer = item.authorType === 'CUSTOMER';
              const authorName = isCustomer
                ? (liveTicket.requesterEmail || "Customer")
                : (item.author?.name || "Unknown Agent");

              return (
                <div
                  key={item.id}
                  className={`rounded-xl p-5 border ${
                    item.isInternal
                      ? "bg-yellow-50/50 border-yellow-200"
                      : isCustomer
                        ? "bg-indigo-50/30 border-indigo-100 ml-4"
                        : "bg-white border-gray-200 shadow-sm mr-4"
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`flex items-center justify-center w-6 h-6 rounded-full text-white text-xs ${
                        item.isInternal ? "bg-yellow-500" : isCustomer ? "bg-indigo-500" : "bg-gray-600"
                      }`}>
                        {authorName.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-semibold text-sm text-gray-900">{authorName}</span>
                      {item.isInternal && (
                        <span className="flex items-center gap-1 rounded-md bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
                          <Lock className="w-3 h-3" /> Internal Note
                        </span>
                      )}
                      {isCustomer && (
                        <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800">
                          Customer
                        </span>
                      )}
                      {!item.isInternal && !isCustomer && (
                        <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                          {item.author?.role === 'SUPERVISOR' ? 'Supervisor' : 'Agent'}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500 font-medium">
                      {new Date(item.createdAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-gray-800 leading-relaxed">{item.body}</p>
                </div>
              );
            })}
          </div>

            {/* Reply Composer */}
            <div className="border-t border-gray-200 bg-white p-6 shrink-0">
              <div className="space-y-4">
                <textarea
                  rows={3}
                  placeholder="Type your reply here..."
                  className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none"
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                />

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                      checked={isInternal}
                      onChange={(e) => setIsInternal(e.target.checked)}
                    />
                    <Lock className="w-4 h-4 text-gray-500" />
                    Mark as Internal Note
                  </label>

                  <div className="flex gap-3">
                    <button
                      type="button"
                      disabled={submitting || isInternal}
                      onClick={() => handlePostReply('CUSTOMER')}
                      className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors shadow-sm"
                      title={isInternal ? "Customers cannot post internal notes" : "Simulate an incoming response from the customer"}
                    >
                      Customer Reply
                    </button>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => handlePostReply('AGENT')}
                      className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors shadow-sm"
                    >
                      Send Reply
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Sidebar (Metadata) */}
          <div className="w-80 bg-white border-l border-gray-200 p-6 overflow-y-auto shrink-0 flex flex-col gap-6">
            
            {/* Metadata Block */}
            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5"><User className="w-4 h-4" /> Requester</h4>
                <p className="text-sm font-medium text-gray-900">{liveTicket.requesterEmail}</p>
              </div>
              
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Tag className="w-4 h-4" /> Details</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Priority</span>
                    <span className="font-medium text-gray-900">{liveTicket.priority}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Category</span>
                    <span className="font-medium text-gray-900">{liveTicket.category}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Assignee</span>
                    <span className="font-medium text-gray-900">{liveTicket.primaryAssignee?.name || 'Unassigned'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Original Description */}
            <div className="border-t border-gray-100 pt-6">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Original Description</h4>
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                <p className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed">{liveTicket.description}</p>
              </div>
            </div>

            {/* Collaborators */}
            <div className="border-t border-gray-100 pt-6">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5"><Users className="w-4 h-4" /> Collaborators</h4>
              </div>
              
              <div className="space-y-2">
                {!liveTicket.collaborators || liveTicket.collaborators.length === 0 ? (
                  <p className="text-xs text-gray-500 italic">No collaborators</p>
                ) : (
                  liveTicket.collaborators.map((c: any) => (
                    <div key={c.userId} className="flex items-center justify-between group">
                      <span className="text-sm font-medium text-gray-700">{c.user?.name || c.userId}</span>
                      {canManageCollaborators && (
                        <button
                          onClick={() => handleRemoveCollaborator(c.userId)}
                          className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))
                )}
                
                {canManageCollaborators && availableAgents && availableAgents.length > 0 && (
                  <div className="pt-2">
                    <select
                      className="w-full text-xs rounded-md border border-gray-300 py-1.5 px-2 bg-white text-gray-700"
                      value=""
                      onChange={(e) => handleAddCollaborator(e.target.value)}
                    >
                      <option value="" disabled>+ Add Collaborator...</option>
                      {availableAgents.map((u: any) => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                {collabError && <p className="text-xs text-red-600 mt-1">{collabError}</p>}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
