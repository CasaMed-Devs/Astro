import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Search } from 'lucide-react-native';
import { router, useFocusEffect } from 'expo-router';

import { AppText } from '@/components/common/AppText';
import { Input } from '@/components/forms/Input';
import { Screen } from '@/components/common/Screen';
import { EmptyView } from '@/components/states/EmptyView';
import { ErrorView } from '@/components/states/ErrorView';
import { LoadingView } from '@/components/states/LoadingView';
import { PersonaCard } from '@/features/astrologers/components/PersonaCard';
import { RecentChatCard } from '@/features/astrologers/components/RecentChatCard';
import { fetchAstrologerProfiles } from '@/services/astrologers.service';
import { fetchRecentChat, type RecentChat } from '@/services/chat.service';
import type { AstrologerProfile } from '@/features/astrologers/types';
import { colors, spacing } from '@/constants/theme';
import { AppError } from '@/utils/errors';

export default function AstrologersScreen() {
  const [query, setQuery] = useState('');
  const [personas, setPersonas] = useState<AstrologerProfile[]>([]);
  const [recentChat, setRecentChat] = useState<RecentChat | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const profiles = await fetchAstrologerProfiles();
      setPersonas(profiles);
    } catch (err) {
      setError(err instanceof AppError ? err.message : 'Could not load astrologers.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Re-checked every time the tab is shown, so coming back from a chat
  // immediately shows that astrologer. A failure just hides the section.
  useFocusEffect(
    useCallback(() => {
      fetchRecentChat()
        .then(setRecentChat)
        .catch(() => undefined);
    }, []),
  );

  const filteredPersonas = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return personas;
    return personas.filter((persona) => persona.name.toLowerCase().includes(search));
  }, [query, personas]);

  // Hidden while searching, and if that astrologer has since been removed.
  const recentPersona =
    recentChat && !query.trim() ? personas.find((p) => p.id === recentChat.personaId) ?? null : null;

  const openRecentChat = () => {
    if (!recentChat) return;
    router.push({
      pathname: '/astrologer/chat/[chatId]',
      params: { chatId: recentChat.chatId, personaId: recentChat.personaId },
    });
  };

  return (
    <Screen edges={['top']} padded={false}>
      <View style={styles.header}>
        <AppText variant="displayMd">Astrologer</AppText>
        <AppText variant="bodySmall" color={colors.textSecondary}>
          Chat with an AI astrologer, pay only in credits you use
        </AppText>
      </View>

      <View style={styles.searchWrap}>
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name"
          leftAccessory={<Search size={18} color={colors.textSecondary} />}
        />
      </View>

      {loading ? (
        <LoadingView message="Loading astrologers..." />
      ) : error ? (
        <ErrorView message={error} onRetry={load} />
      ) : (
        <FlatList
          data={filteredPersonas}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          ListHeaderComponent={
            <>
              {recentChat && recentPersona ? (
                <View style={styles.recentSection}>
                  <AppText variant="label" color={colors.primary} style={styles.sectionLabel}>
                    CONTINUE CHAT
                  </AppText>
                  <RecentChatCard
                    persona={recentPersona}
                    lastMessage={recentChat.lastMessage}
                    lastMessageAt={recentChat.lastMessageAt}
                    onPress={openRecentChat}
                  />
                </View>
              ) : null}
              {filteredPersonas.length > 0 ? (
                <AppText variant="label" color={colors.primary} style={styles.sectionLabel}>
                  {query.trim() ? 'RESULTS' : 'ALL ASTROLOGERS'}
                </AppText>
              ) : null}
            </>
          }
          renderItem={({ item }) => (
            <PersonaCard persona={item} onPress={() => router.push(`/astrologer/${item.id}`)} />
          )}
          ListEmptyComponent={
            <EmptyView title="No astrologers found" message="Try a different search." />
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.xl, gap: spacing.xs, marginTop: spacing.md },
  searchWrap: { paddingHorizontal: spacing.xl, marginTop: spacing.lg, marginBottom: spacing.lg },
  listContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  recentSection: { marginBottom: spacing.xl },
  sectionLabel: { letterSpacing: 1, marginBottom: spacing.md },
});
