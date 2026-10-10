import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/buttons/Button';
import { colors, radii, shadows, spacing } from '@/constants/theme';

type ConfirmDialogProps = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Styles the confirm button as a destructive action. */
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dismiss = () => {
    if (!loading) onCancel();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={dismiss}
    >
      <Pressable style={styles.overlay} onPress={dismiss}>
        {/* Swallows taps so pressing the dialog itself doesn't dismiss it. */}
        <Pressable style={styles.dialog} onPress={() => {}}>
          <AppText variant="cardTitle">{title}</AppText>
          <AppText variant="body" color={colors.textSecondary}>
            {message}
          </AppText>
          <View style={styles.buttons}>
            <Button
              label={cancelLabel}
              variant="secondary"
              onPress={onCancel}
              disabled={loading}
              style={styles.button}
            />
            <Button
              label={confirmLabel}
              variant={destructive ? 'danger' : 'primary'}
              onPress={onConfirm}
              loading={loading}
              style={styles.button}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
    ...shadows.card,
  },
  buttons: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  button: { flex: 1 },
});
