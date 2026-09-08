import { File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';

let hiddenCalendarIds: ReadonlySet<string> | undefined;
const listeners = new Set<() => void>();

function preferencesFile() {
  return new File(Paths.document, 'calendar-visibility.json');
}

function getSnapshot(): ReadonlySet<string> {
  if (hiddenCalendarIds == null) {
    hiddenCalendarIds = new Set();
    try {
      const file = preferencesFile();
      if (file.exists) {
        const saved: unknown = JSON.parse(file.textSync());
        if (!Array.isArray(saved) || !saved.every((id) => typeof id === 'string')) {
          throw new Error('Invalid calendar visibility preferences');
        }
        hiddenCalendarIds = new Set(saved);
      }
    } catch (error) {
      console.warn('Failed to load calendar visibility', error);
    }
  }
  return hiddenCalendarIds;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useHiddenCalendarIds() {
  return useSyncExternalStore(subscribe, getSnapshot);
}

export function setCalendarVisible(calendarId: string, visible: boolean) {
  const next = new Set(getSnapshot());
  if (visible) {
    next.delete(calendarId);
  } else {
    next.add(calendarId);
  }

  // Save before notifying subscribers so failed writes leave the selection unchanged.
  preferencesFile().write(JSON.stringify([...next]));
  hiddenCalendarIds = next;
  listeners.forEach((listener) => listener());
}
