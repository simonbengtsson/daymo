import { Button, FieldGroup, RNHostView, Row, Switch, Text } from '@expo/ui';
import * as Calendar from 'expo-calendar';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { AppState, View } from 'react-native';
import spacing from '@/components/spacer';
import { useTheme } from '@/hooks/use-theme';

export function CalendarList({ isSelected, onSelectionChange }: {
  isSelected?: (id: string) => boolean;
  onSelectionChange?: (id: string, selected: boolean) => void;
}) {
  const theme = useTheme();
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

  return <>
    {isLoading || errorMessage || calendars.length === 0 ? (
      <FieldGroup.Section>
        <Text>{isLoading ? 'Loading calendars…' : errorMessage || 'No calendars found.'}</Text>
        {errorMessage ? <Button label="Try again" variant="text" onPress={() => { setIsLoading(true); setRetryCount((count) => count + 1); }} /> : null}
      </FieldGroup.Section>
    ) : null}
    {groups.map((group) => (
      <FieldGroup.Section key={group.id} title={group.title}>
        {group.calendars.map((calendar) => (
          <Row key={calendar.id} alignment="center" spacing={spacing.base}>
            <RNHostView matchContents>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: calendar.color ?? theme.primary }} />
            </RNHostView>
            {isSelected && onSelectionChange ? (
              <Switch label={calendar.title} value={isSelected(calendar.id)}
                onValueChange={(selected) => onSelectionChange(calendar.id, selected)}
                testID={`calendar-selection-${calendar.id}`} />
            ) : <Text>{calendar.title}</Text>}
          </Row>
        ))}
      </FieldGroup.Section>
    ))}
  </>;
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
