import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { colors, radii, spacing } from '@/constants/theme';
import type { ChatMessageDoc } from '@/types/firestore';

type ChatBubbleProps = {
  message: ChatMessageDoc;
};

function formatMetaValue(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.values(record).filter((v) => typeof v === 'string' || typeof v === 'number').join(' · ');
  }
  return String(value);
}

export function ChatBubble({ message }: ChatBubbleProps) {
  const isUser = message.sender === 'user';
  const timing = formatMetaValue(message.meta?.timing);
  const remedy = formatMetaValue(message.meta?.remedy);

  return (
    <View style={[styles.row, isUser ? styles.rowEnd : styles.rowStart]}>
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAstrologer]}>
        <AppText variant="body" color={isUser ? colors.onGradientText : colors.textPrimary}>
          {message.text}
        </AppText>
      </View>
      {!isUser && (timing || remedy) ? (
        <View style={styles.metaCard}>
          {timing ? (
            <AppText variant="caption" color={colors.textSecondary}>
              Timing: {timing}
            </AppText>
          ) : null}
          {remedy ? (
            <AppText variant="caption" color={colors.textSecondary}>
              Remedy: {remedy}
            </AppText>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginVertical: 4 },
  rowStart: { alignItems: 'flex-start' },
  rowEnd: { alignItems: 'flex-end' },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
  },
  bubbleUser: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleAstrologer: { backgroundColor: colors.surface, borderBottomLeftRadius: 4 },
  metaCard: {
    maxWidth: '80%',
    marginTop: 4,
    padding: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
    gap: 2,
  },
});
