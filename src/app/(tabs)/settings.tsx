import Constants from 'expo-constants';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { showToast } from '@/components/Toast';
import { streamResolver } from '@/features/resolver';
import { normalizeBaseUrl } from '@/features/resolver/remote-resolver';
import { useSettings, VIDEO_HEIGHTS, type Settings } from '@/features/settings';
import { colors, radius, spacing } from '@/theme';

function Section({ title, footer, children }: { title: string; footer?: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <AppText variant="label" tone="tertiary" style={styles.sectionTitle}>
        {title}
      </AppText>
      <View style={styles.card}>{children}</View>
      {footer ? (
        <AppText variant="caption" tone="tertiary" style={styles.sectionFooter}>
          {footer}
        </AppText>
      ) : null}
    </View>
  );
}

function Row({ label, detail, children }: { label: string; detail?: string; children?: ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <AppText>{label}</AppText>
        {detail ? (
          <AppText variant="caption" tone="secondary">
            {detail}
          </AppText>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function Toggle({ label, detail, value, onChange }: { label: string; detail?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Row label={label} detail={detail}>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.accent, false: colors.border }}
        thumbColor={colors.text}
      />
    </Row>
  );
}

function Choice<T extends string | number>({
  label,
  detail,
  value,
  options,
  onChange,
}: {
  label: string;
  detail?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.choice}>
      <View style={styles.rowText}>
        <AppText>{label}</AppText>
        {detail ? (
          <AppText variant="caption" tone="secondary">
            {detail}
          </AppText>
        ) : null}
      </View>
      <View style={styles.pills} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={String(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => onChange(option.value)}
              style={[styles.pill, selected && styles.pillSelected]}>
              <AppText variant="small" style={{ color: selected ? colors.background : colors.textSecondary }}>
                {option.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const settings = useSettings();
  const update = (patch: Partial<Settings>) => useSettings.getState().update(patch);
  const remoteUrlValid = settings.remoteKind === 'off' || normalizeBaseUrl(settings.remoteUrl) !== null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.sm }]}
      keyboardShouldPersistTaps="handled">
      <AppText variant="display" style={styles.title}>
        Settings
      </AppText>

      <Section title="Playback">
        <Choice
          label="Start playlists in"
          value={settings.defaultMode}
          options={[
            { value: 'audio', label: 'Audio' },
            { value: 'video', label: 'Video' },
          ]}
          onChange={(defaultMode) => update({ defaultMode })}
        />
        <Choice
          label="Audio quality"
          detail="Data saver uses the smallest audio stream."
          value={settings.audioQuality}
          options={[
            { value: 'high', label: 'High' },
            { value: 'low', label: 'Data saver' },
          ]}
          onChange={(audioQuality) => update({ audioQuality })}
        />
        <Choice
          label="Maximum video quality"
          value={settings.videoMaxHeight}
          options={VIDEO_HEIGHTS.map((h) => ({ value: h, label: `${h}p` }))}
          onChange={(videoMaxHeight) => update({ videoMaxHeight })}
        />
        <Toggle
          label="Picture in picture"
          detail="In video mode, keep watching in a floating window when you leave the app."
          value={settings.pictureInPicture}
          onChange={(pictureInPicture) => update({ pictureInPicture })}
        />
      </Section>

      <Section title="Browser">
        <Toggle
          label="Quick-add buttons"
          detail="Show + buttons on YouTube thumbnails to add without opening the video."
          value={settings.quickAdd}
          onChange={(quickAdd) => update({ quickAdd })}
        />
      </Section>

      <Section
        title="Stream sources"
        footer="Replay tries these in order. If YouTube changes something and videos stop loading, a self-hosted Piped or Invidious instance is the most reliable fallback.">
        <Toggle
          label="On-device"
          detail="Asks YouTube directly from your phone. Fast, and works in the background."
          value={settings.useInnertube}
          onChange={(useInnertube) => update({ useInnertube })}
        />
        <Choice
          label="Server fallback"
          value={settings.remoteKind}
          options={[
            { value: 'off', label: 'Off' },
            { value: 'piped', label: 'Piped' },
            { value: 'invidious', label: 'Invidious' },
          ]}
          onChange={(remoteKind) => update({ remoteKind })}
        />
        {settings.remoteKind !== 'off' ? (
          <View style={styles.inputRow}>
            <TextInput
              accessibilityLabel="Server address"
              value={settings.remoteUrl}
              onChangeText={(remoteUrl) => update({ remoteUrl })}
              placeholder={settings.remoteKind === 'piped' ? 'https://pipedapi.example.com' : 'https://invidious.example.com'}
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              selectionColor={colors.accent}
              style={styles.input}
            />
            {!remoteUrlValid ? (
              <AppText variant="caption" tone="danger">
                Enter the full address, starting with https://
              </AppText>
            ) : null}
          </View>
        ) : null}
        <Toggle
          label="YouTube page capture"
          detail="Brave-style fallback: lets YouTube's own player find the stream. Slower, and only while the app is open."
          value={settings.useWebViewCapture}
          onChange={(useWebViewCapture) => update({ useWebViewCapture })}
        />
        <View style={styles.buttonRow}>
          <Button
            label="Clear stream cache"
            variant="secondary"
            icon="refresh"
            onPress={() => {
              streamResolver.cache.clear();
              showToast('Stream cache cleared', { icon: 'checkmark-circle' });
            }}
          />
        </View>
      </Section>

      <Section title="About">
        <Row label="Version" detail={`Replay ${Constants.expoConfig?.version ?? ''}`} />
        <Row
          label="Personal use"
          detail="Replay plays YouTube videos outside YouTube's own player, in the background and on the lock screen. This may conflict with YouTube's Terms of Service. Use it for personal, educational purposes."
        />
      </Section>

      <View style={styles.buttonRow}>
        <Button label="Reset settings" variant="danger" onPress={() => useSettings.getState().reset()} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.xl,
  },
  title: {
    marginBottom: -spacing.sm,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    paddingHorizontal: spacing.xs,
  },
  sectionFooter: {
    paddingHorizontal: spacing.xs,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  choice: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
  },
  pillSelected: {
    backgroundColor: colors.text,
  },
  inputRow: {
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  input: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    color: colors.text,
    fontSize: 15,
  },
  buttonRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
});
