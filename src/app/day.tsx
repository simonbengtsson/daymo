import AddIcon from '@expo/material-symbols/add.xml';
import * as Calendar from 'expo-calendar';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { AppState, FlatList, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePostHog } from 'posthog-react-native';

import { AppText } from '@/components/app-text';
import spacing from '@/components/spacer';
import { useTheme } from '@/hooks/use-theme';
import { addDays, getEventDayRange, startOfDay, toDate } from '@/lib/calendar-event-range';
import { useHiddenCalendarIds } from '@/lib/calendar-visibility';

type DayEvent = {
  id: string;
  eventId: string;
  title: string;
  startDate: string;
  endDate: string;
  allDay: boolean;
  color: string;
  calendarTitle: string;
  location: string;
};

export default function DayPage() {
  const params = useLocalSearchParams<{ date?: string | string[]; calendarId?: string | string[] }>();
  const dayKey = firstParam(params.date);
  const calendarId = firstParam(params.calendarId);
  const date = useMemo(() => parseDay(dayKey), [dayKey]);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const posthog = usePostHog();
  const hiddenCalendarIds = useHiddenCalendarIds();
  const [events, setEvents] = useState<DayEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [retryCount, setRetryCount] = useState(0);

  useFocusEffect(useCallback(() => {
    let active = true;
    let requestId = 0;

    async function loadEvents() {
      const currentRequest = ++requestId;
      if (!date) {
        setErrorMessage('This date is not valid.');
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setErrorMessage('');
      try {
        const permission = await Calendar.getCalendarPermissions();
        if (!permission.granted) throw new Error('Calendar access is required.');
        const calendars = (await Calendar.getCalendars(Calendar.EntityTypes.EVENT)).filter((calendar) =>
          calendarId ? calendar.id === calendarId : !hiddenCalendarIds.has(calendar.id)
        );
        const calendarsById = new Map(calendars.map((calendar) => [calendar.id, calendar]));
        const nextDay = addDays(date, 1);
        const deviceEvents = calendars.length > 0 ? await Calendar.listEvents(calendars, date, nextDay) : [];
        const dayEvents = deviceEvents.filter((event) => {
          const range = getEventDayRange(event);
          return range.startDate < nextDay && range.endDateExclusive > date;
        }).map((event): DayEvent => ({
          id: `${event.id}-${toDate(event.startDate).toISOString()}`,
          eventId: event.id,
          title: event.title || 'Untitled event',
          startDate: toDate(event.startDate).toISOString(),
          endDate: toDate(event.endDate).toISOString(),
          allDay: event.allDay,
          color: calendarsById.get(event.calendarId)?.color ?? theme.primary,
          calendarTitle: calendarsById.get(event.calendarId)?.title ?? '',
          location: event.location ?? '',
        })).sort((first, second) => Number(second.allDay) - Number(first.allDay)
          || Date.parse(first.startDate) - Date.parse(second.startDate)
          || first.title.localeCompare(second.title));
        if (active && currentRequest === requestId) setEvents(dayEvents);
      } catch (error) {
        console.warn('Failed to load day events', error);
        if (active && currentRequest === requestId) setErrorMessage('Could not load events. Check calendar access in Settings and try again.');
      } finally {
        if (active && currentRequest === requestId) setIsLoading(false);
      }
    }

    void loadEvents();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void loadEvents();
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [date, calendarId, hiddenCalendarIds, retryCount, theme.primary]));

  function addEvent() {
    if (!date || !dayKey) return;
    posthog.capture('new_event_opened', { source: 'day' });
    router.push({ pathname: '/new-event', params: { startDate: dayKey } });
  }

  function editEvent(event: DayEvent) {
    posthog.capture('new_event_opened', { is_edit_mode: true, source: 'day' });
    router.push({ pathname: '/new-event', params: { eventId: event.eventId, occurrenceStartDate: event.startDate } });
  }

  const toolbar = (
    <Stack.Toolbar>
      <Stack.Toolbar.Button accessibilityLabel="Add event" icon={Platform.OS === 'android' ? AddIcon : 'plus'} disabled={!date} onPress={addEvent} />
      <Stack.Toolbar.Spacer />
    </Stack.Toolbar>
  );

  return (
    <>
      <FlatList
        style={{ flex: 1, backgroundColor: theme.background }}
        contentInsetAdjustmentBehavior="automatic"
        data={isLoading || errorMessage ? [] : events}
        keyExtractor={(event) => event.id}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 80 + insets.bottom }}
        ListEmptyComponent={
          <View style={{ padding: spacing.double, gap: spacing.double }}>
            <AppText themeColor="textSecondary">{isLoading ? 'Loading events…' : errorMessage || 'No events this day.'}</AppText>
            {errorMessage && date ? (
              <Pressable accessibilityRole="button" onPress={() => setRetryCount((count) => count + 1)} style={{ minHeight: 44, justifyContent: 'center' }}>
                <AppText themeColor="primary">Try again</AppText>
              </Pressable>
            ) : null}
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: 1, marginLeft: spacing.double, backgroundColor: theme.border }} />}
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" onPress={() => editEvent(item)} style={({ pressed }) => ({ padding: spacing.double, flexDirection: 'row', gap: spacing.double, opacity: pressed ? 0.6 : 1 })}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: item.color, marginTop: 6 }} />
            <View style={{ flex: 1, gap: 4 }}>
              <AppText weight="medium">{item.title}</AppText>
              <AppText variant="subheadline" themeColor="textSecondary">{formatEventTime(item, date!)}</AppText>
              {item.location ? <AppText variant="footnote" themeColor="textSecondary">{item.location}</AppText> : null}
              {item.calendarTitle ? <AppText variant="footnote" themeColor="textSecondary">{item.calendarTitle}</AppText> : null}
            </View>
          </Pressable>
        )}
      />
      <Stack.Screen options={{
        title: date ? date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' }) : 'Day',
        headerLargeTitle: true,
        headerBackButtonDisplayMode: 'minimal',
        headerTransparent: false,
      }} />
      {Platform.OS === 'android' ? (
        <View pointerEvents="box-none" style={{ bottom: 0, height: 64 + insets.bottom, left: spacing.base, position: 'absolute', right: spacing.base }}>
          {toolbar}
        </View>
      ) : toolbar}
    </>
  );
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseDay(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

function formatEventTime(event: DayEvent, day: Date) {
  if (event.allDay) return 'All day';
  const format = (value: string) => {
    const date = toDate(value);
    return date.toLocaleString(undefined, {
      ...(startOfDay(date).getTime() !== day.getTime() ? { month: 'short', day: 'numeric' } as const : {}),
      hour: '2-digit',
      minute: '2-digit',
    });
  };
  return `${format(event.startDate)} – ${format(event.endDate)}`;
}
