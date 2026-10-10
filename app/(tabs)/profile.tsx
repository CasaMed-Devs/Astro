import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import {
  Crown,
  FileText,
  LogOut,
  Mail,
  Pencil,
  Receipt,
  ReceiptText,
  Settings,
  ShieldCheck,
  Trash2,
  UserX,
  Wallet,
} from 'lucide-react-native';

import { AppText } from '@/components/common/AppText';
import { Card } from '@/components/cards/Card';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Screen } from '@/components/common/Screen';
import { useAuth } from '@/features/auth/context/AuthProvider';
import { openSupportEmail } from '@/features/support/supportEmail';
import { getPaywallRoute } from '@/utils/paywall';
import { showErrorToast } from '@/utils/toast';
import type { LegalDocId } from '@/constants/legal';
import { colors, radii, spacing } from '@/constants/theme';

const openLegalDoc = (doc: LegalDocId) =>
  router.push({ pathname: '/legal/[doc]', params: { doc } });

export default function ProfileScreen() {
  const { profile, signOut } = useAuth();
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  const handleSignOut = () => {
    setConfirmingLogout(false);
    showErrorToast('Successfully logout');
    signOut();
  };

  return (
    <Screen edges={['top']} scroll>
      <View style={styles.header}>
        <AppText variant="displayMd">Profile</AppText>
      </View>

      <Card style={styles.infoCard}>
        <View style={styles.infoCardHeader}>
          <AppText variant="cardTitle">{profile?.name ?? 'Add your name'}</AppText>
          <Pressable
            hitSlop={8}
            onPress={() => router.push('/profile/edit')}
            style={styles.editButton}
          >
            <Pencil size={16} color={colors.textSecondary} />
          </Pressable>
        </View>
        <AppText variant="body" color={colors.textSecondary}>
          {profile?.phoneNumber}
        </AppText>
        <View style={styles.divider} />
        <ProfileRow label="Date of birth" value={profile?.dateOfBirth ?? '—'} />
        <ProfileRow label="Time of birth" value={profile?.timeOfBirth ?? '—'} />
        <ProfileRow label="Place of birth" value={profile?.placeOfBirth ?? '—'} />
      </Card>

      <Pressable style={styles.menuRow} onPress={() => router.push(getPaywallRoute(profile))}>
        <Crown size={20} color={colors.primary} />
        <AppText variant="body" style={styles.menuLabel}>
          {profile?.trialCreditsClaimed ? 'Subscribe for more credits' : 'Try Astro108 for Rs.1'}
        </AppText>
      </Pressable>

      <Pressable style={styles.menuRow} onPress={() => router.push('/wallet/topup')}>
        <Wallet size={20} color={colors.textSecondary} />
        <AppText variant="body" style={styles.menuLabel}>
          {profile?.credits ?? 0} credits — Top up wallet
        </AppText>
      </Pressable>

      <Pressable style={styles.menuRow} onPress={() => router.push('/report')}>
        <FileText size={20} color={colors.textSecondary} />
        <AppText variant="body" style={styles.menuLabel}>
          My kundali report
        </AppText>
      </Pressable>

      <Pressable style={styles.menuRow} onPress={() => router.push('/invoices')}>
        <ReceiptText size={20} color={colors.textSecondary} />
        <AppText variant="body" style={styles.menuLabel}>
          Invoices
        </AppText>
      </Pressable>

      <Pressable style={styles.menuRow} onPress={() => openSupportEmail(profile?.phoneNumber)}>
        <Mail size={20} color={colors.textSecondary} />
        <AppText variant="body" style={styles.menuLabel}>
          Support
        </AppText>
      </Pressable>

      <Pressable style={styles.menuRow} onPress={() => openLegalDoc('terms')}>
        <FileText size={20} color={colors.textSecondary} />
        <AppText variant="body" style={styles.menuLabel}>
          Terms and conditions
        </AppText>
      </Pressable>

      <Pressable style={styles.menuRow} onPress={() => openLegalDoc('privacy')}>
        <ShieldCheck size={20} color={colors.textSecondary} />
        <AppText variant="body" style={styles.menuLabel}>
          Privacy policy
        </AppText>
      </Pressable>

      <Pressable style={styles.menuRow} onPress={() => openLegalDoc('payment-cancellation')}>
        <Receipt size={20} color={colors.textSecondary} />
        <AppText variant="body" style={styles.menuLabel}>
          Payment and cancellation policy
        </AppText>
      </Pressable>

      <Pressable style={styles.menuRow} onPress={() => openLegalDoc('delete-account')}>
        <Trash2 size={20} color={colors.textSecondary} />
        <AppText variant="body" style={styles.menuLabel}>
          Account deletion policy
        </AppText>
      </Pressable>

      <Pressable style={styles.menuRow} onPress={() => setConfirmingLogout(true)}>
        <LogOut size={20} color={colors.danger} />
        <AppText variant="body" color={colors.danger} style={styles.menuLabel}>
          Log out
        </AppText>
      </Pressable>

      <Pressable style={styles.menuRow} onPress={() => router.push('/account/delete')}>
        <UserX size={20} color={colors.danger} />
        <AppText variant="body" color={colors.danger} style={styles.menuLabel}>
          Delete account
        </AppText>
      </Pressable>

      <ConfirmDialog
        visible={confirmingLogout}
        title="Log out?"
        message="Are you sure you want to log out? You will need your mobile number and an OTP to sign in again."
        confirmLabel="Log out"
        destructive
        onConfirm={handleSignOut}
        onCancel={() => setConfirmingLogout(false)}
      />
    </Screen>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <AppText variant="bodySmall" color={colors.textSecondary}>
        {label}
      </AppText>
      <AppText variant="body">{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { marginTop: spacing.xl, marginBottom: spacing.lg },
  infoCard: { gap: spacing.sm, marginBottom: spacing.xl },
  infoCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  editButton: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  menuLabel: { flex: 1 },
});
