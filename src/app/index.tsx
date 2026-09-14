import AddIcon from '@expo/material-symbols/add.xml';
import MoreHorizIcon from '@expo/material-symbols/more_horiz.xml';
import { BottomSheet, RNHostView } from '@expo/ui';
import { LegendList, type LegendListRef, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import * as Calendar from 'expo-calendar';
import * as Linking from 'expo-linking';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePostHog } from 'posthog-react-native';

import { AppText } from '@/components/app-text';
import spacing from '@/components/spacer';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { addDays, getEventDayRange, isMultiDayRange, startOfDay, toDate } from '@/lib/calendar-event-range';
import { useHiddenCalendarIds } from '@/lib/calendar-visibility';

type AgendaItem =
  | {
      id: string;
      type: 'weekHeader';
      label: string;
      continuationEvents: AgendaEvent[];
    }
  | {
      id: string;
      type: 'day';
      dayNumber: string;
      weekday: string;
      isToday: boolean;
      isWeekend?: boolean;
      events: AgendaEvent[];
    };

type AgendaModel = {
  items: AgendaItem[];
};

type DateNavigationItem = {
  id: string;
  primaryLabel: string;
  secondaryLabel: string;
  targetIndex: number;
};

type DateNavigationItemLayout = {
  width: number;
  x: number;
};

type AgendaEvent = {
  id: string;
  eventId: string;
  occurrenceStartDate: string;
  time: string;
  title: string;
  color: string;
  display: 'default' | 'multiDay';
  allDay: boolean;
  showLabel?: boolean;
  indicatorLane?: number;
  continuesBefore?: boolean;
  continuesAfter?: boolean;
};

type CalendarEvent = {
  id: string;
  calendarId: string;
  title: string;
  startDate: string | Date;
  endDate: string | Date;
  allDay: boolean;
  calendarColor: string;
};

type CalendarStatus = 'loading' | 'ready' | 'denied' | 'unavailable' | 'error';

const initialCalendarWindowMonths = 12;
const calendarWindowChunkDays = 120;
const weekHeaderHeight = 34;
const calendarWindowStart = startOfDay(new Date());
const initialCalendarWindowEnd = addMonths(calendarWindowStart, initialCalendarWindowMonths);

