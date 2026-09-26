import { router, Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { colors } from '@/theme';

export default function NotFoundScreen() {
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: '' }} />
      <EmptyState icon="compass-outline" title="Nothing here" message="This link doesn't lead anywhere in Replay.">
        <Button label="Go to YouTube" variant="secondary" onPress={() => router.replace('/')} />
      </EmptyState>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
