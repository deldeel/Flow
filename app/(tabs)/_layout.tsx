import React from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Tabs } from 'expo-router';
import { Link } from 'expo-router';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';

// You can explore the built-in icon families and icons on the web at https://icons.expo.fyi/
function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  return <FontAwesome size={Platform.OS === 'web' ? 26 : 28} style={{ marginBottom: -3 }} {...props} />;
}

function HeaderGear({ colorScheme }: { colorScheme: 'light' | 'dark' | null | undefined }) {
  const scheme = (colorScheme ?? 'light') as keyof typeof Colors;
  return (
    <Link href="/modal" asChild>
      <Pressable style={styles.headerIconBtn} accessibilityLabel="设置">
        {({ pressed }) => (
          <View style={[styles.headerIconBubble, { opacity: pressed ? 0.7 : 1 }]}>
            <FontAwesome name="gear" size={18} color={Colors[scheme].text} />
          </View>
        )}
      </Pressable>
    </Link>
  );
}

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const isWeb = Platform.OS === 'web';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        tabBarInactiveTintColor: '#8E8E93',
        sceneStyle: { backgroundColor: '#F2F2F7' },
        tabBarStyle: {
          backgroundColor: '#F2F2F7',
          borderTopColor: '#E5E5E5',
          ...(isWeb
            ? {
                height: 78,
                paddingBottom: 16,
                paddingTop: 8,
              }
            : null),
        },
        tabBarLabelStyle: isWeb ? { fontSize: 12, marginTop: 2 } : undefined,
        headerStyle: { backgroundColor: '#F2F2F7' },
        headerTitleAlign: 'center',
        headerShadowVisible: false,
        // Disable the static render of the header on web
        // to prevent a hydration error in React Navigation v6.
        headerShown: useClientOnlyValue(false, true),
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: '记一笔',
          tabBarActiveTintColor: '#4D96FF',
          tabBarIcon: ({ color }) => <TabBarIcon name="pencil" color={color} />,
          headerRight: () => <HeaderGear colorScheme={colorScheme} />,
        }}
      />
      <Tabs.Screen
        name="two"
        options={{
          title: '流水',
          headerTitle: '',
          tabBarActiveTintColor: '#26A69A',
          tabBarIcon: ({ color }) => <TabBarIcon name="list" color={color} />,
          headerRight: () => <HeaderGear colorScheme={colorScheme} />,
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: '图表',
          headerTitle: '',
          tabBarActiveTintColor: '#9B59B6',
          tabBarIcon: ({ color }) => <TabBarIcon name="bar-chart" color={color} />,
          headerRight: () => <HeaderGear colorScheme={colorScheme} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  headerIconBtn: { paddingRight: 14 },
  headerIconBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
});
