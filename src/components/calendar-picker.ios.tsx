import { Picker, Text } from '@expo/ui/swift-ui';
import {
  disabled as disabledModifier,
  frame,
  pickerStyle,
  tag,
} from '@expo/ui/swift-ui/modifiers';
import type { ModifierConfig } from '@expo/ui/swift-ui/modifiers';
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
  const modifiers: ModifierConfig[] = [
    pickerStyle('menu'),
    frame({ maxWidth: Infinity, alignment: 'trailing' }),
  ];

  if (!enabled) {
    modifiers.push(disabledModifier(true));
  }

  return (
    <Picker
      selection={selectedCalendarId || noCalendarValue}
      onSelectionChange={(value) => {
        if (value != null) {
          onValueChange(String(value));
        }
      }}
      modifiers={modifiers}
      testID="calendar-picker">
      {calendars.length > 0 ? (
        calendars.map((calendar) => (
          <Text key={calendar.id} modifiers={[tag(calendar.id)]}>
            {calendar.title}
          </Text>
        ))
      ) : (
        <Text modifiers={[tag(noCalendarValue)]}>No calendars</Text>
      )}
    </Picker>
  );
}
