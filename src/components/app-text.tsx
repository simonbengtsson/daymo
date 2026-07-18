import { Platform, Text, type TextProps, type TextStyle } from 'react-native';

import { Fonts, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type AppTextVariant =
  | 'body'
  | 'largeTitle'
  | 'title2'
  | 'subheadline'
  | 'footnote'
  | 'caption2'
  | 'callout'
  | 'link'
  | 'code';

export type AppTextWeight = 'regular' | 'medium' | 'semibold' | 'bold';

export type AppTextProps = TextProps & {
  variant?: AppTextVariant;
  weight?: AppTextWeight;
  themeColor?: ThemeColor;
};

export function AppText({ style, variant = 'body', weight, themeColor, ...rest }: AppTextProps) {
  const theme = useTheme();

  return (
    <Text
      style={[
        { color: theme[themeColor ?? 'text'], fontFamily: Fonts.sans },
        variantStyles[variant],
        weight ? weightStyles[weight] : null,
        variant === 'code' ? { fontFamily: Fonts.mono } : null,
        style,
      ]}
      {...rest}
    />
  );
}

const variantStyles = {
  largeTitle: {
    fontSize: 34,
    lineHeight: 41,
    fontWeight: '700',
  },
  title2: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '600',
  },
  body: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '400',
  },
  callout: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '400',
  },
  subheadline: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '400',
  },
  footnote: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400',
  },
  caption2: {
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '400',
  },
  link: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '400',
  },
  code: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: Platform.select({ android: '700' as const }) ?? '500',
  },
} satisfies Record<AppTextVariant, TextStyle>;

const weightStyles = {
  regular: { fontWeight: '400' },
  medium: { fontWeight: '500' },
  semibold: { fontWeight: '600' },
  bold: { fontWeight: '700' },
} satisfies Record<AppTextWeight, TextStyle>;
