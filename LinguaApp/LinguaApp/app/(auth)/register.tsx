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
import { LinguaLogo } from '../../src/components/LinguaLogo';
import { GlobeIllustration } from '../../src/components/GlobeIllustration';
import { register } from '../../src/services/authService';
import { syncLocalHistoryToCloud } from '../../src/services/historyService';
import { useAuthStore } from '../../src/store/authStore';
import { friendlyErrorMessage } from '../../src/services/errors';

export default function RegisterScreen() {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { setAuth } = useAuthStore();

  const handleRegister = async () => {
    if (!email.trim()) {
      Alert.alert('Thông báo', 'Vui lòng nhập email');
      return;
    }

    if (password.length < 8) {
      Alert.alert('Thông báo', 'Mật khẩu tối thiểu 8 ký tự');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Thông báo', 'Mật khẩu xác nhận không khớp');
      return;
    }

    setIsLoading(true);
    try {
      const res = await register({
        email: email.trim(),
        password,
        displayName: displayName.trim() || undefined,
      });
      await setAuth(res.user, res.session);
      await syncLocalHistoryToCloud().catch(() => 0);
      router.replace('/(tabs)');
    } catch (err: unknown) {
      Alert.alert('Đăng ký thất bại', friendlyErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <LinearGradient
      colors={['#4a6fa5', '#6b8cba', '#c4a882', '#d4957a']}
      locations={[0, 0.35, 0.7, 1]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.gradient}
    >
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.headerRow}>
              <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                <Ionicons name="chevron-back" size={24} color={Colors.white} />
              </TouchableOpacity>
              <LinguaLogo size="sm" textColor="#1a3a7a" />
              <View style={{ width: 40 }} />
            </View>

            <View style={styles.globeContainer}>
              <GlobeIllustration />
            </View>

            <Text style={styles.tagline}>KẾT NỐI MỌI NGÔN NGỮ</Text>

            <View style={styles.formCard}>
              <Text style={styles.inputLabel}>Email</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  placeholder="name@example.com"
                  placeholderTextColor={Colors.inputPlaceholder}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                />
              </View>

              <Text style={styles.inputLabel}>Tên hiển thị (không bắt buộc)</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  placeholder="Tên của bạn"
                  placeholderTextColor={Colors.inputPlaceholder}
                  value={displayName}
                  onChangeText={setDisplayName}
                />
              </View>

              <Text style={styles.inputLabel}>Mật khẩu</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={[styles.input, styles.inputWithIcon]}
                  placeholder="Mật khẩu"
                  placeholderTextColor={Colors.inputPlaceholder}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={styles.eyeButton}
                  onPress={() => setShowPassword(!showPassword)}
                >
                  <Ionicons
                    name={showPassword ? 'eye' : 'eye-off'}
                    size={20}
                    color={Colors.inputPlaceholder}
                  />
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>Xác nhận mật khẩu</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={[styles.input, styles.inputWithIcon]}
                  placeholder="Xác nhận mật khẩu"
                  placeholderTextColor={Colors.inputPlaceholder}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirm}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={styles.eyeButton}
                  onPress={() => setShowConfirm(!showConfirm)}
                >
                  <Ionicons
                    name={showConfirm ? 'eye' : 'eye-off'}
                    size={20}
                    color={Colors.inputPlaceholder}
                  />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.registerButton}
                onPress={handleRegister}
                disabled={isLoading}
                activeOpacity={0.85}
              >
                {isLoading ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={styles.registerButtonText}>Đăng ký</Text>
                )}
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={() => router.back()} style={styles.loginLink}>
              <Text style={styles.loginText}>
                Đã có tài khoản? <Text style={styles.loginTextBold}>Đăng nhập</Text>
              </Text>
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
  keyboardView: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing['2xl'],
    alignItems: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: Spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1a3a7a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tagline: {
    fontSize: Typography.sm,
    fontWeight: Typography.extrabold,
    color: '#FFFFFF',
    letterSpacing: 3,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  globeContainer: {
    marginVertical: Spacing.xs,
    alignItems: 'center',
  },
  formCard: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: BorderRadius.xl,
    padding: Spacing.base,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  inputLabel: {
    fontSize: Typography.sm,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
    marginLeft: 2,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.inputBg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
    overflow: 'hidden',
  },
  input: {
    flex: 1,
    height: 48,
    paddingHorizontal: Spacing.base,
    fontSize: Typography.base,
    color: Colors.inputText,
  },
  inputWithIcon: { paddingRight: 44 },
  eyeButton: { position: 'absolute', right: 12, padding: 4 },
  registerButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  registerButtonText: {
    color: Colors.white,
    fontSize: Typography.md,
    fontWeight: Typography.bold,
  },
  loginLink: { marginTop: Spacing.base },
  loginText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: Typography.sm,
    textAlign: 'center',
  },
  loginTextBold: {
    fontWeight: Typography.bold,
    color: Colors.white,
    textDecorationLine: 'underline',
  },
});
