import CheckIcon from '@expo/material-symbols/check.xml';
import { FieldGroup, Host, TextInput } from '@expo/ui';
import * as Calendar from 'expo-calendar';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform } from 'react-native';
import { CalendarList } from '@/components/calendar-list';
import spacing from '@/components/spacer';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { type CalendarSet, includesCalendar, saveCalendarSet, useCalendarSets } from '@/lib/calendar-sets';

export default function CalendarSetScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { sets } = useCalendarSets();
  const theme = useTheme();
  const [draft, setDraft] = useState<CalendarSet>(() => sets.find((set) => set.id === id) ?? {
    id: `set-${Date.now()}-${Math.random().toString(36).slice(2)}`, name: '', calendarIds: [],
  });
  const [isSaving, setIsSaving] = useState(false);
  const canSave = draft.name.trim().length > 0 && !isSaving;

  async function save() {
    if (!canSave) return;
    setIsSaving(true);
    try {
      const calendarIds = draft.calendarIds ?? (await Calendar.getCalendars(Calendar.EntityTypes.EVENT))
        .filter((calendar) => includesCalendar(draft, calendar.id)).map((calendar) => calendar.id);
      saveCalendarSet({ id: draft.id, name: draft.name, calendarIds });
      router.back();
    } catch (error) {
      console.warn('Failed to save calendar set', error);
      Alert.alert('Could not save calendar set', 'Please try again.');
      setIsSaving(false);
    }
  }

  function updateSelection(id: string, selected: boolean) {
    setDraft((current) => {
      if (current.calendarIds === null) {
        const excluded = new Set(current.excludedCalendarIds);
        if (selected) excluded.delete(id); else excluded.add(id);
        return { ...current, excludedCalendarIds: [...excluded] };
      }
      const ids = new Set(current.calendarIds);
      if (selected) ids.add(id); else ids.delete(id);
      return { ...current, calendarIds: [...ids] };
    });
  }

  return <>
    <Stack.Screen options={{ title: 'Calendar Set', headerTransparent: Platform.OS !== 'android' }} />
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.Button accessibilityLabel="Save calendar set" disabled={!canSave}
        icon={process.env.EXPO_OS === 'ios' ? 'checkmark' : CheckIcon}
        onPress={() => { void save(); }} tintColor={theme.primary} variant="prominent" />
    </Stack.Toolbar>
    <ThemedView style={{ flex: 1 }}>
      <Host style={{ flex: 1, paddingHorizontal: spacing.double, paddingBottom: spacing.double }}>
        <FieldGroup>
          <FieldGroup.Section title="Name">
            <TextInput defaultValue={draft.name} placeholder="Calendar set name" autoCapitalize="words"
              onChangeText={(name) => setDraft((current) => ({ ...current, name }))} />
          </FieldGroup.Section>
          <CalendarList isSelected={(id) => includesCalendar(draft, id)} onSelectionChange={updateSelection} />
        </FieldGroup>
      </Host>
    </ThemedView>
  </>;
}
