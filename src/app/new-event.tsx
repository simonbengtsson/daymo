import CheckIcon from '@expo/material-symbols/check.xml';
import CloseIcon from '@expo/material-symbols/close.xml';
import { Button as UiButton, FieldGroup, Host, RNHostView, Row, Spacer, Switch, TextInput as UiTextInput, Text as UiText } from '@expo/ui';
import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import * as Calendar from 'expo-calendar';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  Platform,
  type TextInputProps as NativeTextInputProps,
  View,
} from 'react-native';

import { AppText } from '@/components/app-text';
import { CalendarPicker } from '@/components/calendar-picker';
import spacing from '@/components/spacer';
import { usePostHog } from 'posthog-react-native';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { getAllDayCalendarRange, getAllDayEditorRange, startOfDay, toDate } from '@/lib/calendar-event-range';

export default function NewEventModal() {
  const posthog = usePostHog();
  const theme = useTheme();
  const {
    allDay: allDayParam,
    eventId: eventIdParam,
    occurrenceStartDate: occurrenceStartDateParam,
    startDate: startDateParam,
  } = useLocalSearchParams<{
    allDay?: string | string[];
    eventId?: string | string[];
    occurrenceStartDate?: string | string[];
    startDate?: string | string[];
  }>();
  const eventId = getFirstParam(eventIdParam);
  const occurrenceStartDate = getFirstParam(occurrenceStartDateParam);
  const initialStartDate = parseDayParam(getFirstParam(startDateParam));
  const isEditMode = Boolean(eventId);
  const startsAsAllDay = !isEditMode && getFirstParam(allDayParam) === 'true' && initialStartDate != null;
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [allDay, setAllDay] = useState(startsAsAllDay);
  const [startDate, setStartDate] = useState(() => (startsAsAllDay ? startOfDay(initialStartDate) : roundToNextHour(new Date())));
  const [endDate, setEndDate] = useState(() => (startsAsAllDay ? startOfDay(initialStartDate) : addHours(roundToNextHour(new Date()), 1)));
  const [calendars, setCalendars] = useState<Calendar.ExpoCalendar[]>([]);
  const [selectedCalendarId, setSelectedCalendarId] = useState('');
  const [editingEvent, setEditingEvent] = useState<Calendar.ExpoCalendarEvent | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoadingEvent, setIsLoadingEvent] = useState(false);

  const selectedCalendar = calendars.find((calendar) => calendar.id === selectedCalendarId);
  const dateRangeErrorMessage = !allDay && endDate <= startDate
    ? 'End time must be after start time.'
    : '';
  const displayedErrorMessage = dateRangeErrorMessage || errorMessage;
  const canSave =
    title.trim().length > 0 &&
    isWritableCalendar(selectedCalendar) &&
    dateRangeErrorMessage.length === 0 &&
    !isSaving &&
    !isDeleting &&
    !isLoadingEvent;
  const canDelete =
    isEditMode &&
    editingEvent != null &&
    isWritableCalendar(selectedCalendar) &&
    !isSaving &&
    !isDeleting &&
    !isLoadingEvent;
  const pickerDisplay = Platform.OS === 'ios' ? 'compact' : 'default';

  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }

    let isMounted = true;

    async function loadCalendars() {
      try {
        const permission = await Calendar.getCalendarPermissions();

        if (!isMounted) {
          return;
        }

        if (!permission.granted) {
          setErrorMessage('Calendar access is required to choose a calendar.');
          return;
        }

        const deviceCalendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);

        if (!isMounted) {
          return;
        }

        const visibleCalendars = isEditMode
          ? deviceCalendars
          : deviceCalendars.filter(isWritableCalendar);
        setCalendars(visibleCalendars);

        setSelectedCalendarId((currentCalendarId) => {
          if (visibleCalendars.some((calendar) => calendar.id === currentCalendarId)) {
            return currentCalendarId;
          }

          return getDefaultCalendarId(visibleCalendars);
        });
      } catch (error) {
        if (!isMounted) {
          return;
        }

        console.warn('Failed to load calendars', error);
        setErrorMessage('Could not load your calendars.');
      }
    }

    loadCalendars();

    return () => {
      isMounted = false;
    };
  }, [isEditMode]);

  useEffect(() => {
    if (!eventId || Platform.OS === 'web') {
      return;
    }

    let isMounted = true;
    const eventIdToLoad = eventId;

    async function loadEvent() {
      setIsLoadingEvent(true);

      try {
        const recurringEvent = await Calendar.ExpoCalendarEvent.get(eventIdToLoad);
        const instanceStartDate = parseDateParam(occurrenceStartDate);
        const event =
          recurringEvent.recurrenceRule && instanceStartDate
            ? recurringEvent.getOccurrenceSync({ instanceStartDate })
            : recurringEvent;

        if (!isMounted) {
          return;
        }

        setEditingEvent(event);
        setTitle(event.title);
        setLocation(event.location ?? '');
        setAllDay(event.allDay);
        if (event.allDay) {
          const editorRange = getAllDayEditorRange(event.startDate, event.endDate);
          setStartDate(editorRange.startDate);
          setEndDate(editorRange.endDate);
        } else {
          setStartDate(toDate(event.startDate));
          setEndDate(toDate(event.endDate));
        }
        setSelectedCalendarId(event.calendarId);
        setErrorMessage('');
      } catch (error) {
        if (!isMounted) {
          return;
        }

        console.warn('Failed to load event', error);
        setErrorMessage('Could not load this event.');
      } finally {
        if (isMounted) {
          setIsLoadingEvent(false);
        }
      }
    }

    loadEvent();

    return () => {
      isMounted = false;
    };
  }, [eventId, occurrenceStartDate]);

  function updateStartDate(nextStartDate: Date) {
    if (allDay) {
      const nextAllDayStartDate = startOfDay(nextStartDate);
      setStartDate(nextAllDayStartDate);

      if (nextAllDayStartDate > startOfDay(endDate)) {
        setEndDate(nextAllDayStartDate);
      }

      return;
    }

    setStartDate(nextStartDate);

    if (nextStartDate >= endDate) {
      setEndDate(addHours(nextStartDate, 1));
    }
  }

  function updateEndDate(nextEndDate: Date) {
    setEndDate(allDay ? startOfDay(nextEndDate) : nextEndDate);
  }

  function updateAllDay(nextValue: boolean) {
    setAllDay(nextValue);

    if (nextValue) {
      const start = startOfDay(startDate);
      setStartDate(start);
      setEndDate(start);
      return;
    }

    const timedStartDate = startOfDay(startDate);
    const timedEndDate = startOfDay(endDate);
    timedStartDate.setHours(defaultTimedEventStartHour, 0, 0, 0);
    timedEndDate.setHours(defaultTimedEventStartHour, 0, 0, 0);

    setStartDate(timedStartDate);
    setEndDate(timedEndDate > timedStartDate ? timedEndDate : addHours(timedStartDate, 1));
  }

  async function saveEvent() {
    if (!canSave) {
      return;
    }

    if (Platform.OS === 'web') {
      setErrorMessage('Calendar creation is only available on a device.');
      return;
    }

    setIsSaving(true);
    setErrorMessage('');

    try {
      let selectedCalendar = calendars.find((calendar) => calendar.id === selectedCalendarId);

      if (!selectedCalendar) {
        const permission = await Calendar.getCalendarPermissions();

        if (!permission.granted) {
          setErrorMessage('Calendar access is required to save this event.');
          return;
        }

        const deviceCalendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
        const writableCalendars = deviceCalendars.filter(isWritableCalendar);
        setCalendars(writableCalendars);
        const fallbackCalendarId = selectedCalendarId || getDefaultCalendarId(writableCalendars);
        selectedCalendar = writableCalendars.find((calendar) => calendar.id === fallbackCalendarId);
        setSelectedCalendarId(fallbackCalendarId);
      }

      if (!selectedCalendar || !isWritableCalendar(selectedCalendar)) {
        setErrorMessage('No writable calendars are available on this device.');
        return;
      }

      const allDayCalendarRange = allDay ? getAllDayCalendarRange(startDate, endDate) : null;
      // Keep recurrenceRule out of this partial update so the existing series
      // configuration is preserved while editing an occurrence.
      const eventDetails = {
        title: title.trim(),
        location: location.trim() || undefined,
        startDate: allDayCalendarRange?.startDate ?? startDate,
        endDate: allDayCalendarRange?.endDateExclusive ?? endDate,
        allDay,
      };

      if (editingEvent) {
        await editingEvent.update(eventDetails);
        posthog.capture('event_updated', {
          all_day: allDay,
          has_location: Boolean(eventDetails.location),
        });
      } else {
        await selectedCalendar.createEvent(eventDetails);
        posthog.capture('event_created', {
          all_day: allDay,
          has_location: Boolean(eventDetails.location),
        });
      }

      router.back();
    } catch (error) {
      console.warn('Failed to save event', error);
      posthog.capture('event_save_failed', { is_edit_mode: isEditMode });
      setErrorMessage('Could not save this event.');
    } finally {
      setIsSaving(false);
    }
  }

  function confirmDeleteEvent() {
    if (!canDelete) {
      return;
    }

    Alert.alert(
      'Delete event?',
      'This event will be removed from your calendar.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: deleteEvent,
        },
      ]
    );
  }

  async function deleteEvent() {
    if (!editingEvent || Platform.OS === 'web') {
      return;
    }

    setIsDeleting(true);
    setErrorMessage('');

    try {
      await editingEvent.delete();
      posthog.capture('event_deleted');
      router.back();
    } catch (error) {
      console.warn('Failed to delete event', error);
      posthog.capture('event_delete_failed');
      setErrorMessage('Could not delete this event.');
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerTransparent: Platform.OS !== 'android',
          title: isEditMode ? 'Edit' : 'New',
        }}
      />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button
          accessibilityLabel="Dismiss"
          icon={process.env.EXPO_OS === 'ios' ? 'xmark' : CloseIcon}
          onPress={() => router.back()}
        />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          accessibilityLabel="Save"
          disabled={!canSave}
          icon={process.env.EXPO_OS === 'ios' ? 'checkmark' : CheckIcon}
          onPress={saveEvent}
          tintColor={theme.primary}
          variant="prominent"
        />
      </Stack.Toolbar>
      <ThemedView style={{ flex: 1, backgroundColor: theme.background }}>
        <Host style={{ flex: 1, paddingHorizontal: spacing.double, paddingBottom: spacing.double }}>
          <FieldGroup key={editingEvent?.id ?? 'new-event'}>
            <FieldGroup.Section>
              <EventTextInput
                autoFocus={!isEditMode}
                autoCapitalize="sentences"
                value={title}
                onChangeText={setTitle}
                placeholder="Title"
                placeholderTextColor={theme.textSecondary}
                returnKeyType="next"
              />
              <EventTextInput
                autoCapitalize="words"
                value={location}
                onChangeText={setLocation}
                placeholder="Place or video call"
                placeholderTextColor={theme.textSecondary}
                returnKeyType="done"
              />
            </FieldGroup.Section>

            <FieldGroup.Section>
              <Switch label="All-day" value={allDay} onValueChange={updateAllDay} />
              <DateTimeRow
                label="Starts"
                date={startDate}
                allDay={allDay}
                display={pickerDisplay}
                minimumDate={undefined}
                onDateChange={updateStartDate}
                accentColor={theme.primary}
              />
              <DateTimeRow
                label="Ends"
                date={endDate}
                allDay={allDay}
                display={pickerDisplay}
                minimumDate={startDate}
                onDateChange={updateEndDate}
                accentColor={theme.primary}
              />
              {displayedErrorMessage ? (
                <FieldGroup.SectionFooter>
                  <AppText variant="footnote" themeColor="textDestructive">
                    {displayedErrorMessage}
                  </AppText>
                </FieldGroup.SectionFooter>
              ) : null}
            </FieldGroup.Section>

            <FieldGroup.Section>
              <Row alignment="center" spacing={0}>
                <UiText>Calendar</UiText>
                {Platform.OS === 'ios' ? <Spacer size={spacing.base} /> : <Spacer flexible />}
                <CalendarPicker
                  calendars={calendars}
                  enabled={!isEditMode && calendars.length > 0}
                  noCalendarValue={noCalendarValue}
                  selectedCalendarId={selectedCalendarId}
                  onValueChange={setSelectedCalendarId}
                />
              </Row>
            </FieldGroup.Section>

            {isEditMode ? (
              <FieldGroup.Section>
                <UiButton
                  disabled={!canDelete}
                  label={isDeleting ? undefined : 'Delete Event'}
                  onPress={confirmDeleteEvent}
                  variant="text">
                  <Row alignment="center" spacing={0}>
                    <Spacer flexible />
                    <UiText textStyle={{ color: theme.textDestructive, fontSize: 17, fontWeight: '400' }}>
                      {isDeleting ? 'Deleting...' : 'Delete Event'}
                    </UiText>
                    <Spacer flexible />
                  </Row>
                </UiButton>
              </FieldGroup.Section>
            ) : null}
          </FieldGroup>
        </Host>
      </ThemedView>
    </>
  );
}

