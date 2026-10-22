import { Image, Pressable, StyleSheet, View } from 'react-native';
import { ArrowRight } from 'lucide-react-native';

import { AppText } from '@/components/common/AppText';
import { colors, fonts, radii, shadows, spacing } from '@/constants/theme';
import type { AstrologerProfile } from '@/features/astrologers/types';

type RecentChatCardProps = {
  persona: AstrologerProfile;
  lastMessage: string | null;
  lastMessageAt: string;
  onPress: () => void;
};

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** "just now", "5m ago", "2h ago", "Yesterday", then "12 Oct". */
function relativeTime(iso: string): string {
  const then = new Date(iso);
  const diff = Date.now() - then.getTime();
  if (diff < MINUTE_MS) return 'just now';
  if (diff < HOUR_MS) return `${Math.floor(diff / MINUTE_MS)}m ago`;
  if (diff < DAY_MS) return `${Math.floor(diff / HOUR_MS)}h ago`;
  if (diff < 2 * DAY_MS) return 'Yesterday';
  return then.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function RecentChatCard({ persona, lastMessage, lastMessageAt, onPress }: RecentChatCardProps) {
  return (
    <Pressable onPress={onPress} style={styles.card} testID="recent-chat-card">
      <View style={styles.avatarRing}>
        <Image source={{ uri: persona.photoUrl }} style={styles.avatar} />
      </View>
      <View style={styles.info}>
        <View style={styles.titleRow}>
          <AppText variant="cardTitle" numberOfLines={1} style={styles.name}>
            {persona.name}
          </AppText>
          <AppText variant="caption" color={colors.textMuted}>
            {relativeTime(lastMessageAt)}
          </AppText>
        </View>
        <AppText variant="bodySmall" color={colors.textSecondary} numberOfLines={2}>
          {lastMessage ?? persona.tagline}
        </AppText>
        <View style={styles.continuePill}>
          <AppText variant="bodySmall" color={colors.onGradientText} style={styles.continueText}>
            Continue chat
          </AppText>
          <ArrowRight size={14} color={colors.onGradientText} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.surfaceAlt,
    padding: spacing.md,
    gap: spacing.md,
    alignItems: 'center',
    ...shadows.card,
  },
  avatarRing: {
    padding: 3,
    borderRadius: radii.md + 3,
    backgroundColor: colors.surfaceAlt,
  },
  avatar: { width: 64, height: 64, borderRadius: radii.md },
  info: { flex: 1, gap: spacing.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { flex: 1 },
  continuePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    marginTop: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  continueText: { fontFamily: fonts.bodySemiBold },
});
