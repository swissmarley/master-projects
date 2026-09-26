/** Replay is a dark, media-first app (like Brave's playlist player). */
export const colors = {
  background: '#0B0B0F',
  surface: '#15151C',
  surfaceRaised: '#1E1E27',
  border: '#2A2A35',
  text: '#F4F4F6',
  textSecondary: '#A6A6B0',
  textTertiary: '#6E6E7A',
  accent: '#FF3B5C',
  accentMuted: 'rgba(255, 59, 92, 0.16)',
  danger: '#FF5A5F',
  success: '#34C759',
  overlay: 'rgba(0, 0, 0, 0.6)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
} as const;

export const fontSize = {
  caption: 12,
  small: 13,
  body: 15,
  title: 17,
  heading: 22,
  display: 28,
} as const;
