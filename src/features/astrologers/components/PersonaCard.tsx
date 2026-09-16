import { Image, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { colors, radii, spacing } from '@/constants/theme';
import type { AstrologerProfile } from '@/features/astrologers/types';

type PersonaCardProps = {
  persona: AstrologerProfile;
  onPress: () => void;
};

export function PersonaCard({ persona, onPress }: PersonaCardProps) {
  return (
    <Pressable onPress={onPress} style={styles.card} testID={`persona-card-${persona.id}`}>
      <Image source={{ uri: persona.photoUrl }} style={styles.avatar} />
      <View style={styles.info}>
        <AppText variant="cardTitle" numberOfLines={1}>
          {persona.name}
        </AppText>
        <AppText variant="bodySmall" color={colors.textSecondary} numberOfLines={1}>
          {persona.tagline}
        </AppText>
        <AppText variant="caption" color={colors.textMuted} numberOfLines={1}>
          {persona.city}
        </AppText>
      </View>
      <View style={styles.creditBadge}>
        <AppText variant="cardTitle" color={colors.textPrimary}>
          {persona.creditCostPerSession}
        </AppText>
        <AppText variant="caption" color={colors.textSecondary}>
          credit{persona.creditCostPerSession > 1 ? 's' : ''}/session
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.md,
    alignItems: 'center',
  },
  avatar: { width: 64, height: 64, borderRadius: radii.md },
  info: { flex: 1, gap: 2 },
  creditBadge: { alignItems: 'flex-end' },
});
