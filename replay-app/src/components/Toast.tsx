import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { colors, radius, spacing } from '@/theme';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

type ToastAction = { label: string; onPress: () => void };

type ToastState = {
  id: number;
  message: string | null;
  icon?: IconName;
  action?: ToastAction;
};

const useToastStore = create<ToastState>(() => ({ id: 0, message: null }));

/** Shows a short message above the tab bar. */
export function showToast(message: string, options: { icon?: IconName; action?: ToastAction } = {}) {
  useToastStore.setState((s) => ({ id: s.id + 1, message, icon: options.icon, action: options.action }));
}

const VISIBLE_MS = 2600;

export function ToastHost() {
  const { id, message, icon, action } = useToastStore();
  const insets = useSafeAreaInsets();
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!message) return;
    Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(() =>
        useToastStore.setState({ message: null }),
      );
    }, VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [id, message, opacity]);

  if (!message) return null;
  return (
    <View pointerEvents="box-none" style={[styles.host, { top: insets.top + spacing.sm }]}>
      <Animated.View style={[styles.toast, { opacity }]} accessibilityLiveRegion="polite">
        {icon ? <Icon name={icon} size={18} color={colors.accent} /> : null}
        <AppText variant="small" style={styles.text} numberOfLines={2}>
          {message}
        </AppText>
        {action ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              action.onPress();
              useToastStore.setState({ message: null });
            }}
            hitSlop={8}>
            <AppText variant="small" tone="accent" style={styles.action}>
              {action.label}
            </AppText>
          </Pressable>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    maxWidth: 520,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  text: {
    flexShrink: 1,
  },
  action: {
    fontWeight: '700',
  },
});
