import { useEffect, useState } from 'react';
import { BackHandler, Modal, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CircleCheck } from 'lucide-react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/buttons/Button';
import { Input } from '@/components/forms/Input';
import { Screen } from '@/components/common/Screen';
import { useAuth } from '@/features/auth/context/AuthProvider';
import { deleteAccount, type DeleteAccountReason } from '@/services/account.service';
import { clearChatCache } from '@/services/chatCache';
import { colors, radii, spacing } from '@/constants/theme';
import { AppError } from '@/utils/errors';

const DELETE_REASONS: { value: DeleteAccountReason; label: string }[] = [
  { value: 'no_longer_use', label: 'I no longer use the app' },
  { value: 'unmet_expectations', label: 'The app does not meet my expectations' },
  { value: 'payment_issue', label: 'Subscription/Payment issue' },
  { value: 'privacy_concerns', label: 'Privacy concerns' },
  { value: 'too_many_notifications', label: 'Too many notifications' },
  { value: 'technical_issues', label: 'Technical issues' },
  { value: 'created_by_mistake', label: 'I created my account by mistake' },
  { value: 'switching_app', label: 'I am switching to another application' },
  { value: 'other', label: 'Other' },
];

const OTHER_REASON_MAX_LENGTH = 500;

const goToOnboarding = () => router.replace('/(onboarding)');

export default function DeleteAccountScreen() {
  const { signOut } = useAuth();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState<DeleteAccountReason | null>(null);
  const [otherReason, setOtherReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canContinue = reason !== null && (reason !== 'other' || otherReason.trim().length > 0);

  // Once the account is gone there is nothing to go back to — the hardware
  // back button leaves for onboarding just like the Continue button does.
  useEffect(() => {
    if (!deleted) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      goToOnboarding();
      return true;
    });
    return () => subscription.remove();
  }, [deleted]);

  const handleDelete = async () => {
    if (!reason) return;
    setDeleting(true);
    setError(null);

    try {
      await deleteAccount({
        reason,
        details: reason === 'other' ? otherReason.trim() : undefined,
      });
    } catch (err) {
      setError(
        err instanceof AppError ? err.message : 'Could not delete your account. Please try again.',
      );
      setConfirming(false);
      setDeleting(false);
      return;
    }

    clearChatCache();
    queryClient.clear();
    // Show the success state before ending the session, so this screen is
    // already on it when the auth state flips to signed-out.
    setDeleted(true);
    setConfirming(false);
    setDeleting(false);
    // The session token now points at an account that no longer exists.
    await signOut().catch(() => {});
  };

  if (deleted) {
    return (
      <Screen>
        <View style={styles.successContainer}>
          <CircleCheck size={48} color={colors.primary} />
          <AppText variant="displayMd" style={styles.centered}>
            Account deleted
          </AppText>
          <AppText variant="body" color={colors.textSecondary} style={styles.centered}>
            Your account has been successfully deleted.
          </AppText>
          <Button label="Continue" onPress={goToOnboarding} style={styles.successButton} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Pressable onPress={() => router.back()} style={styles.backRow} hitSlop={8}>
        <ArrowLeft size={18} color={colors.textSecondary} />
        <AppText variant="body" color={colors.textSecondary}>
          Back
        </AppText>
      </Pressable>

      <AppText variant="displayMd" style={styles.title}>
        Delete account
      </AppText>
      <AppText variant="label" style={styles.question}>
        Why do you want to delete your account?
      </AppText>

      {DELETE_REASONS.map((option) => {
        const selected = reason === option.value;
        return (
          <Pressable
            key={option.value}
            onPress={() => {
              setReason(option.value);
              setError(null);
            }}
            style={[styles.option, selected && styles.optionSelected]}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
          >
            <View style={[styles.radio, selected && styles.radioSelected]}>
              {selected ? <View style={styles.radioDot} /> : null}
            </View>
            <AppText variant="body" style={styles.optionLabel}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}

      {reason === 'other' ? (
        <Input
          value={otherReason}
          onChangeText={setOtherReason}
          placeholder="Tell us your reason"
          multiline
          maxLength={OTHER_REASON_MAX_LENGTH}
          textAlignVertical="top"
          containerStyle={styles.otherInput}
        />
      ) : null}

      {error ? (
        <AppText variant="bodySmall" color={colors.danger} style={styles.error}>
          {error}
        </AppText>
      ) : null}

      <Button
        label="Delete Account"
        variant="danger"
        onPress={() => setConfirming(true)}
        disabled={!canContinue}
        style={styles.deleteButton}
      />

      <Modal
        visible={confirming}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {
          if (!deleting) setConfirming(false);
        }}
      >
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <AppText variant="cardTitle">Are you sure you want to delete your account?</AppText>
            <AppText variant="body" color={colors.textSecondary}>
              Deleting your account may permanently remove your profile, subscription-related
              information, generated content, and other associated data. This action may not be
              reversible.
            </AppText>
            <View style={styles.dialogButtons}>
              <Button
                label="Cancel"
                variant="secondary"
                onPress={() => setConfirming(false)}
                disabled={deleting}
                style={styles.dialogButton}
              />
              <Button
                label="Delete Account"
                variant="danger"
                onPress={handleDelete}
                loading={deleting}
                style={styles.dialogButton}
              />
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  backRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.md },
  title: { marginTop: spacing.lg, marginBottom: spacing.sm },
  question: { marginBottom: spacing.lg },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'transparent',
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.surfaceAlt },
  optionLabel: { flex: 1 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: radii.pill, backgroundColor: colors.primary },
  otherInput: { height: 110, alignItems: 'flex-start', paddingVertical: spacing.md },
  error: { marginTop: spacing.md },
  deleteButton: { marginTop: spacing.lg, marginBottom: spacing.xxl },
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  dialog: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.xl,
    gap: spacing.md,
  },
  dialogButtons: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  dialogButton: { flex: 1 },
  successContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  centered: { textAlign: 'center' },
  successButton: { alignSelf: 'stretch', marginTop: spacing.lg },
});
