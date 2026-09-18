import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Star } from 'lucide-react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/buttons/Button';
import { Screen } from '@/components/common/Screen';
import { EmptyView } from '@/components/states/EmptyView';
import { ErrorView } from '@/components/states/ErrorView';
import { LoadingView } from '@/components/states/LoadingView';
import { RequiredInputForm } from '@/features/astrologers/components/RequiredInputForm';
import { useAuth } from '@/features/auth/context/AuthProvider';
import { fetchAstrologerProfiles } from '@/services/astrologers.service';
import { getOrCreateChat } from '@/services/chat.service';
import type { AstrologerProfile, RequiredInput } from '@/features/astrologers/types';
import { colors, fonts, radii, shadows, spacing } from '@/constants/theme';
import { AppError } from '@/utils/errors';

/** dob/tob/pob are auto-filled from the saved profile and never re-asked here. */
const AUTO_FILLED_KEYS = new Set(['dob', 'tob', 'pob']);

type DetailTab = 'Profile' | 'Report' | 'Talk';

const TABS: DetailTab[] = ['Profile', 'Report', 'Talk'];

const FALLBACK_PROFILE = {
  rating: '4.9',
  consultations: '18,400 consultations',
  yearsInAstrology: '27 years',
  languages: 'Hindi, Sanskrit, English',
  basedIn: 'Varanasi',
  skills: ['Kundali', 'Vedic', 'Match-Making'],
  knownFor: ['Dasha timing', 'Marriage compatibility', 'Graha shanti remedies'],
};

const REPORT_COVERAGE = [
  'Lagna, moon sign and nakshatra summary',
  'Career and finance windows for the next 3 years',
  'Marriage / relationship compatibility notes',
  'Doshas found and remedies with exact timings',
];

const RECENT_REVIEWS = [
  {
    name: 'Rohit K.',
    text: 'Told me the exact month my job change would come through. It did.',
  },
  {
    name: 'Divya P.',
    text: 'Very patient and never pushed extra remedies. Felt honest.',
  },
];

