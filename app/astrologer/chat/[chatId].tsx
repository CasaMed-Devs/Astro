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
  const [persona, setPersona] = useState<AstrologerProfile | null>(null);
  const [messages, setMessages] = useState<ChatMessageDoc[]>([]);
  const [oldestSeq, setOldestSeq] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState(initialMessage ?? '');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);
  const extraContext = useRef(parseContext(context)).current;

  useEffect(() => {
    fetchAstrologerProfiles()
      .then((profiles) => setPersona(profiles.find((p) => p.id === personaId) ?? null))
      .catch(() => setPersona(null));
  }, [personaId]);

  useEffect(() => {
    if (!chatId) return;
    return subscribeToMessages(chatId, (fetched) => {
      setMessages(fetched);
      if (fetched.length > 0) {
        setOldestSeq(Number(fetched[0].id));
      }
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
        setMessages((prev) => [
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

    setDraft('');
    setSending(true);
    setError(null);
    try {
      const result = await sendUserMessage(chatId, personaId, text, extraContext);
      revealParagraphs(result.paragraphs.length > 0 ? result.paragraphs : [result.reply]);
    } catch (err) {
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
        <AppText variant="cardTitle">{persona?.name ?? 'Astrologer'}</AppText>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
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
            <EmptyView title="Start the conversation" message="Ask your astrologer anything on your mind." />
          )
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  backButton: { padding: spacing.xs },
  messageList: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md, flexGrow: 1 },
  loadOlder: { alignItems: 'center', paddingVertical: spacing.sm },
  greetingRow: { marginTop: spacing.md },
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
