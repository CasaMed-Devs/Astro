import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { useScrollIntoView } from '@/components/common/Screen';
import { Input } from '@/components/forms/Input';
import { colors, radii, spacing } from '@/constants/theme';
import { searchPlaces, resolvePlace, type PlaceSuggestion } from '@/services/places.service';
import type { ResolvedBirthPlace } from '@/validation/birthDetails';

const DEBOUNCE_MS = 350;
// Room left above the field when it scrolls into view, so its label stays visible.
const SCROLL_TOP_OFFSET = 40;

interface PlaceAutocompleteInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onResolved: (place: ResolvedBirthPlace | null) => void;
  /** Any moment on the birth date — used to resolve the correct historical UTC offset. */
  timestampSeconds: number;
}

export function PlaceAutocompleteInput({
  value,
  onChangeText,
  onResolved,
  timestampSeconds,
}: PlaceAutocompleteInputProps) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  const containerRef = useRef<View>(null);
  const focusedRef = useRef(false);
  const scrollIntoView = useScrollIntoView();

  // Moves the field to the top of the screen so the suggestions open in the
  // space above the keyboard instead of underneath it.
  const revealSuggestions = () => scrollIntoView(containerRef.current, SCROLL_TOP_OFFSET);

  // On focus the keyboard is still sliding up and the scroll area hasn't
  // shrunk yet, so scroll once it has finished showing.
  useEffect(() => {
    const subscription = Keyboard.addListener('keyboardDidShow', () => {
      if (focusedRef.current) scrollIntoView(containerRef.current, SCROLL_TOP_OFFSET);
    });
    return () => subscription.remove();
  }, [scrollIntoView]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleChangeText = (text: string) => {
    onChangeText(text);
    onResolved(null);
    setSuggestions([]);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    const query = text.trim();
    if (query.length < 3) {
      setSearching(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await searchPlaces(query);
        if (requestIdRef.current === requestId) {
          setSuggestions(results);
        }
      } catch {
        if (requestIdRef.current === requestId) {
          setSuggestions([]);
        }
      } finally {
        if (requestIdRef.current === requestId) {
          setSearching(false);
        }
      }
    }, DEBOUNCE_MS);
  };

  const handleSelect = async (suggestion: PlaceSuggestion) => {
    requestIdRef.current += 1; // cancel any in-flight search
    setSuggestions([]);
    onChangeText(suggestion.description);
    setResolving(true);
    try {
      const resolved = await resolvePlace(suggestion.placeId, timestampSeconds);
      onChangeText(resolved.completeName);
      onResolved({
        latitude: resolved.latitude,
        longitude: resolved.longitude,
        timezoneOffset: resolved.timezoneOffset,
      });
    } catch {
      onResolved(null);
    } finally {
      setResolving(false);
    }
  };

  return (
    <View ref={containerRef} collapsable={false}>
      <Input
        value={value}
        onChangeText={handleChangeText}
        onFocus={() => {
          focusedRef.current = true;
          revealSuggestions();
        }}
        onBlur={() => {
          focusedRef.current = false;
        }}
        placeholder="Start typing a city..."
        rightAccessory={
          searching || resolving ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : undefined
        }
      />
      {suggestions.length > 0 ? (
        <View style={styles.dropdown} onLayout={revealSuggestions}>
          {suggestions.map((suggestion) => (
            <Pressable
              key={suggestion.placeId}
              style={styles.suggestionRow}
              onPress={() => handleSelect(suggestion)}
            >
              <AppText variant="body" color={colors.textPrimary}>
                {suggestion.description}
              </AppText>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dropdown: {
    marginTop: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    overflow: 'hidden',
  },
  suggestionRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
});
