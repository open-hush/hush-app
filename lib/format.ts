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

/**
 * Format an RFID UID (lowercase hex, no separators) for display: uppercased and
 * grouped into 2-byte chunks, e.g. `04a1b2c3d4e5` → `04A1 B2C3 D4E5`.
 */
export function formatCardUid(uid: string): string {
  return (uid.match(/.{1,4}/g) ?? [uid]).join(" ").toUpperCase();
}
