import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, MessageCircle } from 'lucide-react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/buttons/Button';
import { Screen } from '@/components/common/Screen';
import { EmptyView } from '@/components/states/EmptyView';
import { useAuth } from '@/features/auth/context/AuthProvider';
import { getPersonaById, personaAvatarSources } from '@/features/astrologers/config/personas';
import { SPECIALTY_LABELS } from '@/features/astrologers/types';
import { getOrCreateChat } from '@/services/chat.service';
import { colors, radii, spacing } from '@/constants/theme';
import { AppError } from '@/utils/errors';

const SAMPLE_QUESTIONS = [
  'What does my chart say about this year?',
  'Is this a good time for a career change?',
  'What should I focus on in relationships right now?',
];

export default function AstrologerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const persona = getPersonaById(id);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!persona) {
    return (
      <Screen>
        <EmptyView title="Astrologer not found" message="This persona may have been removed." />
      </Screen>
    );
  }

  const handleStartChat = async () => {
    if (!session) return;
    setStarting(true);
    setError(null);
    try {
      const chatId = await getOrCreateChat(persona.id);
      router.push(`/astrologer/chat/${chatId}?personaId=${persona.id}`);
    } catch (err) {
      setError(err instanceof AppError ? err.message : 'Could not start the chat.');
    } finally {
      setStarting(false);
    }
  };

  return (
    <Screen scroll>
      <Pressable onPress={() => router.back()} style={styles.backRow}>
        <ArrowLeft size={18} color={colors.textSecondary} />
        <AppText variant="body" color={colors.textSecondary}>
          Back
        </AppText>
      </Pressable>

      <View style={styles.profileHeader}>
        <Image source={personaAvatarSources[persona.avatar]} style={styles.avatar} />
        <AppText variant="displayMd" style={styles.name}>
          {persona.name}
        </AppText>
        <AppText variant="body" color={colors.textSecondary} style={styles.tagline}>
          {persona.tagline}
        </AppText>
        <View style={styles.tagRow}>
          {persona.specialties.map((specialty) => (
            <View key={specialty} style={styles.tag}>
              <AppText variant="caption" color={colors.chipText}>
                {SPECIALTY_LABELS[specialty]}
              </AppText>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <AppText variant="cardTitle">Speaks</AppText>
        <AppText variant="body" color={colors.textSecondary}>
          {persona.languages.join(', ')}
        </AppText>
      </View>

      <View style={styles.section}>
        <AppText variant="cardTitle">Try asking</AppText>
        {SAMPLE_QUESTIONS.map((question) => (
          <View key={question} style={styles.questionRow}>
            <MessageCircle size={16} color={colors.textSecondary} />
            <AppText variant="body" color={colors.textSecondary} style={styles.questionText}>
              {question}
            </AppText>
          </View>
        ))}
      </View>

      {error ? (
        <AppText variant="bodySmall" color={colors.danger}>
          {error}
        </AppText>
      ) : null}

      <Button
        label={`Start chat · ${persona.creditCostPerMessage} credit${persona.creditCostPerMessage > 1 ? 's' : ''}/msg`}
        onPress={handleStartChat}
        loading={starting}
        style={styles.startButton}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  backRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.md },
  profileHeader: { alignItems: 'center', marginTop: spacing.lg, gap: spacing.xs },
  avatar: { width: 96, height: 96, borderRadius: radii.lg },
  name: { marginTop: spacing.sm, textAlign: 'center' },
  tagline: { textAlign: 'center' },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  tag: {
    backgroundColor: colors.chipBg,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  section: { marginTop: spacing.xl, gap: spacing.sm },
  questionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  questionText: { flex: 1 },
  startButton: { marginTop: spacing.xxl, marginBottom: spacing.xxl },
});
