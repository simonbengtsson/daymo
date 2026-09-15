import { useMemo } from 'react';
import { includesCalendar, useCalendarSets } from '@/lib/calendar-sets';

export function useHiddenCalendarIds() {
  const { sets, activeId } = useCalendarSets();
  return useMemo(() => {
    const active = sets.find((set) => set.id === activeId)!;
    return { has: (id: string) => !includesCalendar(active, id) };
  }, [sets, activeId]);
}
