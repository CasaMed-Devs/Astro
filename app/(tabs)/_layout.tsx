import { Redirect, Tabs } from 'expo-router';
import { Home, Sparkles, Users, User } from 'lucide-react-native';

import { useAuth } from '@/features/auth/context/AuthProvider';
import { LoadingView } from '@/components/states/LoadingView';
import { colors } from '@/constants/theme';

export default function TabsLayout() {
  const { status, hasBirthDetails } = useAuth();

  if (status === 'loading') return <LoadingView />;
  if (status === 'unauthenticated') return <Redirect href="/(onboarding)" />;
  if (!hasBirthDetails) return <Redirect href="/(onboarding)/birth-details" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="horoscope"
        options={{
          title: 'Horoscope',
          tabBarIcon: ({ color, size }) => <Sparkles color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="astrologers"
        options={{
          title: 'Astrologers',
          tabBarIcon: ({ color, size }) => <Users color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
