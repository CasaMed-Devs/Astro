import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { colors, radii, spacing } from '@/constants/theme';
import type { ChatMessageDoc } from '@/types/firestore';

type ChatBubbleProps = {
  message: ChatMessageDoc;
};

export function ChatBubble({ message }: ChatBubbleProps) {
  const isUser = message.sender === 'user';
  return (
    <View style={[styles.row, isUser ? styles.rowEnd : styles.rowStart]}>
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAstrologer]}>
        <AppText variant="body" color={isUser ? colors.onGradientText : colors.textPrimary}>
          {message.text}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', marginVertical: 4 },
  rowStart: { justifyContent: 'flex-start' },
  rowEnd: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
  },
  bubbleUser: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleAstrologer: { backgroundColor: colors.surface, borderBottomLeftRadius: 4 },
});
