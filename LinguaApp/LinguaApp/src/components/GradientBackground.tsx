import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface GradientBackgroundProps {
  children: React.ReactNode;
  style?: ViewStyle;
  variant?: 'auth' | 'warm' | 'cool' | 'call';
}

const GRADIENTS = {
  auth: ['#667eea', '#764ba2', '#f093fb'] as const,
  warm: ['#c8b89a', '#b8a090', '#d4957a', '#e8a07c'] as const,
  cool: ['#8fbc8f', '#b8a882', '#c4957a', '#d4856a'] as const,
  call: ['#2C3E50', '#3D5A72', '#4A7B9D'] as const,
};

const LOCATIONS = {
  auth: [0, 0.5, 1] as const,
  warm: [0, 0.33, 0.66, 1] as const,
  cool: [0, 0.33, 0.66, 1] as const,
  call: [0, 0.5, 1] as const,
};

export const GradientBackground: React.FC<GradientBackgroundProps> = ({
  children,
  style,
  variant = 'warm',
}) => {
  return (
    <LinearGradient
      colors={GRADIENTS[variant]}
      locations={LOCATIONS[variant]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={[styles.gradient, style]}
    >
      {children}
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
});
