"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";

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

  // Live ticket state (updated after status transitions)
  const [liveTicket, setLiveTicket] = useState<any | null>(null);

  useEffect(() => {
    if (isOpen && ticket) {
      setLiveTicket(ticket);
      fetchReplies(ticket.id);
      setReplyBody("");
      setIsInternal(false);
      setStatusError("");
    }
  }, [isOpen, ticket]);

  const fetchReplies = async (ticketId: string) => {
    setLoadingReplies(true);
    setError("");
    try {
      const data = await apiFetch(`/tickets/${ticketId}/replies`);
      setReplies(data);
    } catch (err: any) {
      setError(err.message || "Failed to load replies");
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black bg-opacity-50 p-4">
      <div className="flex h-[90vh] w-full max-w-3xl flex-col rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b p-6 pb-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-gray-900 truncate">{liveTicket.subject}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
              <span>Requester: <span className="font-medium text-gray-900">{liveTicket.requesterEmail}</span></span>
              <span>|</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusColors[liveTicket.status] ?? 'bg-gray-100 text-gray-700'}`}>
                {liveTicket.status}
              </span>
              <span>|</span>
              <span>Priority: <span className="font-medium text-gray-900">{liveTicket.priority}</span></span>
              {slaDisplay && (
                <>
                  <span>|</span>
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${slaDisplay.color}`}>
                    {slaDisplay.label}
                  </span>
                </>
              )}
            </div>
          </div>
          <button onClick={onClose} className="ml-4 text-gray-400 hover:text-gray-600 flex-shrink-0">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Goal 4: Status Transition Controls */}
        {legalTransitions.length > 0 && (
          <div className="border-b bg-gray-50 px-6 py-3 flex items-center gap-3 flex-wrap">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Move to:</span>
            {legalTransitions.map((status) => (
              <button
                key={status}
                disabled={statusUpdating}
                onClick={() => handleStatusTransition(status)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-50 ${
                  status === 'CLOSED'
                    ? 'border-gray-400 bg-white text-gray-600 hover:bg-gray-100'
                    : status === 'RESOLVED'
                    ? 'border-green-400 bg-white text-green-700 hover:bg-green-50'
                    : status === 'PENDING'
                    ? 'border-yellow-400 bg-white text-yellow-700 hover:bg-yellow-50'
                    : 'border-blue-400 bg-white text-blue-700 hover:bg-blue-50'
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

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto bg-gray-50 p-6 text-gray-900">
          <div className="mb-6 rounded-lg bg-white p-4 shadow-sm border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Original Description</h3>
            <p className="whitespace-pre-wrap text-sm text-gray-800">{liveTicket.description}</p>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 border-b pb-2">Timeline & Replies</h3>

            {loadingReplies && <p className="text-sm text-gray-500">Loading replies...</p>}
            {error && <p className="text-sm text-red-500">{error}</p>}

            {replies.length === 0 && !loadingReplies && !error && (
              <p className="text-sm text-gray-500 italic">No replies yet.</p>
            )}

            {replies.map((reply) => {
              const isCustomer = reply.authorType === 'CUSTOMER';
              // Decision 10: for customer replies, fall back to ticket.requesterEmail
              const authorName = isCustomer
                ? (liveTicket.requesterEmail || "Customer")
                : (reply.author?.name || "Unknown Agent");

              return (
                <div
                  key={reply.id}
                  className={`rounded-lg p-4 border ${
                    reply.isInternal
                      ? "bg-yellow-50 border-yellow-200"
                      : isCustomer
                        ? "bg-green-50 border-green-200"
                        : "bg-white border-blue-100 shadow-sm"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{authorName}</span>
                      {reply.isInternal && (
                        <span className="rounded-full bg-yellow-200 px-2 py-0.5 text-xs font-medium text-yellow-800">
                          Internal Note
                        </span>
                      )}
                      {isCustomer && (
                        <span className="rounded-full bg-green-200 px-2 py-0.5 text-xs font-medium text-green-800">
                          Customer
                        </span>
                      )}
                      {!reply.isInternal && !isCustomer && (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                          Agent Reply
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500">
                      {new Date(reply.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-gray-800">{reply.body}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Reply Composer */}
        <div className="border-t bg-white p-6">
          <div className="space-y-4 text-black">
            <div>
              <textarea
                rows={3}
                placeholder="Type your reply here..."
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  checked={isInternal}
                  onChange={(e) => setIsInternal(e.target.checked)}
                />
                Mark as Internal Note (hidden from customer)
              </label>

              <div className="flex gap-3">
                {/* Secondary/Outlined — Simulate Customer Reply */}
                <button
                  type="button"
                  disabled={submitting || isInternal}
                  onClick={() => handlePostReply('CUSTOMER')}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  title={isInternal ? "Customers cannot post internal notes" : "Simulate an incoming response from the customer"}
                >
                  Simulate Customer Reply
                </button>

                {/* Primary — Post Agent Reply */}
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handlePostReply('AGENT')}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  Post Reply
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
