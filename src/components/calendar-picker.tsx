import { Picker } from '@expo/ui';
import type * as Calendar from 'expo-calendar';

type CalendarPickerProps = {
  calendars: Calendar.ExpoCalendar[];
  enabled: boolean;
  noCalendarValue: string;
  selectedCalendarId: string;
  onValueChange: (calendarId: string) => void;
};

export function CalendarPicker({
  calendars,
  enabled,
  noCalendarValue,
  selectedCalendarId,
  onValueChange,
}: CalendarPickerProps) {
  return (
    <Picker
      selectedValue={selectedCalendarId || noCalendarValue}
      onValueChange={onValueChange}
      enabled={enabled}
      testID="calendar-picker">
      {calendars.length > 0 ? (
        calendars.map((calendar) => (
          <Picker.Item key={calendar.id} label={calendar.title} value={calendar.id} />
        ))
      ) : (
        <Picker.Item label="No calendars" value={noCalendarValue} />
      )}
    </Picker>
  );
}
