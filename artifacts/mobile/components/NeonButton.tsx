import React, { useRef } from 'react';
import { TouchableOpacity, Text, StyleSheet, Animated, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';

export type ButtonVariant = 'primary' | 'secondary' | 'accent' | 'danger' | 'ghost';

interface NeonButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  style?: ViewStyle;
  large?: boolean;
}

const VARIANTS: Record<ButtonVariant, { colors: [string, string]; text: string; shadow: string }> = {
  primary: { colors: ['#FFD700', '#FFA500'], text: '#050510', shadow: '#FFD700' },
  secondary: { colors: ['#7B2FFF', '#5B1FBF'], text: '#FFFFFF', shadow: '#7B2FFF' },
  accent: { colors: ['#00E5FF', '#00A8CC'], text: '#050510', shadow: '#00E5FF' },
  danger: { colors: ['#FF3B3B', '#CC1010'], text: '#FFFFFF', shadow: '#FF3B3B' },
  ghost: { colors: ['#1A1A4A', '#12123A'], text: '#E8E8FF', shadow: 'transparent' },
};

export function NeonButton({ title, onPress, variant = 'primary', disabled = false, style, large = false }: NeonButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const cfg = VARIANTS[variant];

  const onPressIn = () =>
    Animated.spring(scale, { toValue: 0.95, useNativeDriver: true, speed: 50 }).start();

  const onPressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20 }).start();

  const handlePress = () => {
    if (!disabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onPress();
    }
  };

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <TouchableOpacity
        onPress={handlePress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        activeOpacity={1}
        disabled={disabled}
      >
        <LinearGradient
          colors={disabled ? ['#1E1E3A', '#16163A'] : cfg.colors}
          style={[
            styles.btn,
            large && styles.btnLarge,
            !disabled && {
              shadowColor: cfg.shadow,
              shadowOpacity: 0.65,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 6 },
              elevation: 12,
            },
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          <Text style={[styles.text, large && styles.textLarge, { color: disabled ? '#4A4A7A' : cfg.text }]}>
            {title}
          </Text>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnLarge: { paddingVertical: 18, borderRadius: 20 },
  text: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  textLarge: { fontSize: 20 },
});
