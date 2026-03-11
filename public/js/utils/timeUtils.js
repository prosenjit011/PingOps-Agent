/**
 * Format ISO timestamp to short time string for log display
 */
function formatTime(ts) {
  if (!ts) return '--:--:--';
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-AU', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
      + '.' + String(d.getMilliseconds()).padStart(3, '0');
  } catch {
    return ts;
  }
}

/**
 * Format ISO timestamp to date+time string
 */
function formatDateTime(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return d.toLocaleString('en-AU', { hour12: false });
  } catch {
    return ts;
  }
}

/**
 * Convert a Date to datetime-local input format
 */
function toDatetimeLocal(date) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

/**
 * Convert datetime-local value to ISO string
 */
function datetimeLocalToISO(val) {
  if (!val) return '';
  return new Date(val).toISOString();
}
