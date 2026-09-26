import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { colors, radius, spacing } from '@/theme';

import { AppText } from './AppText';
import { Button } from './Button';

type Props = {
  visible: boolean;
  title: string;
  message?: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
  keyboardType?: 'default' | 'url';
  onCancel: () => void;
  onSubmit: (value: string) => void;
};

/** Cross-platform text prompt (Alert.prompt only exists on iOS). */
export function PromptModal({ visible, onCancel, ...rest }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      {/* Modal unmounts its children while hidden, so the form starts fresh each time. */}
      <PromptForm onCancel={onCancel} {...rest} />
    </Modal>
  );
}

function PromptForm({
  title,
  message,
  placeholder,
  initialValue = '',
  confirmLabel = 'Save',
  keyboardType = 'default',
  onCancel,
  onSubmit,
}: Omit<Props, 'visible'>) {
  const [value, setValue] = useState(initialValue);

  const submit = () => {
    if (value.trim()) onSubmit(value.trim());
  };

  return (
    <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel="Cancel" />
      <View style={styles.card}>
        <AppText variant="title">{title}</AppText>
        {message ? (
          <AppText variant="small" tone="secondary">
            {message}
          </AppText>
        ) : null}
        <TextInput
          autoFocus
          value={value}
          onChangeText={setValue}
          placeholder={placeholder}
          placeholderTextColor={colors.textTertiary}
          keyboardType={keyboardType}
          autoCapitalize={keyboardType === 'url' ? 'none' : 'sentences'}
          autoCorrect={keyboardType !== 'url'}
          returnKeyType="done"
          onSubmitEditing={submit}
          selectionColor={colors.accent}
          style={styles.input}
        />
        <View style={styles.actions}>
          <Button label="Cancel" variant="secondary" onPress={onCancel} style={styles.action} />
          <Button label={confirmLabel} onPress={submit} disabled={!value.trim()} style={styles.action} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  input: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.text,
    fontSize: 16,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
  },
  action: {
    minWidth: 96,
  },
});
