export function formatDateTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    const timeStr = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

    if (isToday) return timeStr;
    if (isYesterday) return `Yesterday ${timeStr}`;
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " + timeStr;
  } catch {
    return "";
  }
}
