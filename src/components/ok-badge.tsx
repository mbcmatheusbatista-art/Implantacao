import { Check } from "lucide-react";

export function OkBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-600 px-3 py-1 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:bg-green-700">
      <Check className="h-3 w-3" />
      OK
    </span>
  );
}