export default function Index() {
  const agendaListRef = useRef<LegendListRef>(null);
  const router = useRouter();
  const posthog = usePostHog();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const hiddenCalendarIds = useHiddenCalendarIds();
  const [isCalendarSetSheetPresented, setIsCalendarSetSheetPresented] = useState(false);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [calendarWindowEnd, setCalendarWindowEnd] = useState(initialCalendarWindowEnd);
  const [calendarStatus, setCalendarStatus] = useState<CalendarStatus>('loading');
  const [selectedNavigationId, setSelectedNavigationId] = useState(() => getDateNavigationId(calendarWindowStart));
  const isLoadingMoreRef = useRef(false);
  const pendingNavigationIdRef = useRef<string | null>(null);

  const loadCalendarEvents = useCallback(async (startDate: Date, endDate: Date) => {
    if (Platform.OS === 'web') {
      setCalendarStatus('unavailable');
      return [];
    }

    try {
      const permission = await Calendar.getCalendarPermissions();

      if (!permission.granted) {
        setCalendarStatus('denied');
        return [];
      }

      const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
      const calendarColors = new Map(calendars.map((calendar) => [calendar.id, calendar.color ?? primaryColor]));
      const events = await Calendar.listEvents(calendars, startDate, endDate);

      const mappedEvents = events.map((event) => ({
        id: event.id,
        calendarId: event.calendarId,
        title: event.title,
        startDate: event.startDate,
        endDate: event.endDate,
        allDay: event.allDay,
        calendarColor: calendarColors.get(event.calendarId) ?? primaryColor,
      }));
      posthog.capture('events_loaded', { event_count: mappedEvents.length });
      setCalendarStatus('ready');
      return mappedEvents;
    } catch (error) {
      console.warn('Failed to load calendar events', error);
      setCalendarStatus('error');
      return [];
    }
  }, [posthog]);

  const refreshCalendarEvents = useCallback(async () => {
    const events = await loadCalendarEvents(calendarWindowStart, calendarWindowEnd);
    setCalendarEvents(sortCalendarEvents(events));
  }, [calendarWindowEnd, loadCalendarEvents]);

  useFocusEffect(
    useCallback(() => {
      refreshCalendarEvents();
    }, [refreshCalendarEvents])
  );

  useEffect(() => {
    const appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        refreshCalendarEvents();
      }
    });

    return () => {
      appStateSubscription.remove();
    };
  }, [refreshCalendarEvents]);

  const agendaModel = useMemo(
    () => buildAgendaModel(calendarWindowStart, calendarWindowEnd, calendarEvents.filter((event) =>
      !hiddenCalendarIds.has(event.calendarId)
    )),
    [calendarEvents, calendarWindowEnd, hiddenCalendarIds]
  );
  const stickyWeekHeaderIndices = useMemo(
    () => agendaModel.items.flatMap((item, index) => (item.type === 'weekHeader' ? [index] : [])),
    [agendaModel.items]
  );
  const dateNavigationItems = useMemo(
    () => buildDateNavigationItems(calendarWindowStart, calendarWindowEnd, agendaModel.items),
    [agendaModel.items, calendarWindowEnd]
  );
  const themedBorderStyle = { borderColor: theme.border };
  const dayRowDividerColor = withAlphaMultiplier(theme.border, dayRowDividerAlphaMultiplier);
  const renderThemedAgendaSeparator = useCallback(
    ({ leadingItem, trailingItem }: { leadingItem: AgendaItem; trailingItem?: AgendaItem }) =>
      renderAgendaSeparator({ leadingItem, trailingItem }, dayRowDividerColor),
    [dayRowDividerColor]
  );
  const updateSelectedNavigationItem = useCallback(({ index, item }: { index: number; item: AgendaItem }) => {
    const visibleDate = getAgendaItemNavigationDate(agendaModel.items, index, item);

    if (visibleDate == null) {
      return;
    }

    const nextNavigationId = getDateNavigationId(visibleDate);
    const pendingNavigationId = pendingNavigationIdRef.current;

    if (pendingNavigationId != null && pendingNavigationId !== nextNavigationId) {
      return;
    }

    pendingNavigationIdRef.current = null;
    setSelectedNavigationId((currentNavigationId) => (currentNavigationId === nextNavigationId ? currentNavigationId : nextNavigationId));
  }, [agendaModel.items]);

  async function loadMoreFutureDays() {
    if (isLoadingMoreRef.current || calendarStatus === 'loading') {
      return;
    }

    isLoadingMoreRef.current = true;

    const nextWindowEnd = addDays(calendarWindowEnd, calendarWindowChunkDays);
    const newEvents = await loadCalendarEvents(calendarWindowEnd, nextWindowEnd);

    setCalendarEvents((currentEvents) => sortCalendarEvents(mergeCalendarEvents(currentEvents, newEvents)));
    setCalendarWindowEnd(nextWindowEnd);
    isLoadingMoreRef.current = false;
  }

  function scrollToToday() {
    pendingNavigationIdRef.current = getDateNavigationId(calendarWindowStart);
    setSelectedNavigationId(getDateNavigationId(calendarWindowStart));
    agendaListRef.current?.scrollToOffset({ offset: 0, animated: true });
  }

  function navigateToDateRange(item: DateNavigationItem) {
    pendingNavigationIdRef.current = item.id;
    setSelectedNavigationId(item.id);
    void agendaListRef.current?.scrollToIndex({
      index: item.targetIndex,
      animated: true,
      viewOffset: weekHeaderHeight,
    });
  }

  function clearPendingNavigation() {
    pendingNavigationIdRef.current = null;
  }

  function openPrivacyPolicy() {
    void Linking.openURL(privacyPolicyUrl).catch((error) => {
      console.warn('Failed to open privacy policy', error);
    });
  }

  const switchCalendarButton = (
    <Stack.Toolbar.View>
      <Pressable
        accessibilityLabel="Switch calendar set"
        accessibilityRole="button"
        onPress={() => setIsCalendarSetSheetPresented(true)}
        style={({ pressed }) => ({
          width: 44,
          height: 44,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.72 : 1,
        })}>
        <Ionicons name="swap-horizontal" size={26} color={theme.text} />
      </Pressable>
    </Stack.Toolbar.View>
  );

  return (
    <>
      <ThemedView style={{ flex: 1 }}>
        <DateNavigationHeader
          selectedNavigationId={selectedNavigationId}
          topInset={insets.top}
          items={dateNavigationItems}
          onEndReached={loadMoreFutureDays}
          onItemPress={navigateToDateRange}
        />
        <LegendList
          ref={agendaListRef}
          data={agendaModel.items}
          ItemSeparatorComponent={renderThemedAgendaSeparator}
          ListHeaderComponent={
            <AgendaListHeader
              borderStyle={themedBorderStyle}
              status={calendarStatus}
            />
          }
          renderItem={renderAgendaItem}
          keyExtractor={(item) => item.id}
          stickyHeaderIndices={stickyWeekHeaderIndices}
          recycleItems
          maintainVisibleContentPosition
          onFirstVisibleItemChanged={updateSelectedNavigationItem}
          onMomentumScrollEnd={clearPendingNavigation}
          onScrollBeginDrag={clearPendingNavigation}
          onEndReached={loadMoreFutureDays}
          onEndReachedThreshold={0.6}
          showsVerticalScrollIndicator={false}
          estimatedItemSize={96}
          style={[{ flex: 1 }, { backgroundColor: theme.background }]}
        />
      </ThemedView>
      <BottomSheet
        isPresented={isCalendarSetSheetPresented}
        onDismiss={() => setIsCalendarSetSheetPresented(false)}
        containerColor={theme.background}
        testID="calendar-set-sheet">
        <RNHostView matchContents>
          <View style={{ paddingTop: spacing.base, paddingBottom: spacing.double, gap: spacing.double }}>
            <AppText variant="title2" weight="semibold" accessibilityRole="header">
              Calendar Sets
            </AppText>
            <View style={{ flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: theme.border }}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setIsCalendarSetSheetPresented(false)}
                style={({ pressed }) => ({ flex: 1, minHeight: 56, justifyContent: 'center', opacity: pressed ? 0.72 : 1 })}>
                <AppText>Main Calendar Set</AppText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Edit Main Calendar Set"
                onPress={() => {}}
                style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.72 : 1 })}>
                <Ionicons name="pencil-outline" size={22} color={theme.primary} />
              </Pressable>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => {}}
              style={({ pressed }) => ({ minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: withOpacity(theme.primary, 0.12), opacity: pressed ? 0.72 : 1 })}>
              <AppText weight="semibold" style={{ color: theme.primary }}>Add Calendar Set</AppText>
            </Pressable>
          </View>
        </RNHostView>
      </BottomSheet>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />
      {Platform.OS === 'android' ? (
        <View
          pointerEvents="box-none"
          style={{
            bottom: 0,
            height: 64 + insets.bottom,
            left: spacing.base,
            position: 'absolute',
            right: spacing.base,
          }}>
          <Stack.Toolbar>
            <Stack.Toolbar.View>
              <View style={{ alignItems: 'center', flexDirection: 'row', gap: spacing.base }}>
                <ToolbarTextButton label="Today" onPress={scrollToToday} />
              </View>
            </Stack.Toolbar.View>
            <Stack.Toolbar.Button
              accessibilityLabel="Add event"
              icon={AddIcon}
              onPress={() => { posthog.capture('new_event_opened'); router.push('/new-event'); }}
            />
            <Stack.Toolbar.Menu
              accessibilityLabel="More options"
              icon={MoreHorizIcon}>
              <Stack.Toolbar.MenuAction onPress={() => router.push('./calendars')}>
                Calendars
              </Stack.Toolbar.MenuAction>
              <Stack.Toolbar.MenuAction onPress={openPrivacyPolicy}>
                Privacy Policy
              </Stack.Toolbar.MenuAction>
            </Stack.Toolbar.Menu>
            <Stack.Toolbar.Spacer width={spacing.base} />
            {switchCalendarButton}
          </Stack.Toolbar>
        </View>
      ) : (
        <Stack.Toolbar>
          <Stack.Toolbar.Button accessibilityLabel="Today" onPress={scrollToToday}>
            Today
          </Stack.Toolbar.Button>
          <Stack.Toolbar.Button
            accessibilityLabel="Add event"
            icon="plus"
            onPress={() => { posthog.capture('new_event_opened'); router.push('/new-event'); }}
          />
          <Stack.Toolbar.Menu
            accessibilityLabel="More options"
            icon="ellipsis">
            <Stack.Toolbar.MenuAction onPress={() => router.push('./calendars')}>
              Calendars
            </Stack.Toolbar.MenuAction>
            <Stack.Toolbar.MenuAction onPress={openPrivacyPolicy}>
              Privacy Policy
            </Stack.Toolbar.MenuAction>
          </Stack.Toolbar.Menu>
          <Stack.Toolbar.Spacer />
          {switchCalendarButton}
        </Stack.Toolbar>
      )}
    </>
  );
}

