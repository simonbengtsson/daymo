import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { usePostHog } from 'posthog-react-native';

import { AppText } from '@/components/app-text';
import spacing from '@/components/spacer';
import { ThemedView } from '@/components/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

const privacyPolicyUrl = 'https://flown.io/privacypolicy';

type CalendarPermissionOnboardingProps = {
  canAskAgain: boolean;
  isDenied: boolean;
  isLoading: boolean;
  onRequestPermission: () => Promise<unknown>;
};

export function CalendarPermissionOnboarding({
  canAskAgain,
  isDenied,
  isLoading,
  onRequestPermission,
}: CalendarPermissionOnboardingProps) {
  const posthog = usePostHog();
  const colorScheme = useColorScheme();
  const theme = useTheme();
  const [isWorking, setIsWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const shouldOpenSettings = isDenied && !canAskAgain;

  async function performAction(action: () => Promise<unknown>) {
    setIsWorking(true);
    setErrorMessage('');

    try {
      await action();
    } catch (error) {
      console.warn('Failed to update calendar permission', error);
      setErrorMessage('Could not open calendar access. Please try again.');
    } finally {
      setIsWorking(false);
    }
  }

  function requestPermission() {
    posthog.capture('calendar_access_requested', { is_denied: isDenied, can_ask_again: canAskAgain });
    void performAction(onRequestPermission);
  }

  function openSettings() {
    posthog.capture('calendar_access_settings_opened', { is_denied: isDenied });
    void performAction(Linking.openSettings);
  }

  function openPrivacyPolicy() {
    setErrorMessage('');
    void Linking.openURL(privacyPolicyUrl).catch((error) => {
      console.warn('Failed to open privacy policy', error);
      setErrorMessage('Could not open the privacy policy. Please try again.');
    });
  }

  return (
    <ThemedView style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1, justifyContent: 'space-between', paddingHorizontal: 24 }}>
        <ScrollView
          contentContainerStyle={{
            alignItems: 'center',
            flexGrow: 1,
            justifyContent: 'center',
            paddingBottom: 24,
            paddingTop: 24,
          }}
          showsVerticalScrollIndicator={false}
        >
          <Image
            accessible
            accessibilityLabel="Daymo calendar"
            contentFit="contain"
            source={
              colorScheme === 'dark'
                ? require('../../assets/images/icon-white.png')
                : require('../../assets/images/icon.png')
            }
            style={{ height: 164, marginBottom: 36, width: 164 }}
          />
          <AppText style={{ maxWidth: 360, textAlign: 'center' }} variant="largeTitle">
            Your week at a glance
          </AppText>
          <AppText
            style={{ marginTop: 14, maxWidth: 380, textAlign: 'center' }}
            themeColor="textSecondary"
          >
            See upcoming weeks in a clear vertical view that keeps empty days, all-day events, and
            multi-day plans easy to overview.
          </AppText>
          <AppText
            style={{ marginTop: 10, maxWidth: 380, textAlign: 'center' }}
            themeColor="textSecondary"
          >
            Allow calendar access to view and update events already on this device.
          </AppText>

          {isDenied ? (
            <View
              style={{
                backgroundColor: theme.backgroundElement,
                borderRadius: 16,
                marginTop: 28,
                maxWidth: 420,
                padding: 16,
                width: '100%',
              }}
            >
              <AppText weight="semibold">Calendar access is off</AppText>
              <AppText style={{ marginTop: 4 }} themeColor="textSecondary" variant="subheadline">
                {Platform.OS === 'ios'
                  ? 'Open Settings, select Daymo, tap Calendars, then choose Full Access.'
                  : 'Open Settings, select Apps, Daymo, Permissions, and Calendar, then choose Allow.'}
              </AppText>
            </View>
          ) : null}

          {errorMessage ? (
            <AppText
              style={{ marginTop: 12, textAlign: 'center' }}
              themeColor="textDestructive"
              variant="footnote"
            >
              {errorMessage}
            </AppText>
          ) : null}
        </ScrollView>

        <View style={{ alignItems: 'center', paddingBottom: 12, width: '100%' }}>
          <PermissionButton
            disabled={isLoading || isWorking}
            label={
              isWorking
                ? 'Please wait…'
                : shouldOpenSettings
                  ? 'Open Settings'
                  : isDenied
                    ? 'Try Again'
                    : 'Continue'
            }
            onPress={shouldOpenSettings ? openSettings : requestPermission}
          />
          <Pressable
            accessibilityRole="link"
            disabled={isWorking}
            hitSlop={spacing.base}
            onPress={openPrivacyPolicy}
            style={{
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 36,
              paddingHorizontal: spacing.double,
            }}>
            {({ pressed }) => (
              <AppText
                style={{
                  color: theme.primary,
                  opacity: pressed ? 0.65 : 1,
                  textDecorationLine: 'underline',
                }}
                variant="footnote">
                Privacy Policy
              </AppText>
            )}
          </Pressable>
          {isDenied && canAskAgain ? (
            <Pressable
              accessibilityRole="button"
              disabled={isWorking}
              hitSlop={spacing.base}
              onPress={openSettings}
              style={{
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 4,
                minHeight: 44,
                paddingHorizontal: 16,
              }}
            >
              {({ pressed }) => (
                <AppText style={{ color: theme.primary, opacity: pressed ? 0.65 : 1 }} weight="semibold">
                  Open Settings
                </AppText>
              )}
            </Pressable>
          ) : null}
          <AppText
            style={{ marginTop: 12, textAlign: 'center' }}
            themeColor="textSecondary"
            variant="footnote"
          >
            Daymo does not collect your calendar data. Only anonymized app analytics are collected.
          </AppText>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

function PermissionButton({ disabled, label, onPress }: { disabled: boolean; label: string; onPress: () => void }) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          alignItems: 'center',
          backgroundColor: theme.primary,
          borderRadius: 14,
          justifyContent: 'center',
          minHeight: 52,
          opacity: disabled ? 0.45 : pressed ? 0.78 : 1,
          paddingHorizontal: 20,
          width: '100%',
        },
      ]}
    >
      <AppText style={{ color: '#ffffff' }} weight="semibold">
        {label}
      </AppText>
    </Pressable>
  );
}