type EventTextInputProps = Pick<
  NativeTextInputProps,
  | 'autoCapitalize'
  | 'autoFocus'
  | 'onChangeText'
  | 'placeholder'
  | 'placeholderTextColor'
  | 'returnKeyType'
  | 'value'
>;

function EventTextInput({
  autoCapitalize,
  autoFocus,
  onChangeText,
  placeholder,
  placeholderTextColor,
  returnKeyType,
  value,
}: EventTextInputProps) {
  return (
    <UiTextInput
      autoFocus={autoFocus}
      autoCapitalize={autoCapitalize}
      defaultValue={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={placeholderTextColor}
      returnKeyType={returnKeyType}
    />
  );
}

function DateTimeRow({
  label,
  date,
  allDay,
  display,
  minimumDate,
  accentColor,
  onDateChange,
}: {
  label: string;
  date: Date;
  allDay: boolean;
  display: 'compact' | 'default';
  minimumDate?: Date;
  accentColor: string;
  onDateChange: (date: Date) => void;
}) {
  const [activeAndroidPicker, setActiveAndroidPicker] = useState<'date' | 'time' | null>(null);
  const dateMinimumDate = minimumDate ? startOfDay(minimumDate) : undefined;

  if (Platform.OS === 'web') {
    return (
      <View style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }}>
        <AppText variant="body">{label}</AppText>
        <View style={{ alignItems: 'center', flexDirection: 'row' }}>
          <AppText variant="body">{formatDate(date)}</AppText>
          {!allDay ? (
            <AppText variant="body">{formatTime(date)}</AppText>
          ) : null}
        </View>
      </View>
    );
  }

  if (Platform.OS === 'android') {
    const selectAndroidDateTime = (selectedDate: Date) => {
      onDateChange(
        activeAndroidPicker === 'date'
          ? mergeDateParts(date, selectedDate)
          : mergeTimeParts(date, selectedDate)
      );
      setActiveAndroidPicker(null);
    };

    return (
      <Row alignment="center" spacing={0}>
        <UiText>{label}</UiText>
        <Spacer flexible />
        <UiButton onPress={() => setActiveAndroidPicker('date')} variant="text">
          <UiText textStyle={{ color: accentColor }}>{formatDate(date)}</UiText>
        </UiButton>
        {!allDay ? (
          <UiButton onPress={() => setActiveAndroidPicker('time')} variant="text">
            <UiText textStyle={{ color: accentColor }}>{formatTime(date)}</UiText>
          </UiButton>
        ) : null}
        {activeAndroidPicker ? (
          <DateTimePicker
            value={date}
            onValueChange={(_, selectedDate) => selectAndroidDateTime(selectedDate)}
            onDismiss={() => setActiveAndroidPicker(null)}
            mode={activeAndroidPicker}
            minimumDate={activeAndroidPicker === 'date' ? dateMinimumDate : undefined}
            display="default"
            accentColor={accentColor}
            presentation="dialog"
          />
        ) : null}
      </Row>
    );
  }

  return (
    <Row alignment="center" spacing={0}>
      <UiText>{label}</UiText>
      <Spacer flexible />
      <RNHostView matchContents>
        <DateTimePicker
          value={date}
          onValueChange={(_, selectedDate) => onDateChange(selectedDate)}
          mode="date"
          minimumDate={dateMinimumDate}
          display={display}
          accentColor={accentColor}
          style={{ width: 124 }}
        />
      </RNHostView>
      {!allDay ? (
        <>
          <Spacer size={4} />
          <RNHostView matchContents>
            <DateTimePicker
              value={date}
              onValueChange={(_, selectedDate) => onDateChange(selectedDate)}
              mode="time"
              display={display}
              accentColor={accentColor}
              style={{ width: 72 }}
            />
          </RNHostView>
        </>
      ) : null}
    </Row>
  );
}

