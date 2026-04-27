import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors, Typography, Spacing, BorderRadius } from '../../src/constants/theme';
import { useAuthStore } from '../../src/store/authStore';
import { login, loginGuest } from '../../src/services/authService';
import { friendlyErrorMessage } from '../../src/services/errors';
import { LinguaLogo } from '../../src/components/LinguaLogo';
import { GlobeIllustration } from '../../src/components/GlobeIllustration';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { setAuth } = useAuthStore();

  const handleLogin = async () => {
    if (!email.trim()) {
      Alert.alert('Thông báo', 'Vui lòng nhập email');
      return;
    }
    if (!password) {
      Alert.alert('Thông báo', 'Vui lòng nhập mật khẩu');
      return;
    }

    setIsLoading(true);
    try {
      const res = await login({ email: email.trim(), password });
      await setAuth(res.user, res.session);
      router.replace('/(tabs)');
    } catch (err: unknown) {
      Alert.alert('Đăng nhập thất bại', friendlyErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGuestMode = async () => {
    setIsLoading(true);
    try {
      const res = await loginGuest(`Guest_${Date.now().toString().slice(-4)}`);
      await setAuth(res.user, res.session);
      router.replace('/(tabs)');
    } catch (err: unknown) {
      Alert.alert('Không thể vào chế độ khách', friendlyErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <LinearGradient
      colors={['#b0c4d8', '#c8b090', '#d4957a', '#c87060']}
      locations={[0, 0.35, 0.7, 1]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={styles.gradient}
    >
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.logoRow}>
              <LinguaLogo size="md" textColor="#1a3a7a" />
            </View>

            <View style={styles.globeContainer}>
              <GlobeIllustration />
            </View>

            <Text style={styles.tagline}>KẾT NỐI MỌI NGÔN NGỮ</Text>

            <View style={styles.formCard}>
              <Text style={styles.inputLabel}>Email</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="mail-outline" size={18} color="rgba(26,58,122,0.45)" style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, styles.hostInput]}
                  placeholder="name@example.com"
                  placeholderTextColor={Colors.inputPlaceholder}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <Text style={styles.inputLabel}>Mật khẩu</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="lock-closed-outline" size={18} color="rgba(26,58,122,0.45)" style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, styles.hostInput, styles.inputWithIcon]}
                  placeholder="Mật khẩu"
                  placeholderTextColor={Colors.inputPlaceholder}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={styles.eyeBtn}
                  onPress={() => setShowPassword(!showPassword)}
                >
                  <Ionicons
                    name={showPassword ? 'eye' : 'eye-off'}
                    size={20}
                    color={Colors.inputPlaceholder}
                  />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.loginBtn}
                onPress={handleLogin}
                disabled={isLoading}
                activeOpacity={0.85}
              >
                {isLoading ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={styles.loginBtnText} numberOfLines={1}>Đăng nhập</Text>
                )}
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={() => router.push('/register')} style={styles.registerLink}>
              <Text style={styles.registerText}>
                Chưa có tài khoản? <Text style={styles.registerTextBold}>Đăng ký ngay</Text>
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleGuestMode} style={styles.guestLink}>
              <Text style={styles.guestText}>Tiếp tục không đăng nhập</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safeArea: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoRow: { marginBottom: Spacing.xs },
  globeContainer: {
    marginVertical: Spacing.sm,
    alignItems: 'center',
  },
  tagline: {
    fontSize: Typography.sm,
    fontWeight: Typography.extrabold,
    color: '#FFFFFF',
    letterSpacing: 3,
    marginBottom: Spacing.md,
    marginTop: Spacing.xs,
    textAlign: 'center',
  },
  formCard: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    marginBottom: Spacing.sm,
  },
  inputLabel: {
    fontSize: Typography.xs,
    color: 'rgba(255,255,255,0.88)',
    marginBottom: 6,
    marginLeft: 2,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
    overflow: 'hidden',
    minHeight: 46,
  },
  input: {
    flex: 1,
    minHeight: 46,
    paddingHorizontal: Spacing.base,
    fontSize: Typography.base,
    color: '#1a1a2e',
  },
  hostInput: { paddingLeft: 0 },
  inputIcon: { marginLeft: 12, marginRight: 6 },
  inputWithIcon: { paddingRight: 44 },
  helperText: {
    fontSize: Typography.xs,
    color: 'rgba(255,255,255,0.62)',
    lineHeight: 16,
    marginTop: -4,
    marginBottom: Spacing.sm,
  },
  eyeBtn: { position: 'absolute', right: 12, padding: 4 },
  loginBtn: {
    backgroundColor: '#16306a',
    borderRadius: BorderRadius.lg,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.xs,
    marginBottom: Spacing.base,
  },
  loginBtnText: {
    color: Colors.white,
    fontSize: Typography.md,
    fontWeight: Typography.bold,
    letterSpacing: 0,
  },
  registerLink: { marginTop: Spacing.xs },
  registerText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: Typography.sm,
    textAlign: 'center',
  },
  registerTextBold: {
    fontWeight: Typography.bold,
    color: Colors.white,
    textDecorationLine: 'underline',
  },
  guestLink: { marginTop: Spacing.sm, paddingBottom: Spacing.base },
  guestText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: Typography.xs,
    textAlign: 'center',
  },
});
