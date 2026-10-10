import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';

import { AppText } from '@/components/common/AppText';
import { Screen } from '@/components/common/Screen';
import { ErrorView } from '@/components/states/ErrorView';
import { LoadingView } from '@/components/states/LoadingView';
import { LEGAL_DOCS, type LegalDocId } from '@/constants/legal';
import { colors, radii, spacing } from '@/constants/theme';

/**
 * Loaded lazily, like react-native-razorpay in payment.service.ts: an app
 * binary built before react-native-webview was added doesn't contain its
 * native module, and a top-level import would crash this screen.
 */
function loadWebView(): typeof import('react-native-webview').WebView | null {
  try {
    return require('react-native-webview').WebView;
  } catch {
    return null;
  }
}

const WebView = loadWebView();

export default function LegalDocScreen() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const legalDoc = doc && doc in LEGAL_DOCS ? LEGAL_DOCS[doc as LegalDocId] : undefined;
  const [failed, setFailed] = useState(false);
  // Bumped on retry so the WebView remounts and loads from scratch.
  const [attempt, setAttempt] = useState(0);

  // No WebView in this build — fall back to the browser rather than a dead screen.
  useEffect(() => {
    if (WebView || !legalDoc) return;
    Linking.openURL(legalDoc.url).catch(() => {});
    router.back();
  }, [legalDoc]);

  return (
    <Screen padded={false} avoidKeyboard={false}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={8}>
          <ArrowLeft size={20} color={colors.textPrimary} />
        </Pressable>
        <AppText variant="cardTitle" numberOfLines={1} style={styles.title}>
          {legalDoc?.title ?? 'Not found'}
        </AppText>
      </View>

      {!legalDoc || !WebView ? (
        <ErrorView title="Page not found" message="This page is not available." />
      ) : failed ? (
        <ErrorView
          title="Could not load this page"
          message="Check your internet connection and try again."
          onRetry={() => {
            setFailed(false);
            setAttempt((prev) => prev + 1);
          }}
        />
      ) : (
        <WebView
          key={attempt}
          source={{ uri: legalDoc.url }}
          style={styles.webView}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.loading}>
              <LoadingView />
            </View>
          )}
          onError={() => setFailed(true)}
          onHttpError={() => setFailed(true)}
          // The policy itself stays in the app; anything it links out to
          // (email addresses, other sites) goes to the system handler.
          onShouldStartLoadWithRequest={(request) => {
            if (request.url.startsWith(legalDoc.url)) return true;
            Linking.openURL(request.url).catch(() => {});
            return false;
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1 },
  webView: { flex: 1, backgroundColor: colors.surface },
  loading: { ...StyleSheet.absoluteFill, backgroundColor: colors.surface },
});
