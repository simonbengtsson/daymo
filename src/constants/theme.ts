/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    primary: '#007AFF',
    text: '#000000',
    background: '#ffffff',
    backgroundHistory: '#F7F7F8',
    backgroundElement: 'rgba(118, 118, 128, 0.12)',
    backgroundElementOpaque: '#EFEFF0',
    backgroundSelected: '#E0E1E6',
    border: 'rgba(60, 60, 67, 0.16)',
    textSecondary: 'rgba(60, 60, 67, 0.6)',
    textDestructive: '#FF3B30',
  },
  dark: {
    primary: '#0A84FF',
    text: '#ffffff',
    background: '#000000',
    backgroundHistory: '#0C0C0E',
    backgroundElement: 'rgba(118, 118, 128, 0.24)',
    backgroundElementOpaque: '#1C1C1F',
    backgroundSelected: '#2E3135',
    border: 'rgba(84, 84, 88, 0.6)',
    textSecondary: 'rgba(235, 235, 245, 0.6)',
    textDestructive: '#FF453A',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;
