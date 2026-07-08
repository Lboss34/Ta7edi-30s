import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useColors } from '@/hooks/useColors';

interface Props {
  players: [string, string];
  scores: [number, number];
  currentRound?: number;
}

export function ScoreBoard({ players, scores, currentRound }: Props) {
  const colors = useColors();

  return (
    <View style={styles.row}>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: '#7B2FFF' }]}>
        <Text style={[styles.name, { color: '#7B2FFF' }]} numberOfLines={1}>{players[0]}</Text>
        <Text style={[styles.score, { color: colors.foreground }]}>{scores[0]}</Text>
        <Text style={[styles.unit, { color: colors.mutedForeground }]}>نقطة</Text>
      </View>

      <View style={styles.mid}>
        {currentRound !== undefined && (
          <Text style={[styles.roundLbl, { color: colors.primary }]}>الجولة {currentRound}</Text>
        )}
        <Text style={[styles.vs, { color: colors.mutedForeground }]}>VS</Text>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: '#00E5FF' }]}>
        <Text style={[styles.name, { color: '#00E5FF' }]} numberOfLines={1}>{players[1]}</Text>
        <Text style={[styles.score, { color: colors.foreground }]}>{scores[1]}</Text>
        <Text style={[styles.unit, { color: colors.mutedForeground }]}>نقطة</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  card: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderRadius: 16,
    borderWidth: 1.5,
    gap: 2,
  },
  name: { fontSize: 12, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  score: { fontSize: 42, fontFamily: 'Inter_700Bold', lineHeight: 50 },
  unit: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  mid: { alignItems: 'center', justifyContent: 'center', gap: 3, minWidth: 50 },
  roundLbl: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  vs: { fontSize: 14, fontFamily: 'Inter_700Bold', letterSpacing: 2 },
});
