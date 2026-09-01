import { Capacitor, registerPlugin } from "@capacitor/core";
import type { LifeOverviewItem } from "@fuyue/core";

export type DevicePermission = "not_determined" | "granted" | "denied" | "blocked" | "unavailable";
export interface NativeDeviceStatus {
  platform: "android";
  calendarRead: DevicePermission;
  calendarWrite: DevicePermission;
  health: DevicePermission;
}
export interface NativeCalendar {
  id: string;
  name: string;
  account: string;
  writable: boolean;
}
export interface NativeCalendarEventDraft {
  calendarId: string;
  title: string;
  startAt: number;
  endAt: number;
  location?: string;
  notes?: string;
  allDay?: boolean;
}

interface FuyueDevicePlugin {
  saveJsonDocument(input: { fileName: string; content: string }): Promise<{ saved: boolean; fileName?: string }>;
  getStatus(): Promise<NativeDeviceStatus>;
  requestCalendarAccess(input: { mode: "read" | "read_write" }): Promise<NativeDeviceStatus>;
  listCalendars(): Promise<{ calendars: NativeCalendar[] }>;
  readCalendar(input: { from: number; to: number }): Promise<{ events: Array<{ id: string; calendarId: string; title: string; startAtMs: number; endAtMs: number; location: string; allDay: boolean }> }>;
  openCreateEvent(input: Omit<NativeCalendarEventDraft, "calendarId">): Promise<{ opened: boolean }>;
  createCalendarEvent(input: NativeCalendarEventDraft): Promise<{ id: string }>;
  deleteCalendarEvent(input: { eventId: string }): Promise<{ deleted: boolean }>;
  openAppSettings(): Promise<{ opened: boolean }>;
}

const devicePlugin = (import.meta.hot?.data.fuyueDevicePlugin as FuyueDevicePlugin | undefined)
  ?? registerPlugin<FuyueDevicePlugin>("FuyueDevice");
if (import.meta.hot) import.meta.hot.data.fuyueDevicePlugin = devicePlugin;

export function hasAndroidDeviceBridge(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export function nativeDeviceStatus(): Promise<NativeDeviceStatus> { return devicePlugin.getStatus(); }
export function saveNativeJsonDocument(fileName: string, content: string): Promise<{ saved: boolean; fileName?: string }> { return devicePlugin.saveJsonDocument({ fileName, content }); }
export function requestNativeCalendarAccess(mode: "read" | "read_write"): Promise<NativeDeviceStatus> { return devicePlugin.requestCalendarAccess({ mode }); }
export async function listNativeCalendars(): Promise<NativeCalendar[]> { return (await devicePlugin.listCalendars()).calendars; }
export function openNativeCalendarComposer(input: Omit<NativeCalendarEventDraft, "calendarId">): Promise<{ opened: boolean }> { return devicePlugin.openCreateEvent(input); }
export function createNativeCalendarEvent(input: NativeCalendarEventDraft): Promise<{ id: string }> { return devicePlugin.createCalendarEvent(input); }
export function deleteNativeCalendarEvent(eventId: string): Promise<{ deleted: boolean }> { return devicePlugin.deleteCalendarEvent({ eventId }); }
export function openNativeAppSettings(): Promise<{ opened: boolean }> { return devicePlugin.openAppSettings(); }

export async function readNativeCalendar(days = 14, calendarIds?: string[]): Promise<LifeOverviewItem[]> {
  const status = await nativeDeviceStatus();
  if (status.calendarRead !== "granted") return [];
  const from = Date.now() - 86_400_000;
  const to = Date.now() + Math.max(1, Math.min(31, Math.trunc(days))) * 86_400_000;
  const { events } = await devicePlugin.readCalendar({ from, to });
  const selected = calendarIds ? new Set(calendarIds) : null;
  return events.filter((event) => selected === null || selected.has(event.calendarId)).map((event) => ({
    id: `android-calendar:${event.id}:${event.startAtMs}`,
    title: event.title,
    startAt: new Date(event.startAtMs).toISOString(),
    ...(event.endAtMs > event.startAtMs ? { endAt: new Date(event.endAtMs).toISOString() } : {}),
    ...(event.location ? { location: event.location } : {}),
    kind: event.allDay ? "系统日历 · 全天" : "系统日历",
    allDay: event.allDay,
    sourceId: event.calendarId,
  }));
}
