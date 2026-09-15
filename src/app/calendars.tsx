import CheckIcon from '@expo/material-symbols/check.xml';
import { FieldGroup, Host } from '@expo/ui';
import { router, Stack } from 'expo-router';
import { Platform } from 'react-native';
import { CalendarList } from '@/components/calendar-list';
import spacing from '@/components/spacer';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';

export default function CalendarsScreen() {
  const theme = useTheme();
  return <>
    <Stack.Screen options={{ title: 'Calendars', headerTransparent: Platform.OS !== 'android' }} />
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.Button accessibilityLabel="Done"
        icon={process.env.EXPO_OS === 'ios' ? 'checkmark' : CheckIcon}
        onPress={() => router.back()} tintColor={theme.primary} variant="prominent" />
    </Stack.Toolbar>
    <ThemedView style={{ flex: 1 }}>
      <Host style={{ flex: 1, paddingHorizontal: spacing.double, paddingBottom: spacing.double }}>
        <FieldGroup><CalendarList /></FieldGroup>
      </Host>
    </ThemedView>
  </>;
}
