import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Star } from 'lucide-react-native';

import { AppText } from '@/components/common/AppText';
import { colors, radii, spacing } from '@/constants/theme';
import { personaAvatarSources } from '@/features/astrologers/config/personas';
import { SPECIALTY_LABELS, type AstrologerPersona } from '@/features/astrologers/types';

type PersonaCardProps = {
  persona: AstrologerPersona;
  onPress: () => void;
};

export function PersonaCard({ persona, onPress }: PersonaCardProps) {
  return (
    <Pressable onPress={onPress} style={styles.card} testID={`persona-card-${persona.id}`}>
      <Image source={personaAvatarSources[persona.avatar]} style={styles.avatar} />
      <View style={styles.info}>
        <AppText variant="cardTitle" numberOfLines={1}>
          {persona.name}
        </AppText>
        <AppText variant="bodySmall" color={colors.textSecondary} numberOfLines={1}>
          {persona.languages.join(', ')}
        </AppText>
        <View style={styles.tagRow}>
          {persona.specialties.slice(0, 3).map((specialty) => (
            <View key={specialty} style={styles.tag}>
              <AppText variant="caption" color={colors.chipText}>
                {SPECIALTY_LABELS[specialty]}
              </AppText>
            </View>
          ))}
          <View style={styles.rating}>
            <Star size={12} color={colors.primary} fill={colors.primary} />
            <AppText variant="caption" color={colors.primary}>
              4.8
            </AppText>
          </View>
        </View>
      </View>
      <View style={styles.creditBadge}>
        <AppText variant="cardTitle" color={colors.textPrimary}>
          {persona.creditCostPerMessage}
        </AppText>
        <AppText variant="caption" color={colors.textSecondary}>
          credit{persona.creditCostPerMessage > 1 ? 's' : ''}/msg
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
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4, alignItems: 'center' },
  tag: {
    backgroundColor: colors.chipBg,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  creditBadge: { alignItems: 'flex-end' },
});
