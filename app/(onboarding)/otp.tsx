import { useState } from 'react';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/buttons/Button';
import { OtpInput } from '@/components/forms/OtpInput';
import { Screen } from '@/components/common/Screen';
import { useOtpFlow } from '@/features/auth/context/OtpFlowProvider';
import { useCountdown } from '@/hooks/useCountdown';
import { confirmOtp, sendOtp } from '@/services/auth.service';
import { colors, spacing } from '@/constants/theme';
import { AppError } from '@/utils/errors';

const RESEND_SECONDS = 30;

export default function OtpScreen() {
  const { phoneNumber, identificationToken, otp, setPendingVerification } = useOtpFlow();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const { secondsLeft, reset } = useCountdown(RESEND_SECONDS);

  const handleVerify = async () => {
    if (!phoneNumber || !identificationToken) {
      setError('Session expired. Please request a new code.');
      return;
    }
    setError(null);
    setVerifying(true);
    try {
      await confirmOtp(phoneNumber, code, identificationToken);
      Keyboard.dismiss();
      // Defer to the next frame so the keyboard-dismiss commit fully settles
      // before react-native-screens tears down this screen and mounts the
      // next one — doing both in the same commit is what triggers Fabric's
      // "addViewAt: ... already has a parent" crash on Android.
      requestAnimationFrame(() => router.replace('/(onboarding)/birth-details'));
    } catch (err) {
      setError(err instanceof AppError ? err.message : 'Could not verify the code.');
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    if (secondsLeft > 0 || resending) return;
    setResending(true);
    setError(null);
    try {
      const result = await sendOtp(phoneNumber);
      setPendingVerification(phoneNumber, result.identificationToken, result.otp);
      reset();
    } catch (err) {
      setError(err instanceof AppError ? err.message : 'Could not resend the code.');
    } finally {
      setResending(false);
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="displayMd">Verify your number</AppText>
        <AppText variant="body" color={colors.textSecondary}>
          Enter the 6-digit code sent to {phoneNumber || 'your phone'}.
        </AppText>
        {otp ? (
          <AppText variant="bodySmall" color={colors.textSecondary}>
            Your OTP: {otp}
          </AppText>
        ) : null}
      </View>

      <View style={styles.otpBlock}>
        <OtpInput value={code} onChange={setCode} autoFocus />
        {error ? (
          <AppText variant="bodySmall" color={colors.danger}>
            {error}
          </AppText>
        ) : null}
      </View>

      <View style={styles.footer}>
        <Button
          label="Verify"
          onPress={handleVerify}
          loading={verifying}
          disabled={code.length !== 6}
          testID="verify-otp-button"
        />
        <Pressable onPress={handleResend} disabled={secondsLeft > 0 || resending}>
          <AppText
            variant="body"
            color={secondsLeft > 0 ? colors.textMuted : colors.primary}
            style={styles.resend}
          >
            {secondsLeft > 0 ? `Resend code in ${secondsLeft}s` : 'Resend code'}
          </AppText>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm, marginTop: spacing.xl },
  otpBlock: { gap: spacing.sm, marginTop: spacing.xxl },
  footer: { marginTop: 'auto', marginBottom: spacing.xl, gap: spacing.md },
  resend: { textAlign: 'center' },
});
