import { BottomTabBar, Tabs } from 'expo-router/js-tabs';
import { View } from 'react-native';

import { Icon } from '@/components/Icon';
import { MiniPlayer } from '@/features/player/components/MiniPlayer';
import { colors } from '@/theme';

export default function TabLayout() {
  return (
    <Tabs
      // The mini player sits on top of the tab bar, like in music apps.
      tabBar={(props) => (
        <View>
          <MiniPlayer />
          <BottomTabBar {...props} />
        </View>
      )}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Browse',
          tabBarIcon: ({ color, size }) => <Icon name="logo-youtube" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: 'Playlists',
          tabBarIcon: ({ color, size }) => <Icon name="albums" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Icon name="settings-outline" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
