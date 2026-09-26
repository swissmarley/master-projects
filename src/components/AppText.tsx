import { StyleSheet, Text, type TextProps } from 'react-native';

import { colors, fontSize } from '@/theme';

type Variant = 'display' | 'heading' | 'title' | 'body' | 'small' | 'caption' | 'label';
type Tone = 'primary' | 'secondary' | 'tertiary' | 'accent' | 'danger';

type Props = TextProps & {
  variant?: Variant;
  tone?: Tone;
};

const toneColor: Record<Tone, string> = {
  primary: colors.text,
  secondary: colors.textSecondary,
  tertiary: colors.textTertiary,
  accent: colors.accent,
  danger: colors.danger,
};

export function AppText({ variant = 'body', tone = 'primary', style, ...rest }: Props) {
  return <Text style={[styles[variant], { color: toneColor[tone] }, style]} {...rest} />;
}

const styles = StyleSheet.create({
  display: { fontSize: fontSize.display, fontWeight: '700', letterSpacing: -0.4 },
  heading: { fontSize: fontSize.heading, fontWeight: '700', letterSpacing: -0.2 },
  title: { fontSize: fontSize.title, fontWeight: '600' },
  body: { fontSize: fontSize.body, lineHeight: 21 },
  small: { fontSize: fontSize.small, lineHeight: 18 },
  caption: { fontSize: fontSize.caption, lineHeight: 16 },
  label: { fontSize: fontSize.small, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
});
