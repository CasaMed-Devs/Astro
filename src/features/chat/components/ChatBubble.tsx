import { StyleSheet, Text, View } from 'react-native';

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

// The astrologer's replies mark bold with *text* (or **text**) — render those
// spans as real bold text instead of showing the asterisks.
function renderBold(text: string) {
  return text.split(/(\*{1,2}[^*\n]+\*{1,2})/g).map((part, index) => {
    const match = part.match(/^(\*{1,2})([^*\n]+)\1$/);
    if (!match) return part;
    return (
      <Text key={index} style={styles.bold}>
        {match[2]}
      </Text>
    );
  });
}

export function ChatBubble({ message }: ChatBubbleProps) {
  const isUser = message.sender === 'user';
  const timing = formatMetaValue(message.meta?.timing);
  const remedy = formatMetaValue(message.meta?.remedy);

  return (
    <View style={[styles.row, isUser ? styles.rowEnd : styles.rowStart]}>
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAstrologer]}>
        <AppText variant="body" color={isUser ? colors.onGradientText : colors.textPrimary}>
          {isUser ? message.text : renderBold(message.text)}
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
  bold: { fontWeight: '700' },
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
