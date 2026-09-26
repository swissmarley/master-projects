import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius } from '@/theme';

import { Icon, type IconName } from './Icon';

type Props = {
  icon: IconName;
  label: string;
  onPress?: () => void;
  onLongPress?: () => void;
  size?: number;
  color?: string;
  disabled?: boolean;
  /** Filled circular background (used for the main play button). */
  filled?: boolean;
  active?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function IconButton({
  icon,
  label,
  onPress,
  onLongPress,
  size = 24,
  color,
  disabled,
  filled,
  active,
  style,
}: Props) {
  const tint = color ?? (filled ? colors.background : active ? colors.accent : colors.text);
  const box = filled ? size * 2.4 : size + 20;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected: active }}
      hitSlop={8}
      disabled={disabled}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.base,
        { width: box, height: box, borderRadius: radius.pill },
        filled && styles.filled,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}>
      <Icon name={icon} size={size} color={tint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  filled: {
    backgroundColor: colors.text,
  },
  pressed: {
    opacity: 0.6,
  },
  disabled: {
    opacity: 0.35,
  },
});
