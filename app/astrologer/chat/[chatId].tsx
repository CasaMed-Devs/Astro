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
import { EmptyView } from '@/components/states/EmptyView';
import { useAuth } from '@/features/auth/context/AuthProvider';
import { fetchAstrologerProfiles } from '@/services/astrologers.service';
import { fetchOlderMessages, sendUserMessage, subscribeToMessages } from '@/services/chat.service';
import type { AstrologerProfile } from '@/features/astrologers/types';
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
  const { profile } = useAuth();
  const [persona, setPersona] = useState<AstrologerProfile | null>(null);
  const [messages, setMessages] = useState<ChatMessageDoc[]>([]);
  // Our own outgoing message + the in-progress reveal of the astrologer's
  // reply, kept out of `messages` so the background poll (which replaces
  // `messages` wholesale every few seconds) can't wipe them out before the
  // server has caught up and persisted them.
  const [localMessages, setLocalMessages] = useState<ChatMessageDoc[]>([]);
  const [oldestSeq, setOldestSeq] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState(initialMessage ?? '');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // No session/time window — access is purely "do you have credits."
  // remainingCredits comes from the server after each message/list fetch.
  const [remainingCredits, setRemainingCredits] = useState<number | null>(null);
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
      .catch(() => setPersona(null));
  }, [personaId]);

  useEffect(() => {
    if (!chatId) return;
    return subscribeToMessages(chatId, ({ messages: fetched, remainingCredits: credits }) => {
      setMessages(fetched);
      if (fetched.length > 0) {
        setOldestSeq(Number(fetched[0].id));
      }
      // Drop local echoes now that the server has persisted the matching message.
      setLocalMessages((prev) =>
        prev.filter(
          (local) => !fetched.some((m) => m.sender === local.sender && m.text === local.text),
        ),
      );
      if (credits != null) setRemainingCredits(credits);
    });
  }, [chatId]);

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

  const revealParagraphs = (paragraphs: string[]) => {
    paragraphs.forEach((paragraph, index) => {
      setTimeout(() => {
        setLocalMessages((prev) => [
          ...prev,
          {
            id: `local-${Date.now()}-${index}`,
            sender: 'astrologer',
            text: paragraph,
            createdAt: new Date().toISOString(),
            status: 'delivered',
          },
        ]);
        if (index === paragraphs.length - 1) {
          setSending(false);
        }
      }, index * PARAGRAPH_REVEAL_MS);
    });
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending) return;

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
      revealParagraphs(result.paragraphs.length > 0 ? result.paragraphs : [result.reply]);
    } catch (err) {
      setLocalMessages((prev) => prev.filter((m) => m.id !== localId));
      const appError = err instanceof AppError ? err : null;
      setError(appError?.message ?? "Couldn't send your message.");
      setSending(false);
    }
  };

  return (
    <Screen padded={false} edges={['top', 'bottom']}>
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

      <KeyboardAvoidingView
        style={[styles.flex, Platform.OS === 'android' && { paddingBottom: androidKeyboardHeight }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <FlatList
          ref={listRef}
          style={styles.flex}
          data={[...messages, ...localMessages]}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messageList}
          renderItem={({ item }) => <ChatBubble message={item} />}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
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
        />

        {error ? (
          <View style={styles.errorBanner}>
            <AppText variant="bodySmall" color={colors.danger}>
              {error}
            </AppText>
            <View style={styles.errorActions}>
              <Pressable onPress={() => router.push('/wallet/topup')}>
                <AppText variant="label" color={colors.primary}>
                  Top up
                </AppText>
              </Pressable>
              <Pressable
                onPress={() =>
                  router.push(profile?.trialCreditsClaimed ? '/paywall/upgrade' : '/paywall')
                }
              >
                <AppText variant="label" color={colors.primary}>
                  Upgrade
                </AppText>
              </Pressable>
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
    paddingBottom: spacing.md,
  },
  composerInput: { flex: 1, minHeight: 48 },
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
