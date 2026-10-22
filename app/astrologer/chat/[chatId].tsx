import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Send } from 'lucide-react-native';

import { AppText } from '@/components/common/AppText';
import { Input } from '@/components/forms/Input';
import { Screen } from '@/components/common/Screen';
import { ChatBubble } from '@/features/chat/components/ChatBubble';
import { TypingIndicator } from '@/features/chat/components/TypingIndicator';
import { EmptyView } from '@/components/states/EmptyView';
import { ErrorView } from '@/components/states/ErrorView';
import { SandTimerLoader } from '@/components/states/SandTimerLoader';
import { useAuth } from '@/features/auth/context/AuthProvider';
import { fetchAstrologerProfiles } from '@/services/astrologers.service';
import {
  fetchOlderMessages,
  sendUserMessage,
  subscribeToMessages,
  type MessagesUpdate,
} from '@/services/chat.service';
import type { AstrologerProfile } from '@/features/astrologers/types';
import { getOutOfCreditsRoute, getPaywallRoute, hasAccess } from '@/utils/paywall';
import { colors, radii, spacing } from '@/constants/theme';
import { AppError } from '@/utils/errors';
import type { ChatMessageDoc } from '@/types/firestore';

const PARAGRAPH_REVEAL_MS = 1200;

function parseContext(raw?: string): Record<string, string> | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export default function ChatScreen() {
  const { chatId, personaId, context, initialMessage } = useLocalSearchParams<{
    chatId: string;
    personaId: string;
    context?: string;
    initialMessage?: string;
  }>();
  const { profile, syncCredits } = useAuth();
  const [persona, setPersona] = useState<AstrologerProfile | null>(null);
  const [messages, setMessages] = useState<ChatMessageDoc[]>([]);
  // Our own outgoing message + the in-progress reveal of the astrologer's
  // reply, kept out of `messages` so the background poll (which replaces
  // `messages` wholesale every few seconds) can't wipe them out before the
  // server has caught up and persisted them.
  const [localMessages, setLocalMessages] = useState<(ChatMessageDoc & { fullReply?: string })[]>([]);
  const [oldestSeq, setOldestSeq] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState(initialMessage ?? '');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // No session/time window — access is purely "do you have credits."
  // remainingCredits comes from the server after each message/list fetch.
  const [remainingCredits, setRemainingCredits] = useState<number | null>(null);
  // The screen stays behind a loader until the chat history has arrived (and
  // the astrologer lookup has settled), so it opens fully formed instead of
  // flashing the greeting and then jumping to the real history.
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [personaLoaded, setPersonaLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const historyLoadedRef = useRef(false);
  // The first scroll to the newest message happens without animation, so the
  // chat appears already at the bottom.
  const scrolledInitiallyRef = useRef(false);

  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Home, Profile and the wallet all show the balance from the shared
  // profile, so pass every balance the server reports here on to it.
  useEffect(() => {
    if (remainingCredits != null) syncCredits(remainingCredits);
  }, [remainingCredits, syncCredits]);
  const listRef = useRef<FlatList>(null);
  const extraContext = useRef(parseContext(context)).current;
  const insets = useSafeAreaInsets();
  // Android: RN's KeyboardAvoidingView under-computes the offset with
  // edge-to-edge enabled (android/gradle.properties has edgeToEdgeEnabled=true),
  // so drive it ourselves from raw keyboard-frame events instead. iOS doesn't
  // have this problem and keeps using KeyboardAvoidingView below.
  const [androidKeyboardHeight, setAndroidKeyboardHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      setAndroidKeyboardHeight(Math.max(0, e.endCoordinates.height - insets.bottom));
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setAndroidKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [insets.bottom]);

  useEffect(() => {
    fetchAstrologerProfiles()
      .then((profiles) => setPersona(profiles.find((p) => p.id === personaId) ?? null))
      .catch(() => setPersona(null))
      .finally(() => setPersonaLoaded(true));
  }, [personaId]);

  useEffect(() => {
    if (!chatId) return;
    const onUpdate = ({
      messages: fetched,
      remainingCredits: credits,
      hasMore: more,
      fromCache,
    }: MessagesUpdate) => {
      // Only the first server page decides whether older history exists;
      // later polls return the same latest window and must not reset it
      // after the user has paged back.
      if (!fromCache && !historyLoadedRef.current && more != null) setHasMore(more);
      if (!fromCache || fetched.length > 0) {
        historyLoadedRef.current = true;
        setHistoryLoaded(true);
        setLoadFailed(false);
      }
      // The poll only returns the latest window of messages. Merge instead of
      // replacing so earlier pages fetched via "load earlier" (which have a
      // lower seq than this window's start) aren't wiped out on the next tick.
      setMessages((prev) => {
        if (fetched.length === 0) return prev;
        const fetchedStart = Number(fetched[0].id);
        const olderKept = prev.filter((m) => Number(m.id) < fetchedStart);
        return [...olderKept, ...fetched];
      });
      if (fetched.length > 0) {
        setOldestSeq((prevOldest) =>
          prevOldest != null ? Math.min(prevOldest, Number(fetched[0].id)) : Number(fetched[0].id),
        );
      }
      // Drop local echoes now that the server has persisted the matching message.
      setLocalMessages((prev) =>
        prev.filter(
          (local) => !fetched.some((m) => m.sender === local.sender && (m.text === local.text || (local.fullReply && m.text === local.fullReply))),
        ),
      );
      if (credits != null) setRemainingCredits(credits);
    };
    // A failure only matters before the history has loaded once; after that
    // the background poll just retries on its next tick.
    const onError = () => {
      if (!historyLoadedRef.current) setLoadFailed(true);
    };
    return subscribeToMessages(chatId, onUpdate, onError);
  }, [chatId, reloadKey]);

  const retryLoad = () => {
    setLoadFailed(false);
    setReloadKey((key) => key + 1);
  };

  const handleLoadOlder = async () => {
    if (oldestSeq == null || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const older = await fetchOlderMessages(chatId, oldestSeq);
      setMessages((prev) => [...older.messages, ...prev]);
      setHasMore(older.hasMore);
      if (older.messages.length > 0) {
        setOldestSeq(Number(older.messages[0].id));
      }
    } catch {
      // Transient failure — user can tap "load earlier" again.
    } finally {
      setLoadingOlder(false);
    }
  };

  const revealParagraphs = (paragraphs: string[], fullReply: string) => {
    paragraphs.forEach((paragraph, index) => {
      setTimeout(() => {
        setLocalMessages((prev) => {
          if (messagesRef.current.some((m) => m.sender === 'astrologer' && (m.text === paragraph || m.text === fullReply))) {
            return prev;
          }
          return [
            ...prev,
            {
              id: `local-${Date.now()}-${index}`,
              sender: 'astrologer',
              text: paragraph,
              fullReply,
              createdAt: new Date().toISOString(),
              status: 'delivered',
            },
          ];
        });
        if (index === paragraphs.length - 1) {
          setSending(false);
        }
      }, index * PARAGRAPH_REVEAL_MS);
    });
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending) return;

    // No credits at all — don't even attempt the send. Trial/subscribed users
    // go to top-up, everyone else to the paywall, rather than a dismissable
    // error banner.
    if (remainingCredits != null && remainingCredits <= 0) {
      router.push(getOutOfCreditsRoute(profile));
      return;
    }

    const localId = `local-${Date.now()}`;
    setDraft('');
    setSending(true);
    setError(null);
    setLocalMessages((prev) => [
      ...prev,
      { id: localId, sender: 'user', text, createdAt: new Date().toISOString(), status: 'sent' },
    ]);
    try {
      const result = await sendUserMessage(chatId, personaId, text, extraContext);
      setRemainingCredits(result.remainingCredits);
      revealParagraphs(
        result.paragraphs.length > 0 ? result.paragraphs : [result.reply],
        result.reply
      );
    } catch (err) {
      setLocalMessages((prev) => prev.filter((m) => m.id !== localId));
      const appError = err instanceof AppError ? err : null;
      setSending(false);
      if (appError?.code === 'credits/insufficient') {
        // Same rule applies if credits ran out server-side since our last
        // sync (e.g. a race with another device).
        router.push(getOutOfCreditsRoute(profile));
        return;
      }
      setError(appError?.message ?? "Couldn't send your message.");
    }
  };

  return (
    <Screen padded={false} edges={['top', 'bottom']} avoidKeyboard={false}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={20} color={colors.textPrimary} />
        </Pressable>
        {persona?.photoUrl ? (
          <Image source={{ uri: persona.photoUrl }} style={styles.headerAvatar} />
        ) : null}
        <AppText variant="cardTitle" style={styles.headerName}>
          {persona?.name ?? 'Astrologer'}
        </AppText>
        {remainingCredits != null ? (
          <AppText variant="caption" color={colors.textMuted}>
            {remainingCredits} credits
          </AppText>
        ) : null}
      </View>

      {!historyLoaded || !personaLoaded ? (
        loadFailed ? (
          <ErrorView
            title="Couldn't load this chat"
            message="Check your connection and try again."
            onRetry={retryLoad}
          />
        ) : (
          <SandTimerLoader message="Loading your conversation..." />
        )
      ) : (
      <KeyboardAvoidingView
        style={[styles.flex, Platform.OS === 'android' && { paddingBottom: androidKeyboardHeight }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <FlatList
          ref={listRef}
          style={styles.flex}
          data={[
            ...messages,
            ...localMessages.filter(
              (local) => !messages.some((m) => m.sender === local.sender && (m.text === local.text || (local.fullReply && m.text === local.fullReply)))
            ),
          ]}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messageList}
          renderItem={({ item }) => <ChatBubble message={item} />}
          onContentSizeChange={() => {
            listRef.current?.scrollToEnd({ animated: scrolledInitiallyRef.current });
            scrolledInitiallyRef.current = true;
          }}
          ListHeaderComponent={
            hasMore ? (
              <Pressable onPress={handleLoadOlder} style={styles.loadOlder} disabled={loadingOlder}>
                <AppText variant="bodySmall" color={colors.primary}>
                  {loadingOlder ? 'Loading...' : 'Load earlier messages'}
                </AppText>
              </Pressable>
            ) : null
          }
          ListEmptyComponent={
            persona ? (
              <View style={styles.greetingRow}>
                <ChatBubble
                  message={{
                    id: 'greeting',
                    sender: 'astrologer',
                    text: persona.greeting,
                    createdAt: null,
                    status: 'delivered',
                  }}
                />
              </View>
            ) : (
              <EmptyView
                title="Start the conversation"
                message="Ask your astrologer anything on your mind."
              />
            )
          }
          ListFooterComponent={sending ? <TypingIndicator /> : null}
        />

        {error ? (
          <View style={styles.errorBanner}>
            <AppText variant="bodySmall" color={colors.danger}>
              {error}
            </AppText>
            <View style={styles.errorActions}>
              {hasAccess(profile) ? (
                <Pressable onPress={() => router.push('/wallet/topup')}>
                  <AppText variant="label" color={colors.primary}>
                    Top up
                  </AppText>
                </Pressable>
              ) : (
                <Pressable onPress={() => router.push(getPaywallRoute(profile))}>
                  <AppText variant="label" color={colors.primary}>
                    Upgrade
                  </AppText>
                </Pressable>
              )}
            </View>
          </View>
        ) : null}

        <View style={styles.composer}>
          <Input
            value={draft}
            onChangeText={setDraft}
            placeholder="Type your question..."
            containerStyle={styles.composerInput}
            multiline
            editable={!sending}
          />
          <Pressable
            onPress={handleSend}
            disabled={sending || !draft.trim()}
            style={[styles.sendButton, (sending || !draft.trim()) && styles.sendButtonDisabled]}
          >
            <Send size={18} color={colors.onGradientText} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  backButton: { padding: spacing.xs },
  headerAvatar: { width: 36, height: 36, borderRadius: radii.md },
  headerName: { flex: 1 },
  messageList: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md, flexGrow: 1 },
  loadOlder: { alignItems: 'center', paddingVertical: spacing.sm },
  greetingRow: { marginTop: spacing.md },
  errorBanner: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.sm,
    padding: spacing.sm,
    backgroundColor: '#FCEBEB',
    borderRadius: radii.sm,
    gap: spacing.xs,
  },
  errorActions: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  composerInput: { flex: 1, minHeight: 58 },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: radii.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: { opacity: 0.5 },
});
