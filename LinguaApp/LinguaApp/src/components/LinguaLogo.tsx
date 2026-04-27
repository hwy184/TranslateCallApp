/**
 * LinguaLogo - Logo chính thức của LINGUA
 * Dùng nhất quán trên tất cả màn hình
 * Dựa theo thiết kế: rounded square navy + globe + chatbubbles + text "LINGUA"
 */
import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface LinguaLogoProps {
  size?: 'sm' | 'md' | 'lg';
  style?: ViewStyle;
  /** true = chỉ hiện icon (không có chữ LINGUA) */
  iconOnly?: boolean;
  /** màu text LINGUA, mặc định navy */
  textColor?: string;
}

const SIZES = {
  sm: { box: 32, icon: 16, font: 16, radius: 8, gap: 6 },
  md: { box: 44, icon: 22, font: 22, radius: 12, gap: 8 },
  lg: { box: 58, icon: 29, font: 28, radius: 16, gap: 10 },
};

export const LinguaLogo: React.FC<LinguaLogoProps> = ({
  size = 'md',
  style,
  iconOnly = false,
  textColor = '#2196F3',
}) => {
  const s = SIZES[size];
  return (
    <View style={[styles.row, style]}>
      {/* Icon box: navy rounded square với globe + chat bubbles */}
      <View
        style={[
          styles.iconBox,
          {
            width: s.box,
            height: s.box,
            borderRadius: s.radius,
          },
        ]}
      >
        {/* Main globe */}
        <Ionicons name="globe-outline" size={s.icon} color="#FFFFFF" />

        {/* Chat bubble dots (top-right) */}
        <View style={[styles.bubbleDot, styles.bubbleDotTR, { width: s.icon * 0.45, height: s.icon * 0.45 }]} />
        {/* Chat bubble dots (bottom-left) */}
        <View style={[styles.bubbleDot, styles.bubbleDotBL, { width: s.icon * 0.38, height: s.icon * 0.38 }]} />
      </View>

      {/* "LINGUA" text */}
      {!iconOnly && (
        <Text
          style={[
            styles.logoText,
            { fontSize: s.font, color: textColor },
          ]}
        >
          LINGUA
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBox: {
    backgroundColor: '#1a3a7a',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'visible',
    // Outer shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  bubbleDot: {
    position: 'absolute',
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  bubbleDotTR: {
    top: 3,
    right: 3,
  },
  bubbleDotBL: {
    bottom: 4,
    left: 3,
  },
  logoText: {
    fontWeight: '800',
    letterSpacing: 1.5,
    marginLeft: 8,
  },
});
