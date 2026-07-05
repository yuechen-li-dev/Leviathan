// Status badge shared by the bookings list, booking debug panel, and
// confirmation surface. Extracted from views.tsx (M1). Zero behavior change.

import { Badge } from "@/components/ui/badge";

export function StatusChip({ tone, label }: { tone: "confirmed" | "warning" | "danger" | "info" | "neutral"; label: string }) {
  const variant =
    tone === "danger"
      ? "destructive"
      : tone === "neutral"
        ? "outline"
        : tone === "warning"
          ? "secondary"
          : "default";

  return (
    <Badge className={`status-chip status-chip-${tone}`} variant={variant}>
      {label}
    </Badge>
  );
}
