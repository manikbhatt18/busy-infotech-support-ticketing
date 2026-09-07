import React from 'react';
import { X, CheckCircle2, AlertCircle } from "lucide-react";

export type BulkResult = {
  ticketId: string;
  success: boolean;
  reason?: string;
};

interface BulkResultsModalProps {
  isOpen: boolean;
  onClose: () => void;
  results: BulkResult[];
}

export default function BulkResultsModal({ isOpen, onClose, results }: BulkResultsModalProps) {
  if (!isOpen) return null;

  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.length - successCount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
        <div className="border-b border-gray-200 px-6 py-4 flex justify-between items-center bg-white rounded-t-2xl">
          <h2 className="text-lg font-semibold text-gray-900">Bulk Action Results</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-md hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6">
          <div className="mb-4 flex gap-4">
            <div className="rounded-lg bg-green-50 px-4 py-3 text-green-800 border border-green-200 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <span><strong className="font-semibold">{successCount}</strong> Succeeded</span>
            </div>
            {failureCount > 0 && (
              <div className="rounded-lg bg-red-50 px-4 py-3 text-red-800 border border-red-200 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-600" />
                <span><strong className="font-semibold">{failureCount}</strong> Failed</span>
              </div>
            )}
          </div>

          <div className="overflow-y-auto max-h-[400px] border border-gray-200 rounded-lg">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ticket ID</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {results.map((result) => (
                  <tr key={result.ticketId}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-mono">
                      {result.ticketId.slice(0, 8)}...
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {result.success ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full font-medium bg-green-100 text-green-800">
                          Success
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full font-medium bg-red-100 text-red-800">
                          Failed
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate" title={result.reason}>
                      {result.reason || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="border-t border-gray-200 bg-gray-50 p-4 rounded-b-2xl flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg bg-indigo-600 px-6 py-2 text-sm font-medium text-white hover:bg-indigo-500 shadow-sm transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
