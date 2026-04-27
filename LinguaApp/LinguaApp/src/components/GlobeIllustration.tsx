/**
 * GlobeIllustration - Dùng hình ảnh thực tế đã xoá phông từ Figma
 * Quả địa cầu cầu vồng với 4 speech bubbles: Hello / Hola / Xin chào / こんにちは
 */
import React from 'react';
import { View, Image, StyleSheet, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');

// Kích thước lớn hơn để match Figma — globe chiếm phần lớn nửa trên màn hình
const GLOBE_SIZE = Math.min(width * 0.75, 280);

export const GlobeIllustration: React.FC = () => {
  return (
    <View style={[styles.wrapper, { width: GLOBE_SIZE, height: GLOBE_SIZE }]}>
      <Image
        source={require('../../assets/images/globe_illustration.png')}
        style={styles.image}
        resizeMode="contain"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
