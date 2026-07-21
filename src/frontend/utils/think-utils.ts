const EXTENDED_THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"];

/**
 * Find a fallback thinking level: prefer exact match, then next lower available.
 */
export function findFallbackLevel(defaultLevel: string | null, availableLevels: string[]): string {
  if (!availableLevels.length) return "off";
  if (availableLevels.includes(defaultLevel ?? "")) return defaultLevel ?? "off";

  // Find next lower level
  for (let i = EXTENDED_THINKING_LEVELS.indexOf(defaultLevel ?? ""); i >= 0; i--) {
    const candidate = EXTENDED_THINKING_LEVELS[i];
    if (availableLevels.includes(candidate)) return candidate;
  }
  // Fallback to last available
  return availableLevels[availableLevels.length - 1];
}
