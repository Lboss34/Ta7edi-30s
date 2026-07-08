import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  cancelAnimation,
} from 'react-native-reanimated';

interface TimerProps {
  seconds: number;
  running: boolean;
  onComplete: () => void;
  onTick?: () => void;
}

export function Timer({ seconds, running, onComplete, onTick }: TimerProps) {
  const [remaining, setRemaining] = useState(seconds);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const onTickRef = useRef(onTick);
  onTickRef.current = onTick;

  const scale = useSharedValue(1);
  const glow = useSharedValue(1);

  useEffect(() => {
    setRemaining(seconds);
  }, [seconds]);

  useEffect(() => {
    if (!running) return;
    setRemaining(seconds);
    const id = setInterval(() => {
      onTickRef.current?.();
      setRemaining(prev => {
        if (prev <= 1) {
          clearInterval(id);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (running && remaining === 0) {
      onCompleteRef.current();
    }
  }, [running, remaining]);

  // Pulse when time is low
  const isLow = running && remaining > 0 && remaining <= 10;
  useEffect(() => {
    if (isLow) {
      scale.value = withRepeat(
        withSequence(withTiming(1.12, { duration: 280 }), withTiming(1, { duration: 280 })),
        -1,
        false,
      );
      glow.value = withRepeat(
        withSequence(withTiming(0.4, { duration: 280 }), withTiming(1, { duration: 280 })),
        -1,
        false,
      );
    } else {
      cancelAnimation(scale);
      cancelAnimation(glow);
      scale.value = withTiming(1, { duration: 200 });
      glow.value = withTiming(1, { duration: 200 });
    }
  }, [isLow]);

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));

  const isWarning = remaining <= 10;
  const isMid = remaining > 10 && remaining <= 20;
  const color = isWarning ? '#FF3B3B' : isMid ? '#FFD700' : '#00E5FF';
  const progress = Math.max(0, remaining / seconds);

  return (
    <View style={styles.wrap}>
      <Animated.View style={animStyle}>
        <Animated.View
          style={[
            styles.circle,
            { borderColor: color },
            glowStyle,
            Platform.OS !== 'web' && { shadowColor: color },
          ]}
        >
          <Text style={[styles.num, { color }]}>{remaining}</Text>
          <Text style={[styles.sec, { color }]}>ثانية</Text>
        </Animated.View>
      </Animated.View>
      <View style={styles.track}>
        <View style={[styles.fill, { backgroundColor: color, width: `${Math.round(progress * 100)}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 16 },
  circle: {
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0A0A22',
    shadowOpacity: 0.9,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 0 },
    elevation: 16,
  },
  num: { fontSize: 52, fontFamily: 'Inter_700Bold', lineHeight: 60 },
  sec: { fontSize: 13, fontFamily: 'Inter_500Medium', marginTop: -4 },
  track: { width: 220, height: 6, backgroundColor: '#1A1A4A', borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
});
