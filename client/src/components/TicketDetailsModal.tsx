"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";

interface TicketDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticket: any | null;
  currentUser: any;
}

export default function TicketDetailsModal({ isOpen, onClose, ticket, currentUser }: TicketDetailsModalProps) {
  const [replies, setReplies] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  const [replyBody, setReplyBody] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && ticket) {
      fetchReplies();
      setReplyBody("");
      setIsInternal(false);
    }
  }, [isOpen, ticket]);

  const fetchReplies = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch(`/tickets/${ticket.id}/replies`);
      setReplies(data);
    } catch (err: any) {
      setError(err.message || "Failed to load replies");
    } finally {
      setLoading(false);
    }
  };

  const handlePostReply = async (authorType: 'AGENT' | 'CUSTOMER') => {
    if (!replyBody.trim()) return;
    
    // Safety check matching Zod schema
    if (authorType === 'CUSTOMER' && isInternal) {
      alert("A customer reply can never be an internal note");
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch(`/tickets/${ticket.id}/replies`, {
        method: "POST",
        body: JSON.stringify({
          body: replyBody,
          isInternal,
          authorType,
        }),
      });
      setReplyBody("");
      setIsInternal(false);
      fetchReplies();
    } catch (err: any) {
      alert(err.message || "Failed to post reply");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !ticket) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black bg-opacity-50 p-4">
      <div className="flex h-[90vh] w-full max-w-3xl flex-col rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b p-6 pb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{ticket.subject}</h2>
            <p className="mt-1 text-sm text-gray-500">
              Requester: <span className="font-medium text-gray-900">{ticket.requesterEmail}</span> | 
              Status: <span className="font-medium text-gray-900">{ticket.status}</span> | 
              Priority: <span className="font-medium text-gray-900">{ticket.priority}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto bg-gray-50 p-6 text-gray-900">
          <div className="mb-6 rounded-lg bg-white p-4 shadow-sm border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Original Description</h3>
            <p className="whitespace-pre-wrap text-sm text-gray-800">{ticket.description}</p>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 border-b pb-2">Timeline & Replies</h3>
            
            {loading && <p className="text-sm text-gray-500">Loading replies...</p>}
            {error && <p className="text-sm text-red-500">{error}</p>}
            
            {replies.length === 0 && !loading && !error && (
              <p className="text-sm text-gray-500 italic">No replies yet.</p>
            )}

            {replies.map((reply) => {
              const isCustomer = reply.authorType === 'CUSTOMER';
              // Fallback display for Customer replies: use ticket.requesterEmail instead of a missing author.name
              const authorName = isCustomer ? (ticket.requesterEmail || "Customer") : (reply.author?.name || "Unknown Agent");
              
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
                      <span className="font-semibold text-sm">
                        {authorName}
                      </span>
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
                {/* Secondary/Outlined Action for Customer Simulation */}
                <button
                  type="button"
                  disabled={submitting || isInternal}
                  onClick={() => handlePostReply('CUSTOMER')}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  title={isInternal ? "Customers cannot post internal notes" : "Simulate an incoming response from the customer"}
                >
                  Simulate Customer Reply
                </button>
                
                {/* Primary Action for Agent Reply */}
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
