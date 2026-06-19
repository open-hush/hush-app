/**
 * Format a device's `lastSeenAt` for display. Returns a localized date-time, a
 * "never" hint when the device has not reported in, or a fallback for an
 * unparseable value.
 */
export function formatLastSeen(iso?: string): string {
  if (!iso) {
    return "Never seen";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }
  return date.toLocaleString();
}
