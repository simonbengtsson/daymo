import { DarkTheme, DefaultTheme, Stack, ThemeProvider, usePathname, useGlobalSearchParams } from 'expo-router';
import * as Calendar from 'expo-calendar';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { PostHogProvider } from 'posthog-react-native';

import { CalendarPermissionOnboarding } from '@/components/calendar-permission-onboarding';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { posthog } from '@/config/posthog';

export default function TabLayout() {
  const pathname = usePathname();
  const { allDay, eventId } = useGlobalSearchParams<{
    allDay?: string | string[];
    eventId?: string | string[];
  }>();
  const previousPathname = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (previousPathname.current !== pathname) {
      const allDayValue = getFirstParam(allDay);
      const eventIdValue = getFirstParam(eventId);

      posthog.screen(pathname, {
        previous_screen: previousPathname.current ?? null,
        ...(pathname === '/new-event' ? { is_edit_mode: eventIdValue != null } : {}),
        ...(allDayValue != null ? { all_day: allDayValue === 'true' } : {}),
      });
      previousPathname.current = pathname;
    }
  }, [allDay, eventId, pathname]);
  const colorScheme = useColorScheme();
  const statusBarStyle = colorScheme === 'dark' ? 'light' : 'dark';
  const [calendarPermission, requestCalendarPermission, refreshCalendarPermission] = Calendar.useCalendarPermissions({
    writeOnly: false,
  });

  useEffect(() => {
    if (calendarPermission?.granted) {
      return;
    }

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void refreshCalendarPermission().catch((error) => {
          console.warn('Failed to refresh calendar permission', error);
        });
      }
    });

    return () => subscription.remove();
  }, [calendarPermission?.granted, refreshCalendarPermission]);

  return (
    <PostHogProvider
      client={posthog}
      autocapture={{
        captureScreens: false,
        captureTouches: true,
        propsToCapture: ['testID'],
      }}
    >
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        {calendarPermission?.granted ? (
          <Stack screenOptions={{ headerTransparent: true }}>
            <Stack.Screen
              name="index"
              options={{ title: 'Overview' }}
            />
            <Stack.Screen
              name="day"
              options={{
                title: 'Day',
                headerLargeTitle: true,
                headerBackButtonDisplayMode: 'minimal',
                headerTransparent: Platform.OS === 'ios',
              }}
            />
            <Stack.Screen name="calendar-set" options={{ presentation: 'modal' }} />
            <Stack.Screen
              name="calendars"
              options={{ presentation: 'modal' }}
            />
            <Stack.Screen
              name="new-event"
              options={{
                presentation: 'modal',
              }}
            />
          </Stack>
        ) : (
          <CalendarPermissionOnboarding
            canAskAgain={calendarPermission?.canAskAgain ?? true}
            isDenied={calendarPermission?.status === 'denied'}
            isLoading={calendarPermission == null}
            onRequestPermission={requestCalendarPermission}
          />
        )}
        <StatusBar animated={false} hidden={false} style={statusBarStyle} />
      </ThemeProvider>
    </PostHogProvider>
  );
}

function getFirstParam(param: string | string[] | undefined) {
  return Array.isArray(param) ? param[0] : param;
}
