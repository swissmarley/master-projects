import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { ToastHost } from '@/components/Toast';
import { CaptureHost } from '@/features/resolver/CaptureHost';
import { colors } from '@/theme';

export const unstable_settings = {
  // Deep links (e.g. /add?v=…) open on top of the tabs, so "back" works.
  initialRouteName: '(tabs)',
};

const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accent,
    background: colors.background,
    card: colors.background,
    text: colors.text,
    border: colors.border,
    notification: colors.accent,
  },
};

export default function RootLayout() {
  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="playlist/[id]" options={{ title: '', headerBackTitle: 'Playlists' }} />
        <Stack.Screen name="player" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="add" options={{ presentation: 'transparentModal', headerShown: false, animation: 'fade' }} />
      </Stack>
      {/* Hidden WebView for Brave-style stream capture (only mounted while capturing). */}
      <CaptureHost />
      <ToastHost />
    </ThemeProvider>
  );
}
