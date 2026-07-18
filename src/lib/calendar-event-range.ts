export type CalendarEventDateRange = {
  startDate: string | Date;
  endDate: string | Date;
  allDay: boolean;
};

export type DayRange = {
  startDate: Date;
  endDateExclusive: Date;
};

export type AllDayEditorRange = {
  startDate: Date;
  endDate: Date;
};

/**
 * Calendar APIs store event ranges with an exclusive end. The event editor uses
 * an inclusive end day because that is what people expect to select and read.
 */
export function getAllDayEditorRange(startDate: string | Date, endDateExclusive: string | Date): AllDayEditorRange {
  const start = startOfDay(toDate(startDate));
  const exclusiveEnd = getValidExclusiveEnd(start, startOfDay(toDate(endDateExclusive)));

  return {
    startDate: start,
    endDate: addDays(exclusiveEnd, -1),
  };
}

export function getAllDayCalendarRange(startDate: Date, inclusiveEndDate: Date): DayRange {
  const start = startOfDay(startDate);
  const inclusiveEnd = maxDate(start, startOfDay(inclusiveEndDate));

  return {
    startDate: start,
    endDateExclusive: addDays(inclusiveEnd, 1),
  };
}

/** Returns the local calendar days touched by an event as a half-open range. */
export function getEventDayRange(event: CalendarEventDateRange): DayRange {
  const eventStart = toDate(event.startDate);
  const eventEnd = toDate(event.endDate);
  const start = startOfDay(eventStart);

  if (event.allDay) {
    return {
      startDate: start,
      endDateExclusive: getValidExclusiveEnd(start, startOfDay(eventEnd)),
    };
  }

  if (eventEnd <= eventStart) {
    return { startDate: start, endDateExclusive: addDays(start, 1) };
  }

  const endDay = startOfDay(eventEnd);
  const endDateExclusive = isStartOfDay(eventEnd) ? endDay : addDays(endDay, 1);

  return {
    startDate: start,
    endDateExclusive: getValidExclusiveEnd(start, endDateExclusive),
  };
}

export function isMultiDayRange(range: DayRange) {
  return addDays(range.startDate, 1) < range.endDateExclusive;
}

export function startOfDay(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

export function toDate(date: string | Date) {
  return new Date(date);
}

function getValidExclusiveEnd(startDate: Date, endDate: Date) {
  return endDate > startDate ? endDate : addDays(startDate, 1);
}

function isStartOfDay(date: Date) {
  return date.getTime() === startOfDay(date).getTime();
}

function maxDate(first: Date, second: Date) {
  return first > second ? first : second;
}
