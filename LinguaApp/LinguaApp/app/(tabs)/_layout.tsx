import { Tabs } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../src/constants/theme';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: true,
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: styles.tabItem,
        tabBarActiveTintColor: Colors.white,
        tabBarInactiveTintColor: Colors.tabInactive,
        tabBarBackground: () => <View style={styles.tabBarBg} />,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={focused ? '#B8F7D4' : color} />
          ),
          title: 'Trang chủ',
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'time' : 'time-outline'}
              size={22}
              color={focused ? '#FFD59A' : color}
            />
          ),
          title: 'Lịch sử',
        }}
      />
      <Tabs.Screen
        name="calls"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    borderRadius: 30,
    height: 68,
    borderTopWidth: 0,
    elevation: 0,
    backgroundColor: 'transparent',
  },
  tabBarBg: {
    flex: 1,
    backgroundColor: 'rgba(7,14,30,0.76)',
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  tabItem: {
    paddingTop: 8,
    paddingBottom: 8,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
});
