import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Send } from 'lucide-react-native';

import { AppText } from '@/components/common/AppText';
import { Input } from '@/components/forms/Input';
import { Screen } from '@/components/common/Screen';
import { ChatBubble } from '@/features/chat/components/ChatBubble';
import { EmptyView } from '@/components/states/EmptyView';
import { getPersonaById } from '@/features/astrologers/config/personas';
import { sendUserMessage, subscribeToMessages } from '@/services/chat.service';
import { colors, radii, spacing } from '@/constants/theme';
import { AppError } from '@/utils/errors';
import type { ChatMessageDoc } from '@/types/firestore';

// TEMPORARY DEV UI-PREVIEW FALLBACK — when the backend/AI isn't reachable
// or configured, show a local canned reply instead of an error banner, so
// the chat UI (bubbles, layout) is browsable while the backend is still
// being set up. Kept separate from the real (Firestore-backed) messages
// so it never gets persisted or mistaken for a real reply.
// TO REVERT: delete DEV_FALLBACK_REPLIES, devMessages state, and the
// `if (__DEV__ ...)` branch in the catch block below.
const DEV_FALLBACK_REPLIES = [
  'The stars suggest patience serves you well on this one — give it a little more time before deciding.',
  'Your chart shows real strength here. Trust the instinct you already have.',
  "This is a good period for reflection rather than big moves. Let's revisit it in a few weeks.",
];

let devFallbackCounter = 0;

export default function ChatScreen() {
  const { chatId, personaId } = useLocalSearchParams<{ chatId: string; personaId: string }>();
  const persona = getPersonaById(personaId);
  const [messages, setMessages] = useState<ChatMessageDoc[]>([]);
  const [devMessages, setDevMessages] = useState<ChatMessageDoc[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    if (!chatId) return;
    return subscribeToMessages(chatId, setMessages);
  }, [chatId]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending) return;

    setDraft('');
    setSending(true);
    setError(null);
    try {
      await sendUserMessage(chatId, personaId, text);
    } catch (err) {
      const appError = err instanceof AppError ? err : null;

      if (appError?.code === 'credits/insufficient') {
        setError(appError.message);
      } else if (__DEV__) {
        console.warn(
          '[DEV CHAT FALLBACK] Backend/AI unavailable, showing a local canned reply so the chat UI is browsable:',
          err,
        );
        devFallbackCounter += 1;
        setDevMessages((prev) => [
          ...prev,
          {
            id: `dev-fallback-${devFallbackCounter}`,
            sender: 'astrologer',
            text: DEV_FALLBACK_REPLIES[devFallbackCounter % DEV_FALLBACK_REPLIES.length],
            createdAt: null as unknown as ChatMessageDoc['createdAt'],
            status: 'delivered',
          },
        ]);
      } else {
        setError(appError ? appError.message : "Couldn't send your message.");
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen padded={false} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={20} color={colors.textPrimary} />
        </Pressable>
        <AppText variant="cardTitle">{persona?.name ?? 'Astrologer'}</AppText>
      </View>

      <FlatList
        ref={listRef}
        data={[...messages, ...devMessages]}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messageList}
        renderItem={({ item }) => <ChatBubble message={item} />}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <EmptyView
            title="Start the conversation"
            message={`Ask ${persona?.name ?? 'your astrologer'} anything on your mind.`}
          />
        }
      />

      {error ? (
        <Pressable onPress={() => router.push('/paywall')} style={styles.errorBanner}>
          <AppText variant="bodySmall" color={colors.danger}>
            {error}
          </AppText>
        </Pressable>
      ) : null}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.composer}>
          <Input
            value={draft}
            onChangeText={setDraft}
            placeholder="Type your question..."
            containerStyle={styles.composerInput}
            multiline
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  backButton: { padding: spacing.xs },
  messageList: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md, flexGrow: 1 },
  errorBanner: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.sm,
    padding: spacing.sm,
    backgroundColor: '#FCEBEB',
    borderRadius: radii.sm,
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
