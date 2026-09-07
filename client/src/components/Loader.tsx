import { Loader2 } from "lucide-react";

export default function Loader({ text = "Loading..." }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 space-y-3">
      <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
      <p className="text-sm font-medium text-gray-500">{text}</p>
    </div>
  );
}
