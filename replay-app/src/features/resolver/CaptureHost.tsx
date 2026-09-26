import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { allowWebNavigation, userAgentProps } from '@/features/browser/constants';
import { watchUrl } from '@/features/youtube/url';

import { captureService } from './capture-service';

type Job = { videoId: string; script: string; attempt: number };

/**
 * Invisible WebView used by the Brave-style capture resolver. It only exists
 * while a capture is running and shares cookies with the visible browser.
 */
export function CaptureHost() {
  const [job, setJob] = useState<Job | null>(null);

  useEffect(
    () =>
      captureService.attach({
        start: (videoId, script) => setJob((previous) => ({ videoId, script, attempt: (previous?.attempt ?? 0) + 1 })),
        stop: () => setJob(null),
      }),
    [],
  );

  if (!job) return null;
  return (
    <View pointerEvents="none" style={styles.host} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <WebView
        key={`${job.videoId}:${job.attempt}`}
        source={{ uri: watchUrl(job.videoId) }}
        injectedJavaScriptBeforeContentLoaded={job.script}
        injectedJavaScriptBeforeContentLoadedForMainFrameOnly
        onMessage={(event) => captureService.handleMessage(event.nativeEvent.data)}
        onShouldStartLoadWithRequest={allowWebNavigation}
        // The page must be allowed to start the (muted) player on its own.
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        setSupportMultipleWindows={false}
        sharedCookiesEnabled
        style={styles.webview}
        {...userAgentProps}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    width: 2,
    height: 2,
    opacity: 0,
    overflow: 'hidden',
  },
  webview: {
    width: 320,
    height: 180,
  },
});