export default function AstrologerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const [personas, setPersonas] = useState<AstrologerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>('Profile');
  const [inputValues, setInputValues] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const profiles = await fetchAstrologerProfiles();
        if (!cancelled) setPersonas(profiles);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof AppError ? err.message : 'Could not load this astrologer.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persona = personas.find((p) => p.id === id);

  const missingInputs = useMemo(() => {
    if (!persona) return [];
    return persona.requiredInputs.filter(
      (input) => input.required && !AUTO_FILLED_KEYS.has(input.key),
    );
  }, [persona]);

  const unfilledInputs = missingInputs.filter((input) => !inputValues[input.key]?.trim());
  const canStart = unfilledInputs.length === 0;

  if (loading) {
    return (
      <Screen>
        <LoadingView message="Loading astrologer..." />
      </Screen>
    );
  }

  if (loadError) {
    return (
      <Screen>
        <ErrorView message={loadError} onRetry={() => router.replace(`/astrologer/${id}`)} />
      </Screen>
    );
  }

  if (!persona) {
    return (
      <Screen>
        <EmptyView title="Astrologer not found" message="This persona may have been removed." />
      </Screen>
    );
  }

  const startChat = async () => {
    if (!session || !canStart) return;
    setStarting(true);
    setError(null);
    try {
      const chatId = await getOrCreateChat(persona.id);
      router.push({
        pathname: '/astrologer/chat/[chatId]',
        params: {
          chatId,
          personaId: persona.id,
          context: JSON.stringify(inputValues),
          initialMessage: '',
        },
      });
    } catch (err) {
      setError(err instanceof AppError ? err.message : 'Could not start the chat.');
    } finally {
      setStarting(false);
    }
  };

  return (
    <Screen scroll style={styles.container}>
      <Pressable onPress={() => router.back()} style={styles.backRow}>
        <ArrowLeft size={18} color={colors.textSecondary} />
        <AppText variant="bodySmall" color={colors.textSecondary}>
          All astrologers
        </AppText>
      </Pressable>

      <View style={styles.hero}>
        <Image source={{ uri: persona.photoUrl }} style={styles.avatar} />
        <View style={styles.heroCopy}>
          <AppText variant="displayMd" style={styles.name} numberOfLines={1}>
            {persona.name}
          </AppText>
          <View style={styles.metaRow}>
            <Star size={13} color={colors.primary} fill={colors.primary} />
            <AppText variant="bodySmall" color={colors.textSecondary}>
              {FALLBACK_PROFILE.rating} · {FALLBACK_PROFILE.consultations}
            </AppText>
          </View>
          <View style={styles.priceRow}>
            <AppText style={styles.priceText}>1</AppText>
            <AppText variant="bodySmall" color={colors.textSecondary}>
              credit / message
            </AppText>
          </View>
        </View>
      </View>

      <View style={styles.tabs}>
        {TABS.map((tab) => {
          const selected = activeTab === tab;
          return (
            <Pressable
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={[styles.tab, selected && styles.activeTab]}
            >
              <AppText
                variant="body"
                color={selected ? colors.textPrimary : colors.textSecondary}
                style={selected && styles.activeTabText}
              >
                {tab}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      {activeTab === 'Profile' ? (
        <ProfileSection persona={persona} />
      ) : activeTab === 'Report' ? (
        <ReportSection persona={persona} />
      ) : (
        <TalkSection
          missingInputs={missingInputs}
          inputValues={inputValues}
          onChangeInput={(key, value) => setInputValues((prev) => ({ ...prev, [key]: value }))}
          canStart={canStart}
          error={error}
          onStartChat={startChat}
          starting={starting}
        />
      )}
    </Screen>
  );
}

function ProfileSection({ persona }: { persona: AstrologerProfile }) {
  return (
    <>
      <InfoCard title="About">
        <AppText variant="body" style={styles.paragraph}>
          {persona.method}
        </AppText>
      </InfoCard>

      <InfoCard title="Persona">
        <KeyValue label="Years in astrology" value={FALLBACK_PROFILE.yearsInAstrology} />
        <KeyValue label="Charges" value="1 credit / message" />
        <KeyValue label="Languages" value={FALLBACK_PROFILE.languages} />
        <KeyValue label="Based in" value={persona.city || FALLBACK_PROFILE.basedIn} />
      </InfoCard>

      <InfoCard title="Skills">
        <View style={styles.skillRow}>
          {FALLBACK_PROFILE.skills.map((skill) => (
            <View key={skill} style={styles.skillChip}>
              <AppText variant="bodySmall" color={colors.primary}>
                {skill}
              </AppText>
            </View>
          ))}
        </View>
      </InfoCard>

      <InfoCard title="Known For">
        {FALLBACK_PROFILE.knownFor.map((item) => (
          <View key={item} style={styles.bulletRow}>
            <AppText variant="body">•</AppText>
            <AppText variant="body" style={styles.bulletText}>
              {item}
            </AppText>
          </View>
        ))}
      </InfoCard>
    </>
  );
}

function ReportSection({ persona }: { persona: AstrologerProfile }) {
  return (
    <>
      <InfoCard title="Sample Reading Style">
        <AppText variant="body" style={styles.paragraph}>
          {persona.greeting || persona.method}
        </AppText>
      </InfoCard>

      <InfoCard title="What A Paid Report Covers">
        {REPORT_COVERAGE.map((item) => (
          <View key={item} style={styles.starBulletRow}>
            <Star size={12} color={colors.primary} fill={colors.primary} />
            <AppText variant="body" style={styles.bulletText}>
              {item}
            </AppText>
          </View>
        ))}
      </InfoCard>

      <InfoCard title="Recent Reviews">
        {RECENT_REVIEWS.map((review) => (
          <View key={review.name} style={styles.reviewCard}>
            <AppText variant="bodySmall" color={colors.primary} style={styles.reviewName}>
              {review.name}
            </AppText>
            <AppText variant="bodySmall" color={colors.textSecondary}>
              {review.text}
            </AppText>
          </View>
        ))}
      </InfoCard>
    </>
  );
}

function TalkSection({
  missingInputs,
  inputValues,
  onChangeInput,
  canStart,
  error,
  onStartChat,
  starting,
}: {
  missingInputs: RequiredInput[];
  inputValues: Record<string, string>;
  onChangeInput: (key: string, value: string) => void;
  canStart: boolean;
  error: string | null;
  onStartChat: () => void;
  starting: boolean;
}) {
  return (
    <>
      <InfoCard title="Pricing">
        <AppText variant="body" style={styles.paragraph}>
          Every message costs <AppText style={styles.inlineHighlight}>1 credit</AppText>, with no
          time limit — chat for as long as you like, whenever you like.
        </AppText>
      </InfoCard>

      <InfoCard title="Payment Summary">
        <KeyValue label="Cost per message" value="1 credit" highlight />
      </InfoCard>

      {missingInputs.length > 0 ? (
        <InfoCard title="A Few Details First">
          <RequiredInputForm inputs={missingInputs} values={inputValues} onChange={onChangeInput} />
        </InfoCard>
      ) : null}

      {error ? (
        <AppText variant="bodySmall" color={colors.danger} style={styles.errorText}>
          {error}
        </AppText>
      ) : null}

      {!canStart && missingInputs.length > 0 ? (
        <AppText variant="bodySmall" color={colors.danger} style={styles.errorText}>
          Please fill in the details above to start chatting.
        </AppText>
      ) : null}

      <Button
        label="Start chatting"
        onPress={onStartChat}
        loading={starting}
        disabled={!canStart}
        style={styles.startButton}
      />

      <AppText variant="caption" color={colors.textSecondary} style={styles.secureText}>
        1 credit is deducted each time you send a message
      </AppText>
    </>
  );
}

function InfoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.card}>
      <AppText style={styles.sectionTitle}>{title}</AppText>
      {children}
    </View>
  );
}

