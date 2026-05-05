import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';
import { initDb } from '@/lib/db';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<unknown>(null);

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!loaded) return;
      try {
        await initDb();
        if (!cancelled) setDbReady(true);
      } catch (e) {
        if (!cancelled) setDbError(e);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [loaded]);

  useEffect(() => {
    if (loaded && dbReady) {
      SplashScreen.hideAsync();
    }
  }, [loaded, dbReady]);

  if (dbError) {
    throw dbError;
  }

  if (!loaded || !dbReady) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const backgroundColor = colorScheme === 'dark' ? '#000' : '#F2F2F7';

  const light = {
    ...DefaultTheme,
    colors: { ...DefaultTheme.colors, background: '#F2F2F7', card: '#F2F2F7' },
  };
  const dark = {
    ...DarkTheme,
    colors: { ...DarkTheme.colors, background: '#000', card: '#000' },
  };

  return (
    <ThemeProvider value={colorScheme === 'dark' ? dark : light}>
      <SafeAreaProvider>
        <RootChrome backgroundColor={backgroundColor} />
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

function RootChrome({ backgroundColor }: { backgroundColor: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor }}>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          height: insets.top,
          backgroundColor,
        }}
      />
      <Stack screenOptions={{ contentStyle: { backgroundColor } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', headerShown: false }} />
      </Stack>
    </View>
  );
}
