export const CALENDAR_READ_SOURCES_KEY = "fuyue-public-calendar-read-sources";
export const CALENDAR_WRITE_TARGET_KEY = "fuyue-public-calendar-write-target";

export function readCalendarSourceIds(): string[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(CALENDAR_READ_SOURCES_KEY) || "[]") as unknown;
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
  } catch {
    return [];
  }
}

export function saveCalendarSourceIds(ids: string[]) {
  window.localStorage.setItem(CALENDAR_READ_SOURCES_KEY, JSON.stringify([...new Set(ids)]));
}

export function readCalendarWriteTarget(): string {
  return window.localStorage.getItem(CALENDAR_WRITE_TARGET_KEY) || "";
}

export function saveCalendarWriteTarget(id: string) {
  if (id) window.localStorage.setItem(CALENDAR_WRITE_TARGET_KEY, id);
  else window.localStorage.removeItem(CALENDAR_WRITE_TARGET_KEY);
}
