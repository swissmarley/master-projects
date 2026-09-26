import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, spacing } from '@/theme';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

type SheetProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
};

/** A simple bottom sheet built on the platform modal. */
export function Sheet({ visible, onClose, title, children }: SheetProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.handle} />
        {title ? (
          <AppText variant="title" style={styles.title} numberOfLines={2}>
            {title}
          </AppText>
        ) : null}
        <ScrollView bounces={false} style={styles.scroll}>
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}

type ItemProps = {
  icon: IconName;
  label: string;
  onPress: () => void;
  detail?: string;
  destructive?: boolean;
  selected?: boolean;
};

export function SheetItem({ icon, label, onPress, detail, destructive, selected }: ItemProps) {
  const tint = destructive ? colors.danger : selected ? colors.accent : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
      <Icon name={icon} size={22} color={tint} />
      <View style={styles.itemText}>
        <AppText style={{ color: tint }} numberOfLines={1}>
          {label}
        </AppText>
        {detail ? (
          <AppText variant="caption" tone="tertiary" numberOfLines={1}>
            {detail}
          </AppText>
        ) : null}
      </View>
      {selected ? <Icon name="checkmark" size={20} color={colors.accent} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: spacing.sm,
    maxHeight: '80%',
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  title: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  scroll: {
    flexGrow: 0,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    minHeight: 52,
  },
  itemText: {
    flex: 1,
  },
  pressed: {
    backgroundColor: colors.surfaceRaised,
  },
});