function KeyValue({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <View style={styles.keyValueRow}>
      <AppText variant="body" color={colors.textSecondary}>
        {label}
      </AppText>
      <AppText
        variant="body"
        color={highlight ? colors.primary : colors.textPrimary}
        style={styles.keyValueText}
      >
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: spacing.md,
    paddingBottom: 40,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginTop: spacing.xxl,
  },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceAlt,
  },
  heroCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  name: {
    fontSize: 24,
    lineHeight: 30,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    marginTop: spacing.xs,
  },
  priceText: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 18,
    lineHeight: 22,
  },
  tabs: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1E8D9',
    borderRadius: radii.sm,
    padding: 3,
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  tab: {
    flex: 1,
    height: 28,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeTab: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: '#E5D7C4',
    ...shadows.card,
  },
  activeTabText: {
    fontFamily: fonts.bodySemiBold,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: '#E6D8C6',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.primary,
    fontFamily: fonts.wordmark,
    fontSize: 14,
    lineHeight: 18,
    textTransform: 'uppercase',
  },
  paragraph: {
    lineHeight: 23,
  },
  keyValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
  },
  keyValueText: {
    flexShrink: 1,
    fontFamily: fonts.bodyBold,
    textAlign: 'right',
  },
  skillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  skillChip: {
    borderWidth: 1,
    borderColor: '#D99A60',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  starBulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  bulletText: {
    flex: 1,
  },
  reviewCard: {
    backgroundColor: '#F1E8D9',
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  reviewName: {
    fontFamily: fonts.bodyBold,
  },
  inlineHighlight: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
  },
  errorText: {
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  startButton: {
    marginTop: spacing.xs,
  },
  secureText: {
    marginTop: spacing.md,
    textAlign: 'center',
  },
});