function mergeDateParts(date: Date, selectedDate: Date) {
  const mergedDate = new Date(date);
  mergedDate.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
  return mergedDate;
}

function mergeTimeParts(date: Date, selectedDate: Date) {
  const mergedDate = new Date(date);
  mergedDate.setHours(selectedDate.getHours(), selectedDate.getMinutes(), 0, 0);
  return mergedDate;
}

function getFirstParam(param: string | string[] | undefined) {
  return Array.isArray(param) ? param[0] : param;
}

function parseDayParam(dayKey: string | undefined) {
  if (!dayKey) {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);

  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

function parseDateParam(value: string | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function roundToNextHour(date: Date) {
  const nextDate = new Date(date);
  nextDate.setMinutes(0, 0, 0);
  nextDate.setHours(nextDate.getHours() + 1);
  return nextDate;
}

function addHours(date: Date, hours: number) {
  const nextDate = new Date(date);
  nextDate.setHours(nextDate.getHours() + hours);
  return nextDate;
}

function isWritableCalendar(calendar: Calendar.ExpoCalendar | undefined) {
  return calendar?.allowsModifications === true && calendar.type !== Calendar.CalendarType.SUBSCRIBED;
}

function getDefaultCalendarId(deviceCalendars: Calendar.ExpoCalendar[]) {
  const calendars = deviceCalendars.filter(isWritableCalendar);
  if (calendars.length === 0) {
    return '';
  }

  if (Platform.OS === 'ios') {
    try {
      const defaultCalendar = Calendar.getDefaultCalendarSync();
      const matchingCalendar = calendars.find((calendar) => calendar.id === defaultCalendar.id);

      if (matchingCalendar) {
        return matchingCalendar.id;
      }
    } catch {
      // Fall through to the cross-platform fallback below.
    }
  }

  return calendars.find((calendar) => calendar.isPrimary)?.id ?? calendars[0].id;
}

function formatDate(date: Date) {
  return `${date.getDate()} ${monthNames[date.getMonth()]} ${date.getFullYear()}`;
}

function formatTime(date: Date) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const noCalendarValue = '__no_calendar__';
const defaultTimedEventStartHour = 9;
