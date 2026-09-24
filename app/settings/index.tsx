import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft, Bell, FileText, ShieldCheck, Trash2 } from 'lucide-react-native';

import { AppText } from '@/components/common/AppText';
import { Screen } from '@/components/common/Screen';
import { useAuth } from '@/features/auth/context/AuthProvider';
import { deleteAccount } from '@/services/account.service';
import { colors, radii, spacing } from '@/constants/theme';
import { AppError } from '@/utils/errors';

export default function SettingsScreen() {
  const { signOut } = useAuth();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      await deleteAccount();
      await signOut();
    } catch (err) {
      Alert.alert(
        'Could not delete account',
        err instanceof AppError ? err.message : 'Please try again in a moment.',
      );
    } finally {
      setDeleting(false);
    }
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      'Delete account',
      'This permanently deletes your account and chat history. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: handleDeleteAccount },
      ],
    );
  };

  return (
    <Screen scroll>
      <Pressable onPress={() => router.back()} style={styles.backRow}>
        <ArrowLeft size={18} color={colors.textSecondary} />
        <AppText variant="body" color={colors.textSecondary}>
          Back
        </AppText>
      </Pressable>

      <AppText variant="displayMd" style={styles.title}>
        Settings
      </AppText>

      <View style={styles.row}>
        <Bell size={20} color={colors.textSecondary} />
        <AppText variant="body" style={styles.rowLabel}>
          Push notifications
        </AppText>
        <Switch
          value={notificationsEnabled}
          onValueChange={setNotificationsEnabled}
          trackColor={{ true: colors.primary }}
        />
      </View>

      <Pressable style={styles.row}>
        <FileText size={20} color={colors.textSecondary} />
        <AppText variant="body" style={styles.rowLabel}>
          Terms of service
        </AppText>
      </Pressable>

      <Pressable style={styles.row}>
        <ShieldCheck size={20} color={colors.textSecondary} />
        <AppText variant="body" style={styles.rowLabel}>
          Privacy policy
        </AppText>
      </Pressable>

      <Pressable style={styles.row} onPress={confirmDeleteAccount} disabled={deleting}>
        <Trash2 size={20} color={colors.danger} />
        <AppText variant="body" color={colors.danger} style={styles.rowLabel}>
          {deleting ? 'Deleting...' : 'Delete account'}
        </AppText>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  backRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.md },
  title: { marginTop: spacing.lg, marginBottom: spacing.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  rowLabel: { flex: 1 },
});
