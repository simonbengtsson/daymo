import CheckIcon from '@expo/material-symbols/check.xml';
import { Button, FieldGroup, Host, RNHostView, Row, Switch, Text } from '@expo/ui';
import * as Calendar from 'expo-calendar';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, AppState, Platform, View } from 'react-native';

import spacing from '@/components/spacer';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { setCalendarVisible, useHiddenCalendarIds } from '@/lib/calendar-visibility';

export default function CalendarsScreen() {
  const theme = useTheme();
  const hiddenCalendarIds = useHiddenCalendarIds();
  const [calendars, setCalendars] = useState<Calendar.ExpoCalendar[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [retryCount, setRetryCount] = useState(0);

  useFocusEffect(useCallback(() => {
    let active = true;

    async function loadCalendars() {
      try {
        const permission = await Calendar.getCalendarPermissions();
        if (!permission.granted) {
          throw new Error('Calendar access is required.');
        }
        const deviceCalendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
        if (active) {
          setCalendars(deviceCalendars);
          setErrorMessage('');
        }
      } catch (error) {
        console.warn('Failed to load calendars', error);
        if (active) {
          setErrorMessage('Could not load your calendars. Check calendar access in Settings and try again.');
        }
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void loadCalendars();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void loadCalendars();
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [retryCount]));

  const groups = useMemo(() => groupCalendars(calendars), [calendars]);

  function updateVisibility(calendarId: string, visible: boolean) {
    try {
      setCalendarVisible(calendarId, visible);
    } catch (error) {
      console.warn('Failed to save calendar visibility', error);
      Alert.alert('Could not save selection', 'Your selection has not changed. Please try again.');
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Calendars', headerTransparent: Platform.OS !== 'android' }} />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          accessibilityLabel="Done"
          icon={process.env.EXPO_OS === 'ios' ? 'checkmark' : CheckIcon}
          onPress={() => router.back()}
          tintColor={theme.primary}
          variant="prominent"
        />
      </Stack.Toolbar>
      <ThemedView style={{ flex: 1 }}>
        <Host style={{ flex: 1, paddingHorizontal: spacing.double, paddingBottom: spacing.double }}>
          <FieldGroup>
            {isLoading || errorMessage || calendars.length === 0 ? (
              <FieldGroup.Section>
                <Text>{isLoading ? 'Loading calendars…' : errorMessage || 'No calendars found.'}</Text>
                {errorMessage ? (
                  <Button label="Try again" variant="text" onPress={() => { setIsLoading(true); setRetryCount((count) => count + 1); }} />
                ) : null}
              </FieldGroup.Section>
            ) : null}
            {groups.map((group) => (
              <FieldGroup.Section key={group.id} title={group.title}>
                {group.calendars.map((calendar) => (
                  <Row key={calendar.id} alignment="center" spacing={spacing.base}>
                    <RNHostView matchContents>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: calendar.color ?? theme.primary }} />
                    </RNHostView>
                    <Switch
                      label={calendar.title}
                      value={!hiddenCalendarIds.has(calendar.id)}
                      onValueChange={(visible) => updateVisibility(calendar.id, visible)}
                      testID={`calendar-visibility-${calendar.id}`}
                    />
                  </Row>
                ))}
              </FieldGroup.Section>
            ))}
          </FieldGroup>
        </Host>
      </ThemedView>
    </>
  );
}

function groupCalendars(calendars: Calendar.ExpoCalendar[]) {
  const groups = new Map<string, { id: string; title: string; calendars: Calendar.ExpoCalendar[] }>();
  for (const calendar of calendars) {
    const source = calendar.source;
    const title = source?.name?.trim() || calendar.ownerAccount?.trim() || 'On My Device';
    const id = source?.id || calendar.sourceId || JSON.stringify([source?.type, title]);
    let group = groups.get(id);
    if (!group) {
      group = { id, title, calendars: [] };
      groups.set(id, group);
    }
    group.calendars.push(calendar);
  }
  return [...groups.values()]
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((group) => ({ ...group, calendars: group.calendars.sort((a, b) => a.title.localeCompare(b.title)) }));
}
