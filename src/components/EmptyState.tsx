import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/theme';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

type Props = {
  icon: IconName;
  title: string;
  message?: string;
  children?: ReactNode;
};

export function EmptyState({ icon, title, message, children }: Props) {
  return (
    <View style={styles.container}>
      <Icon name={icon} size={44} color={colors.textTertiary} />
      <AppText variant="title" style={styles.center}>
        {title}
      </AppText>
      {message ? (
        <AppText variant="small" tone="secondary" style={styles.center}>
          {message}
        </AppText>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.xxl,
  },
  center: {
    textAlign: 'center',
  },
});