function ToolbarTextButton({
  accessibilityLabel,
  label,
  onPress,
}: {
  accessibilityLabel?: string;
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      hitSlop={spacing.base}
      onPress={onPress}
      style={({ pressed }) => [
        {
          alignItems: 'center',
          borderRadius: 20,
          justifyContent: 'center',
          minHeight: 40,
          minWidth: 72,
          opacity: pressed ? 0.72 : 1,
          paddingHorizontal: spacing.double,
        },
        { backgroundColor: withOpacity(theme.primary, 0.12) },
      ]}>
      <AppText
        variant="subheadline"
        weight="semibold"
        style={{ color: theme.primary, includeFontPadding: false }}>
        {label}
      </AppText>
    </Pressable>
  );
}

function DateNavigationHeader({
  selectedNavigationId,
  topInset,
  items,
  onEndReached,
  onItemPress,
}: {
  selectedNavigationId: string;
  topInset: number;
  items: DateNavigationItem[];
  onEndReached: () => void;
  onItemPress: (item: DateNavigationItem) => void;
}) {
  const theme = useTheme();
  const scrollViewRef = useRef<ScrollView>(null);
  const contentWidthRef = useRef(0);
  const itemLayoutsRef = useRef(new Map<string, DateNavigationItemLayout>());
  const lastAutoScrolledNavigationIdRef = useRef<string | null>(null);
  const scrollXRef = useRef(0);
  const viewportWidthRef = useRef(0);
  const headerGestureStartRef = useRef<{ x: number; y: number } | null>(null);
  const [layoutVersion, setLayoutVersion] = useState(0);

  useEffect(() => {
    if (lastAutoScrolledNavigationIdRef.current === selectedNavigationId) {
      return;
    }

    const selectedItemLayout = itemLayoutsRef.current.get(selectedNavigationId);
    const viewportWidth = viewportWidthRef.current;

    if (selectedItemLayout == null || viewportWidth <= 0) {
      return;
    }

    const visibleStart = scrollXRef.current + dateNavigationAutoScrollInset;
    const visibleEnd = scrollXRef.current + viewportWidth - dateNavigationAutoScrollInset;
    const selectedItemStart = selectedItemLayout.x;
    const selectedItemEnd = selectedItemLayout.x + selectedItemLayout.width;

    lastAutoScrolledNavigationIdRef.current = selectedNavigationId;

    if (selectedItemStart >= visibleStart && selectedItemEnd <= visibleEnd) {
      return;
    }

    const centeredOffset = Math.max(0, selectedItemStart - (viewportWidth - selectedItemLayout.width) / 2);
    scrollXRef.current = centeredOffset;
    scrollViewRef.current?.scrollTo({ x: centeredOffset, animated: true });
  }, [layoutVersion, selectedNavigationId]);

  function updateNavigationViewport(event: LayoutChangeEvent) {
    viewportWidthRef.current = event.nativeEvent.layout.width;
    setLayoutVersion((currentVersion) => currentVersion + 1);
    loadMoreNavigationItemsIfNeeded();
  }

  function updateNavigationScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    scrollXRef.current = event.nativeEvent.contentOffset.x;
    loadMoreNavigationItemsIfNeeded();
  }

  function updateNavigationContentSize(width: number) {
    contentWidthRef.current = width;
    loadMoreNavigationItemsIfNeeded();
  }

  function updateItemLayout(itemId: string, event: LayoutChangeEvent) {
    const { width, x } = event.nativeEvent.layout;
    const currentLayout = itemLayoutsRef.current.get(itemId);

    if (currentLayout?.width === width && currentLayout.x === x) {
      return;
    }

    itemLayoutsRef.current.set(itemId, { width, x });
    setLayoutVersion((currentVersion) => currentVersion + 1);
  }

  function loadMoreNavigationItemsIfNeeded() {
    const viewportWidth = viewportWidthRef.current;
    const contentWidth = contentWidthRef.current;

    if (viewportWidth <= 0 || contentWidth <= 0) {
      return;
    }

    const remainingScrollDistance = contentWidth - viewportWidth - scrollXRef.current;

    if (remainingScrollDistance <= dateNavigationEndReachedThreshold) {
      onEndReached();
    }
  }

  function rememberHeaderGestureStart(event: GestureResponderEvent) {
    headerGestureStartRef.current = {
      x: event.nativeEvent.pageX,
      y: event.nativeEvent.pageY,
    };

    return false;
  }

  function captureVerticalHeaderGesture(event: GestureResponderEvent) {
    const headerGestureStart = headerGestureStartRef.current;

    if (headerGestureStart == null) {
      return false;
    }

    const horizontalDistance = Math.abs(event.nativeEvent.pageX - headerGestureStart.x);
    const verticalDistance = Math.abs(event.nativeEvent.pageY - headerGestureStart.y);

    return verticalDistance > dateNavigationVerticalGestureThreshold && verticalDistance > horizontalDistance;
  }

  function clearHeaderGestureStart() {
    headerGestureStartRef.current = null;
  }

  return (
    <ThemedView
      onMoveShouldSetResponderCapture={captureVerticalHeaderGesture}
      onResponderRelease={clearHeaderGestureStart}
      onResponderTerminate={clearHeaderGestureStart}
      onResponderTerminationRequest={() => false}
      onStartShouldSetResponderCapture={rememberHeaderGestureStart}
      style={[
        {
          borderBottomWidth: 1,
          height: topInset + dateNavigationContentHeight,
          paddingTop: topInset,
        },
        { borderBottomColor: theme.border },
      ]}>
      <ScrollView
        ref={scrollViewRef}
        bounces={false}
        directionalLockEnabled
        horizontal
        contentContainerStyle={{
          alignItems: 'center',
          gap: spacing.base,
          minHeight: dateNavigationContentHeight,
          paddingHorizontal: spacing.double,
        }}
        onContentSizeChange={updateNavigationContentSize}
        onLayout={updateNavigationViewport}
        onScroll={updateNavigationScroll}
        scrollEventThrottle={16}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}>
        {items.map((item) => {
          const isSelected = item.id === selectedNavigationId;
          const accessibilityLabel = `${item.primaryLabel} ${item.secondaryLabel}`;

          return (
            <Pressable
              key={item.id}
              accessibilityLabel={accessibilityLabel}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              hitSlop={spacing.base}
              onLayout={(event) => updateItemLayout(item.id, event)}
              onPress={() => onItemPress(item)}
              style={({ pressed }) => [
                {
                  alignItems: 'center',
                  backgroundColor: isSelected ? withOpacity(theme.primary, 0.14) : theme.backgroundElement,
                  borderColor: isSelected ? theme.primary : 'transparent',
                  borderRadius: 21,
                  borderWidth: 1,
                  height: 42,
                  justifyContent: 'center',
                  minWidth: 58,
                  opacity: pressed ? 0.72 : 1,
                  paddingHorizontal: spacing.double,
                },
              ]}>
              <AppText
                variant="subheadline"
                weight="semibold"
                style={[{ fontVariant: ['tabular-nums'] }, isSelected ? { color: theme.primary } : null]}>
                {item.primaryLabel}
              </AppText>
              <AppText variant="caption2" weight="medium" themeColor="textSecondary" style={{ fontVariant: ['tabular-nums'] }}>
                {item.secondaryLabel}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>
    </ThemedView>
  );
}

function CalendarStatusBanner({ borderStyle, status }: { borderStyle: { borderColor: string }; status: CalendarStatus }) {
  const message = {
    loading: 'Loading calendar events...',
    ready: '',
    denied: 'Calendar access is required to show local events.',
    unavailable: 'Device calendar events are only available in a native development build.',
    error: 'Could not load calendar events.',
  }[status];

  return (
    <ThemedView
      type="backgroundElement"
      style={[
        {
          minHeight: spacing.double * 3,
          justifyContent: 'center',
          paddingHorizontal: spacing.double,
          borderBottomWidth: 1,
        },
        borderStyle,
      ]}>
      <AppText selectable variant="footnote" weight="medium" themeColor="textSecondary">
        {message}
      </AppText>
    </ThemedView>
  );
}

function AgendaListHeader({
  borderStyle,
  status,
}: {
  borderStyle: { borderColor: string };
  status: CalendarStatus;
}) {
  return (
    <>
      {status !== 'ready' ? <CalendarStatusBanner borderStyle={borderStyle} status={status} /> : null}
    </>
  );
}

function renderAgendaItem({ item }: LegendListRenderItemProps<AgendaItem>) {
  if (item.type === 'weekHeader') {
    return (
      <ThemedView
        type="backgroundElementOpaque"
        style={{
          alignItems: 'center',
          height: weekHeaderHeight,
          justifyContent: 'center',
          position: 'relative',
        }}>
        <MultiDayDividerIndicator events={item.continuationEvents} />
        <AppText selectable variant="footnote" weight="semibold" themeColor="textSecondary">
          {item.label}
        </AppText>
      </ThemedView>
    );
  }

  return <DayAgendaItem item={item} />;
}

function DayAgendaItem({ item }: { item: Extract<AgendaItem, { type: 'day' }> }) {
  const router = useRouter();
  const theme = useTheme();
  const weekendTextStyle = item.isWeekend ? { color: theme.textDestructive } : null;
  const [indicatorStarts, setIndicatorStarts] = useState<Record<string, number>>({});
  const onEventLayout = useCallback((id: string, centerY: number) => {
    setIndicatorStarts((current) => current[id] === centerY ? current : { ...current, [id]: centerY });
  }, []);

  function openDay() {
    router.push({ pathname: './day', params: { date: item.id } });
  }

  return (
    <ThemedView>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`View events for ${item.weekday}, ${item.id}`}
        onPress={openDay}
        onLongPress={openDay}
        style={{ flexDirection: 'row', alignItems: 'stretch', position: 'relative', paddingLeft: spacing.double }}>
        <MultiDayIndicator events={getMultiDayIndicatorEvents(item.events)} starts={indicatorStarts} />
        <View pointerEvents="none" style={{ width: spacing.double * 2, alignItems: 'center', paddingVertical: spacing.double, gap: spacing.base }}>
          <AppText variant="caption2" weight="semibold" style={weekendTextStyle}>{item.weekday}</AppText>
          <View style={{ width: spacing.double * 2, alignItems: 'center', justifyContent: 'center', marginTop: -spacing.base / 2 }}>
            <AppText variant="title2" weight="semibold" style={[{ fontVariant: ['tabular-nums'], includeFontPadding: false, lineHeight: 22 }, weekendTextStyle]}>
              {item.dayNumber}
            </AppText>
          </View>
        </View>
        <View pointerEvents="none" style={{ flex: 1, paddingLeft: spacing.double, paddingRight: spacing.base }}>
          <AgendaEvents events={item.events} onEventLayout={onEventLayout} />
        </View>
      </Pressable>
    </ThemedView>
  );
}

function renderAgendaSeparator({ leadingItem, trailingItem }: { leadingItem: AgendaItem; trailingItem?: AgendaItem }, borderColor: string) {
  if (leadingItem.type === 'weekHeader' || trailingItem?.type === 'weekHeader') {
    return null;
  }

  if (leadingItem.type === 'day' && nextDayStartsWeek(leadingItem.id)) {
    return null;
  }

  return <AgendaSeparator color={borderColor} events={leadingItem.type === 'day' ? getMultiDaySeparatorEvents(leadingItem.events) : []} />;
}

function nextDayStartsWeek(dayKey: string) {
  const date = parseDayKey(dayKey);
  return date != null && addDays(date, 1).getDay() === 1;
}

function AgendaSeparator({ color, events = [] }: { color: string; events?: AgendaEvent[] }) {
  return (
    <View collapsable={false} pointerEvents="none" style={[{ height: 1, position: 'relative' }, { backgroundColor: color }]}>
      <MultiDayDividerIndicator events={events} />
    </View>
  );
}

function AgendaEvents({ events, onEventLayout }: { events: AgendaEvent[]; onEventLayout: (id: string, centerY: number) => void }) {
  const indicatorEvents = getMultiDayIndicatorEvents(events);
  const visibleEvents = events
    .filter((event) => event.display !== 'multiDay' || event.showLabel)
    .sort((first, second) => Number(indicatorEvents.includes(second)) - Number(indicatorEvents.includes(first)));
  // Center ordinary event dots on the right edge of the rightmost active line.
  const contentInset = indicatorEvents.length > 0 ? getMultiDayIndicatorWidth(indicatorEvents) - eventDotStyle.width / 2 : 0;

  return (
    <View pointerEvents="box-none" style={{ minHeight: spacing.double * 2, paddingVertical: spacing.base }}>
      {visibleEvents.map((event) => (
        <AgendaEventRow
          key={event.id}
          event={event}
          inset={indicatorEvents.includes(event) ? (event.indicatorLane ?? 0) * multiDayIndicatorLaneWidth : contentInset}
          onLayout={(layout) => onEventLayout(event.id, layout.nativeEvent.layout.y + layout.nativeEvent.layout.height / 2 + 1)}
        />
      ))}
    </View>
  );
}

function MultiDayDividerIndicator({ events }: { events: AgendaEvent[] }) {
  return <MultiDayIndicator events={events} roundedCaps={false} />;
}

function MultiDayIndicator({ events, starts = {}, roundedCaps = true }: { events: AgendaEvent[]; starts?: Record<string, number>; roundedCaps?: boolean }) {
  if (events.length === 0) {
    return null;
  }

  return (
    <View
      pointerEvents="none"
      style={{
        bottom: 0,
        position: 'absolute',
        left: spacing.double * 4,
        top: 0,
        width: getMultiDayIndicatorWidth(events),
      }}>
      <MultiDayIndicatorCanvas events={events} starts={starts} roundedCaps={roundedCaps} />
    </View>
  );
}

function MultiDayIndicatorCanvas({ events, starts, roundedCaps = true }: { events: AgendaEvent[]; starts: Record<string, number>; roundedCaps?: boolean }) {
  const theme = useTheme();

  return (
    <View pointerEvents="none" style={{ bottom: 0, position: 'absolute', left: 0, top: 0, width: getMultiDayIndicatorWidth(events) }}>
      {[...events].sort((first, second) => (first.indicatorLane ?? 0) - (second.indicatorLane ?? 0)).map((event) => (
        <View
          key={`${event.id}-line`}
          style={{
            ...getMultiDayIndicatorStyle(event, roundedCaps, starts[event.id]),
            backgroundColor: theme.background,
            borderColor: theme.background,
            borderLeftWidth: 1,
            borderRightWidth: 1,
            borderTopWidth: roundedCaps && !event.continuesBefore ? 1 : 0,
            borderBottomWidth: roundedCaps && !event.continuesAfter ? 1 : 0,
            overflow: 'hidden',
          }}>
          <View style={{
            flex: 1,
            backgroundColor: event.color,
            opacity: 0.22,
            borderBottomLeftRadius: roundedCaps && !event.continuesAfter ? multiDayIndicatorLineRadius - 1 : 0,
            borderBottomRightRadius: roundedCaps && !event.continuesAfter ? multiDayIndicatorLineRadius - 1 : 0,
          }} />
        </View>
      ))}
    </View>
  );
}

function getMultiDayIndicatorEvents(events: AgendaEvent[]) {
  return events.filter((event) => event.display === 'multiDay' && (event.continuesBefore || event.continuesAfter));
}

function getMultiDaySeparatorEvents(events: AgendaEvent[]) {
  return events.filter((event) => event.display === 'multiDay' && event.continuesAfter);
}

function getMultiDayWeekDividerEvents(events: AgendaEvent[]) {
  return events.filter((event) => event.display === 'multiDay' && event.continuesBefore);
}

function getMultiDayIndicatorWidth(events: AgendaEvent[]) {
  const maxLane = Math.max(0, ...events.map((event) => event.indicatorLane ?? 0));
  return maxLane * multiDayIndicatorLaneWidth + multiDayIndicatorLineWidth;
}

function getMultiDayIndicatorStyle(event: AgendaEvent, roundedCaps: boolean, start?: number) {
  const lane = event.indicatorLane ?? 0;
  const hasStartCap = roundedCaps && !event.continuesBefore;
  const hasEndCap = roundedCaps && !event.continuesAfter;
  const topRadius = roundedCaps && !event.continuesBefore ? multiDayIndicatorLineRadius : 0;
  const bottomRadius = roundedCaps && !event.continuesAfter ? multiDayIndicatorLineRadius : 0;

  return {
    backgroundColor: event.color,
    borderBottomLeftRadius: bottomRadius,
    borderBottomRightRadius: bottomRadius,
    borderTopLeftRadius: topRadius,
    borderTopRightRadius: topRadius,
    bottom: hasEndCap ? multiDayIndicatorEndInset : 0,
    position: 'absolute' as const,
    left: lane * multiDayIndicatorLaneWidth,
    top: hasStartCap ? (start ?? spacing.base + agendaEventRowMinHeight / 2 + 1) : 0,
    width: multiDayIndicatorLineWidth,
  };
}

function AgendaEventRow({ event, inset = 0, onLayout }: { event: AgendaEvent; inset?: number; onLayout?: (event: LayoutChangeEvent) => void }) {
  const theme = useTheme();
  const eventContent =
    event.display === 'multiDay' ? (
      <>
        <View style={[eventDotStyle, { backgroundColor: event.color, borderColor: theme.background }]} />
        <AppText variant="body" style={{ flex: 1 }}>
          {event.title}
        </AppText>
      </>
    ) : (
      <>
        <View style={[eventDotStyle, { backgroundColor: event.color, borderColor: theme.background }]} />
        <AppText variant="body" themeColor="textSecondary" style={{ fontVariant: ['tabular-nums'] }}>
          {event.time}
        </AppText>
        <AppText variant="body" style={{ flex: 1 }}>
          {event.title}
        </AppText>
      </>
    );

  return (
    <View onLayout={onLayout} pointerEvents="box-none" style={{ minHeight: agendaEventRowMinHeight, marginLeft: inset, flexDirection: 'row', alignItems: 'center', gap: spacing.base }}>
      <View
        style={{
          minHeight: agendaEventRowMinHeight,
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.base,
        }}>
        {eventContent}
      </View>
    </View>
  );
}

function buildAgendaModel(startDate: Date, endDate: Date, events: CalendarEvent[]): AgendaModel {
  const eventsByDay = groupEventsByDay(events, startDate, endDate);
  const items: AgendaItem[] = [];
  const todayDate = startOfDay(new Date());
  const todayKey = toDayKey(todayDate);

  for (let date = new Date(startDate); date < endDate; date = addDays(date, 1)) {
    const dayKey = toDayKey(date);
    const dayEvents = eventsByDay.get(dayKey) ?? [];

    if (dayKey === toDayKey(startDate) || date.getDay() === 1) {
      const weekStart = startOfWeek(date);

      items.push({
        id: `week-${toDayKey(weekStart)}`,
        type: 'weekHeader',
        label: `${formatWeekRange(weekStart)} | W${getIsoWeek(weekStart)}`,
        continuationEvents: getMultiDayWeekDividerEvents(dayEvents),
      });
    }

    items.push(buildDayAgendaItem(date, dayEvents, todayKey));
  }

  return { items };
}

function buildDateNavigationItems(startDate: Date, endDate: Date, agendaItems: AgendaItem[]): DateNavigationItem[] {
  const itemIndexById = new Map(agendaItems.map((item, index) => [item.id, index]));
  const items: DateNavigationItem[] = [];

  for (let monthStart = startOfMonth(startDate); monthStart < endDate; monthStart = addMonths(monthStart, 1)) {
    const firstVisibleDate = maxDate(monthStart, startDate);
    const targetIndex = itemIndexById.get(toDayKey(firstVisibleDate));

    if (targetIndex == null) {
      continue;
    }

    items.push({
      id: `month-${toMonthKey(monthStart)}`,
      primaryLabel: shortMonthNames[monthStart.getMonth()],
      secondaryLabel: String(monthStart.getFullYear()),
      targetIndex,
    });
  }

  return items;
}

function getAgendaItemNavigationDate(agendaItems: AgendaItem[], index: number, item: AgendaItem) {
  if (item.type === 'day') {
    return parseDayKey(item.id);
  }

  for (let itemIndex = index + 1; itemIndex < agendaItems.length; itemIndex++) {
    const nextItem = agendaItems[itemIndex];

    if (nextItem.type === 'day') {
      return parseDayKey(nextItem.id);
    }
  }

  return null;
}

function buildDayAgendaItem(date: Date, events: AgendaEvent[], todayKey: string): Extract<AgendaItem, { type: 'day' }> {
  const dayKey = toDayKey(date);

  return {
    id: dayKey,
    type: 'day',
    dayNumber: String(date.getDate()),
    weekday: weekdayNames[date.getDay()],
    isToday: dayKey === todayKey,
    isWeekend: date.getDay() === 0,
    events,
  };
}

function groupEventsByDay(events: CalendarEvent[], visibleStartDate: Date, visibleEndDate: Date) {
  const eventsByDay = new Map<string, AgendaEvent[]>();
  const blockEvents = events
    .filter(usesBlockEventStyle)
    .map((event) => {
      const range = getEventDayRange(event);
      return {
        event,
        startDate: range.startDate,
        endDate: range.endDateExclusive,
        lane: 0,
      };
    })
    .sort((first, second) => {
      const startDifference = first.startDate.getTime() - second.startDate.getTime();
      return startDifference === 0 ? first.endDate.getTime() - second.endDate.getTime() : startDifference;
    });

  assignIndicatorLanes(
    blockEvents.filter(({ startDate, endDate }) =>
      isMultiDayRange({ startDate, endDateExclusive: endDate })
    )
  );

  for (const { event, startDate, endDate, lane } of blockEvents) {
    const firstVisibleDate = maxDate(startDate, visibleStartDate);
    const lastVisibleDate = minDate(endDate, visibleEndDate);
    const occurrenceId = getCalendarEventOccurrenceId(event);

    for (let date = firstVisibleDate; date < lastVisibleDate; date = addDays(date, 1)) {
      const dayKey = toDayKey(date);
      const dayEvents = eventsByDay.get(dayKey) ?? [];
      dayEvents.push({
        id: `${occurrenceId}-${dayKey}`,
        eventId: event.id,
        occurrenceStartDate: toDate(event.startDate).toISOString(),
        time: '',
        title: event.title,
        color: event.calendarColor,
        display: 'multiDay',
        allDay: event.allDay,
        showLabel: date.getTime() === firstVisibleDate.getTime(),
        indicatorLane: lane,
        continuesBefore: date > startDate,
        continuesAfter: addDays(date, 1) < endDate,
      });
      eventsByDay.set(dayKey, dayEvents);
    }
  }

  for (const event of events) {
    if (usesBlockEventStyle(event)) {
      continue;
    }

    const key = toDayKey(toDate(event.startDate));
    const dayEvents = eventsByDay.get(key) ?? [];
    dayEvents.push({
      id: getCalendarEventOccurrenceId(event),
      eventId: event.id,
      occurrenceStartDate: toDate(event.startDate).toISOString(),
      time: event.allDay ? '' : formatTime(toDate(event.startDate)),
      title: event.title,
      color: event.calendarColor,
      display: 'default',
      allDay: event.allDay,
    });
    eventsByDay.set(key, dayEvents);
  }

  return eventsByDay;
}

function usesBlockEventStyle(event: CalendarEvent) {
  if (event.allDay) {
    return true;
  }

  const startDate = toDate(event.startDate);
  const endDate = toDate(event.endDate);
  const startsAtDayBoundary = startDate.getTime() === startOfDay(startDate).getTime();
  const endsAtDayBoundary = endDate.getTime() === startOfDay(endDate).getTime();
  return startsAtDayBoundary && endsAtDayBoundary && isMultiDayRange(getEventDayRange(event));
}

function assignIndicatorLanes(spans: { startDate: Date; endDate: Date; lane: number }[]) {
  const laneEndDates: Date[] = [];

  for (const span of spans) {
    const reusableLaneIndex = laneEndDates.findIndex((endDate) => endDate <= span.startDate);
    const laneIndex = reusableLaneIndex >= 0 ? reusableLaneIndex : laneEndDates.length;

    span.lane = laneIndex;
    laneEndDates[laneIndex] = span.endDate;
  }
}

function mergeCalendarEvents(currentEvents: CalendarEvent[], newEvents: CalendarEvent[]) {
  const eventsById = new Map(currentEvents.map((event) => [getCalendarEventOccurrenceId(event), event]));

  for (const event of newEvents) {
    eventsById.set(getCalendarEventOccurrenceId(event), event);
  }

  return Array.from(eventsById.values());
}

function getCalendarEventOccurrenceId(event: CalendarEvent) {
  return `${event.id}-${toDate(event.startDate).toISOString()}`;
}

function sortCalendarEvents(events: CalendarEvent[]) {
  return [...events].sort((first, second) => toDate(first.startDate).getTime() - toDate(second.startDate).getTime());
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfWeek(date: Date) {
  const daysSinceMonday = (date.getDay() + 6) % 7;
  return addDays(startOfDay(date), -daysSinceMonday);
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function minDate(first: Date, second: Date) {
  return first < second ? first : second;
}

function maxDate(first: Date, second: Date) {
  return first > second ? first : second;
}

function toDayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toMonthKey(date: Date) {
  const monthStart = startOfMonth(date);
  const year = monthStart.getFullYear();
  const month = String(monthStart.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function getDateNavigationId(date: Date) {
  return `month-${toMonthKey(date)}`;
}

function parseDayKey(dayKey: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);

  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

function formatTime(date: Date) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function formatWeekRange(weekStart: Date) {
  const weekEnd = addDays(weekStart, 6);
  const startDay = weekStart.getDate();
  const endDay = weekEnd.getDate();
  const startMonth = weekMonthNames[weekStart.getMonth()];
  const endMonth = weekMonthNames[weekEnd.getMonth()];

  if (weekStart.getMonth() === weekEnd.getMonth()) {
    return `${startDay}-${endDay} ${startMonth}`;
  }

  return `${startDay} ${startMonth} - ${endDay} ${endMonth}`;
}

function getIsoWeek(date: Date) {
  const target = startOfDay(date);
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7));
  const weekOne = new Date(target.getFullYear(), 0, 4);
  return 1 + Math.round(((target.getTime() - weekOne.getTime()) / 86400000 - 3 + ((weekOne.getDay() + 6) % 7)) / 7);
}

function withOpacity(hexColor: string, opacity: number) {
  const red = Number.parseInt(hexColor.slice(1, 3), 16);
  const green = Number.parseInt(hexColor.slice(3, 5), 16);
  const blue = Number.parseInt(hexColor.slice(5, 7), 16);

  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
}

function withAlphaMultiplier(color: string, multiplier: number) {
  const match = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(color);

  if (!match) {
    return color;
  }

  const [, red, green, blue, alpha] = match;
  const adjustedAlpha = Math.max(0, Math.min(1, Number(alpha) * multiplier));

  return `rgba(${red}, ${green}, ${blue}, ${Math.round(adjustedAlpha * 1000) / 1000})`;
}

const shortMonthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const weekMonthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const weekdayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const primaryColor = Colors.light.primary;
const privacyPolicyUrl = 'https://flown.io/privacypolicy';
const dayRowDividerAlphaMultiplier = 0.75;
const dateNavigationAutoScrollInset = spacing.double;
const dateNavigationContentHeight = 58;
const dateNavigationEndReachedThreshold = spacing.double * 8;
const dateNavigationVerticalGestureThreshold = 0;
const eventDotStyle = {
  width: 12,
  height: 12,
  borderRadius: 6,
  borderWidth: 1,
  flexShrink: 0,
  transform: [{ translateY: 1 }],
};
const agendaEventRowMinHeight = 28;
const multiDayIndicatorLineWidth = 12;
const multiDayIndicatorLineRadius = multiDayIndicatorLineWidth / 2;
const multiDayIndicatorLaneWidth = 6;
const multiDayIndicatorEndInset = spacing.base;
