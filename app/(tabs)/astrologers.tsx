import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Search } from 'lucide-react-native';
import { router } from 'expo-router';

import { AppText } from '@/components/common/AppText';
import { Input } from '@/components/forms/Input';
import { Screen } from '@/components/common/Screen';
import { EmptyView } from '@/components/states/EmptyView';
import { ErrorView } from '@/components/states/ErrorView';
import { LoadingView } from '@/components/states/LoadingView';
import { PersonaCard } from '@/features/astrologers/components/PersonaCard';
import { fetchAstrologerProfiles } from '@/services/astrologers.service';
import type { AstrologerProfile } from '@/features/astrologers/types';
import { colors, spacing } from '@/constants/theme';
import { AppError } from '@/utils/errors';

export default function AstrologersScreen() {
  const [query, setQuery] = useState('');
  const [personas, setPersonas] = useState<AstrologerProfile[]>([]);
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

  const filteredPersonas = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return personas;
    return personas.filter((persona) => persona.name.toLowerCase().includes(search));
  }, [query, personas]);

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
});
