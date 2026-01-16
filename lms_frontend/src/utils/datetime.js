function pad2(n) {
  return String(n).padStart(2, "0");
}

// PUBLIC_INTERFACE
/**
 * Convert an ISO date-time string to an <input type="datetime-local"> value in local time.
 *
 * @param {string | null | undefined} iso
 * @returns {string} e.g. "2026-01-16T13:45"
 */
export function toDatetimeLocalValue(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";

  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mi = pad2(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

// PUBLIC_INTERFACE
/**
 * Convert an <input type="datetime-local"> value (local time) into an ISO string.
 *
 * @param {string | null | undefined} value
 * @returns {string | null}
 */
export function toIsoFromDatetimeLocal(value) {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) return null;

  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

// PUBLIC_INTERFACE
/**
 * Format an ISO timestamp in the user's locale for display.
 *
 * @param {string | null | undefined} iso
 * @returns {string}
 */
export function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}
