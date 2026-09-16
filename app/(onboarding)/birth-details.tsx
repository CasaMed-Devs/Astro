import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Calendar, Clock } from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/buttons/Button';
import { Input } from '@/components/forms/Input';
import { PlaceAutocompleteInput } from '@/components/forms/PlaceAutocompleteInput';
import { Screen } from '@/components/common/Screen';
import { useAuth } from '@/features/auth/context/AuthProvider';
import { saveBirthDetails } from '@/services/user.service';
import { colors, radii, spacing } from '@/constants/theme';
import {
  formatDate,
  formatTime,
  validateBirthDetails,
  type BirthDetailsFormState,
} from '@/validation/birthDetails';
import type { Gender } from '@/types/firestore';
import { AppError } from '@/utils/errors';
import { withTimeout } from '@/utils/withTimeout';

// The backend request has no built-in timeout — a stalled connection can
// leave the write promise neither resolving nor rejecting, which would
// otherwise leave the button spinning forever with no feedback at all.
const SAVE_TIMEOUT_MS = 15_000;

// How long to wait for the refreshed profile to reflect the just-saved
// birth details before giving up and showing an error instead of hanging
// on the loading spinner forever (e.g. if the backend is unreachable).
const PROFILE_SYNC_TIMEOUT_MS = 10_000;

const GENDER_OPTIONS: { label: string; value: Gender }[] = [
  { label: 'Female', value: 'female' },
  { label: 'Male', value: 'male' },
  { label: 'Other', value: 'other' },
];

export default function BirthDetailsScreen() {
  const { session, hasBirthDetails, refreshProfile } = useAuth();
  const [form, setForm] = useState<BirthDetailsFormState>({
    fullName: '',
    dateOfBirth: null,
    timeOfBirth: null,
    placeOfBirth: '',
    place: null,
    gender: null,
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [waitingForSync, setWaitingForSync] = useState(false);
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The write is confirmed, but `hasBirthDetails` (from the profile
  // listener in AuthProvider) may not have caught up yet. Navigating
  // before it does would bounce straight back here, since the tabs
  // layout's own guard checks the same flag. Wait for it instead of
  // navigating on a timer, with a timeout so a genuinely stuck
  // connection shows an error rather than hanging forever.
  useEffect(() => {
    if (waitingForSync && hasBirthDetails) {
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
      router.replace('/(tabs)/home');
    }
  }, [waitingForSync, hasBirthDetails]);

  useEffect(() => {
    return () => {
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    };
  }, []);

  const handleSubmit = async () => {
    const validationError = validateBirthDetails(form);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!session) {
      setError('Your session expired. Please sign in again.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await withTimeout(
        saveBirthDetails({
          name: form.fullName.trim(),
          dateOfBirth: formatDate(form.dateOfBirth!),
          timeOfBirth: formatTime(form.timeOfBirth!),
          placeOfBirth: form.placeOfBirth.trim(),
          latitude: form.place!.latitude,
          longitude: form.place!.longitude,
          timezoneOffset: form.place!.timezoneOffset,
          gender: form.gender!,
        }),
        SAVE_TIMEOUT_MS,
        'Saving is taking too long. Check your connection and try again.',
      );
      await refreshProfile();
      setWaitingForSync(true);
      syncTimeoutRef.current = setTimeout(() => {
        setWaitingForSync(false);
        setError(
          'Saved, but this is taking longer than expected. Check your connection and try again.',
        );
      }, PROFILE_SYNC_TIMEOUT_MS);
    } catch (err) {
      setError(err instanceof AppError ? err.message : 'Could not save your details.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen scroll>
      <View style={styles.header}>
        <AppText variant="displayMd">Your birth details</AppText>
        <AppText variant="body" color={colors.textSecondary}>
          The exact time and place decide your ascendant. Get these right and every prediction gets
          sharper.
        </AppText>
      </View>

      <View style={styles.field}>
        <AppText variant="label">Full Name</AppText>
        <Input
          value={form.fullName}
          onChangeText={(text) => setForm((prev) => ({ ...prev, fullName: text }))}
          placeholder="Your full name"
        />
      </View>

      <View style={styles.field}>
        <AppText variant="label">Date of birth</AppText>
        <Pressable onPress={() => setShowDatePicker(true)}>
          <Input
            editable={false}
            pointerEvents="none"
            value={form.dateOfBirth ? formatDate(form.dateOfBirth) : ''}
            placeholder="dd/mm/yyyy"
            rightAccessory={<Calendar size={20} color={colors.textSecondary} />}
          />
        </Pressable>
        {showDatePicker ? (
          <DateTimePicker
            value={form.dateOfBirth ?? new Date(2000, 0, 1)}
            mode="date"
            maximumDate={new Date()}
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(_event, date) => {
              setShowDatePicker(false);
              if (date) setForm((prev) => ({ ...prev, dateOfBirth: date }));
            }}
          />
        ) : null}
      </View>

      <View style={styles.field}>
        <AppText variant="label">Time of birth</AppText>
        <Pressable onPress={() => setShowTimePicker(true)}>
          <Input
            editable={false}
            pointerEvents="none"
            value={form.timeOfBirth ? formatTime(form.timeOfBirth) : ''}
            placeholder="--:-- --"
            rightAccessory={<Clock size={20} color={colors.textSecondary} />}
          />
        </Pressable>
        {showTimePicker ? (
          <DateTimePicker
            value={form.timeOfBirth ?? new Date()}
            mode="time"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(_event, date) => {
              setShowTimePicker(false);
              if (date) setForm((prev) => ({ ...prev, timeOfBirth: date }));
            }}
          />
        ) : null}
      </View>

      <View style={styles.field}>
        <AppText variant="label">Place of birth</AppText>
        <PlaceAutocompleteInput
          value={form.placeOfBirth}
          onChangeText={(text) => setForm((prev) => ({ ...prev, placeOfBirth: text }))}
          onResolved={(place) => setForm((prev) => ({ ...prev, place }))}
          timestampSeconds={Math.floor((form.dateOfBirth ?? new Date()).getTime() / 1000)}
        />
      </View>

      <View style={styles.field}>
        <AppText variant="label">Gender</AppText>
        <View style={styles.genderRow}>
          {GENDER_OPTIONS.map((option) => {
            const selected = form.gender === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => setForm((prev) => ({ ...prev, gender: option.value }))}
                style={[styles.genderOption, selected && styles.genderOptionSelected]}
              >
                <AppText variant="body" color={selected ? colors.primary : colors.textSecondary}>
                  {option.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </View>

      {error ? (
        <AppText variant="bodySmall" color={colors.danger}>
          {error}
        </AppText>
      ) : null}

      <Button
        label="Generate my kundali"
        onPress={handleSubmit}
        loading={submitting || waitingForSync}
        style={styles.submitButton}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm, marginTop: spacing.xl, marginBottom: spacing.xl },
  field: { gap: spacing.sm, marginBottom: spacing.lg },
  genderRow: { flexDirection: 'row', gap: spacing.sm },
  genderOption: {
    flex: 1,
    height: 48,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  genderOptionSelected: { backgroundColor: colors.surface },
  submitButton: { marginTop: spacing.md, marginBottom: spacing.xxl },
});
