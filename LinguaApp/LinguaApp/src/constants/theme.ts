// LINGUA Design System - Colors, Typography, Spacing

export const Colors = {
  // Primary gradient stops (xanh tím như Figma)
  gradientStart: '#667eea',
  gradientMid: '#764ba2',
  gradientEnd: '#f093fb',

  // Background gradient (warm - như Settings/Info/Version screens)
  bgWarmStart: '#c8a97e',
  bgWarmMid: '#b5a89a',
  bgWarmEnd: '#e8a87c',

  // Green/orange gradient (Main screen)
  bgCoolStart: '#a8c5a0',
  bgCoolMid: '#c4a882',
  bgCoolEnd: '#d4956a',

  // Brand blue (Logo, button đăng nhập)
  primary: '#1565C0',
  primaryLight: '#2196F3',
  primaryDark: '#0D47A1',

  // Accent (Hola bubble - cam đỏ)
  accent: '#E53935',
  accentOrange: '#FF6B35',

  // Text
  textPrimary: '#FFFFFF',
  textSecondary: 'rgba(255, 255, 255, 0.7)',
  textDark: '#1A1A2E',
  textMuted: 'rgba(255,255,255,0.5)',

  // Glass cards
  glassBg: 'rgba(255, 255, 255, 0.15)',
  glassBorder: 'rgba(255, 255, 255, 0.25)',
  glassBgDark: 'rgba(0, 0, 0, 0.2)',

  // Input fields
  inputBg: 'rgba(255, 255, 255, 0.9)',
  inputBorder: 'rgba(255, 255, 255, 0.3)',
  inputText: '#333333',
  inputPlaceholder: '#999999',

  // Status
  online: '#4CAF50',
  offline: '#F44336',
  away: '#FF9800',

  // Misc
  white: '#FFFFFF',
  black: '#000000',
  separator: 'rgba(255,255,255,0.2)',
  overlay: 'rgba(0,0,0,0.4)',

  // Tab bar
  tabActive: '#FFFFFF',
  tabInactive: 'rgba(255,255,255,0.5)',
  tabBg: 'rgba(0,0,0,0.3)',
};

export const Typography = {
  // Sizes
  xs: 10,
  sm: 12,
  base: 14,
  md: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 28,
  '4xl': 32,

  // Weights
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,

  // Line heights
  tight: 1.2,
  normal: 1.5,
  relaxed: 1.7,
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
  '5xl': 64,
};

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  full: 9999,
};

export const Shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
};
