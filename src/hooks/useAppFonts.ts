import {
  useFonts as useCormorantGaramond,
  CormorantGaramond_700Bold,
} from '@expo-google-fonts/cormorant-garamond';
import {
  useFonts as useCormorantSC,
  CormorantSC_600SemiBold,
} from '@expo-google-fonts/cormorant-sc';
import {
  useFonts as usePlusJakartaSans,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans';

export function useAppFonts() {
  const [garamondLoaded] = useCormorantGaramond({ CormorantGaramond_700Bold });
  const [scLoaded] = useCormorantSC({ CormorantSC_600SemiBold });
  const [jakartaLoaded] = usePlusJakartaSans({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });

  return garamondLoaded && scLoaded && jakartaLoaded;
}
