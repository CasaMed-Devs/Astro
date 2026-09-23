import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft, Calendar, Clock } from 'lucide-react-native';
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
  parseDate,
  parseTime,
  validateBirthDetails,
  type BirthDetailsFormState,
} from '@/validation/birthDetails';
import type { Gender } from '@/types/firestore';
import { AppError } from '@/utils/errors';
import { withTimeout } from '@/utils/withTimeout';

const SAVE_TIMEOUT_MS = 15_000;

const GENDER_OPTIONS: { label: string; value: Gender }[] = [
  { label: 'Female', value: 'female' },
  { label: 'Male', value: 'male' },
  { label: 'Other', value: 'other' },
];

export default function EditProfileScreen() {
  const { profile, refreshProfile } = useAuth();
  const [form, setForm] = useState<BirthDetailsFormState>({
    fullName: profile?.name ?? '',
    dateOfBirth: profile?.dateOfBirth ? parseDate(profile.dateOfBirth) : null,
    timeOfBirth: profile?.timeOfBirth ? parseTime(profile.timeOfBirth) : null,
    placeOfBirth: profile?.placeOfBirth ?? '',
    // Already-resolved from the saved profile — re-picking the place from
    // suggestions is only required if the user actually changes it.
    place:
      profile?.latitude != null && profile?.longitude != null && profile?.timezoneOffset != null
        ? {
            latitude: profile.latitude,
            longitude: profile.longitude,
            timezoneOffset: profile.timezoneOffset,
          }
        : null,
    gender: profile?.gender ?? null,
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const validationError = validateBirthDetails(form);
    if (validationError) {
      setError(validationError);
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
      await refreshProfile().catch(() => {});
      router.back();
    } catch (err) {
      setError(err instanceof AppError ? err.message : 'Could not save your details.');
    } finally {
      setSubmitting(false);
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

      <AppText variant="displayMd" style={styles.title}>
        Edit details
      </AppText>

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
        label="Save changes"
        onPress={handleSubmit}
        loading={submitting}
        style={styles.submitButton}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  backRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.md },
  title: { marginTop: spacing.lg, marginBottom: spacing.xl },
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
