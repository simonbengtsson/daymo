import { File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';

export type CalendarSet = {
  id: string;
  name: string;
  calendarIds: string[] | null;
  excludedCalendarIds?: string[];
};
type CalendarSets = { sets: CalendarSet[]; activeId: string };
let snapshot: CalendarSets | undefined;
const listeners = new Set<() => void>();
const preferencesFile = () => new File(Paths.document, 'calendar-sets.json');

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((id) => typeof id === 'string');
}

function getSnapshot(): CalendarSets {
  if (snapshot) return snapshot;
  snapshot = { sets: [{ id: 'main', name: 'Main Calendar Set', calendarIds: null }], activeId: 'main' };
  try {
    const file = preferencesFile();
    if (file.exists) {
      const saved = JSON.parse(file.textSync());
      if (!Array.isArray(saved.sets) || saved.sets.length === 0 || !saved.sets.every((set: CalendarSet) =>
        set && typeof set.id === 'string' && typeof set.name === 'string' && set.name.trim() &&
        (set.calendarIds === null || isStringArray(set.calendarIds)) &&
        (set.excludedCalendarIds === undefined || isStringArray(set.excludedCalendarIds))) ||
        !saved.sets.some((set: CalendarSet) => set.id === saved.activeId)) {
        throw new Error('Invalid calendar sets');
      }
      snapshot = saved;
    } else {
      const legacy = new File(Paths.document, 'calendar-visibility.json');
      if (legacy.exists) {
        const hidden: unknown = JSON.parse(legacy.textSync());
        if (isStringArray(hidden)) snapshot.sets[0].excludedCalendarIds = hidden;
      }
    }
  } catch (error) {
    console.warn('Failed to load calendar sets', error);
  }
  return snapshot!;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useCalendarSets() {
  return useSyncExternalStore(subscribe, getSnapshot);
}

function persist(next: CalendarSets) {
  preferencesFile().write(JSON.stringify(next));
  snapshot = next;
  listeners.forEach((listener) => listener());
}

export function includesCalendar(set: CalendarSet, id: string) {
  return set.calendarIds === null ? !set.excludedCalendarIds?.includes(id) : set.calendarIds.includes(id);
}

export function saveCalendarSet(set: CalendarSet) {
  const name = set.name.trim();
  if (!name) throw new Error('A calendar set name is required.');
  const current = getSnapshot();
  const exists = current.sets.some((item) => item.id === set.id);
  const saved = { ...set, name };
  persist({ sets: exists ? current.sets.map((item) => item.id === set.id ? saved : item) : [...current.sets, saved], activeId: exists ? current.activeId : set.id });
}

export function selectCalendarSet(id: string) {
  const current = getSnapshot();
  if (current.sets.some((set) => set.id === id)) persist({ ...current, activeId: id });
}
