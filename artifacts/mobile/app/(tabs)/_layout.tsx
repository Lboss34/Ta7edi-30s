import { Stack } from 'expo-router';

export default function GameLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade_from_bottom' }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="game" />
      <Stack.Screen name="round1" />
      <Stack.Screen name="round2" />
      <Stack.Screen name="round3" />
      <Stack.Screen name="round4" />
      <Stack.Screen name="round5" />
      <Stack.Screen name="tiebreaker" />
      <Stack.Screen name="results" />
      <Stack.Screen name="leaderboard" />
      <Stack.Screen name="mp-game" />
      <Stack.Screen name="mp-round1" />
      <Stack.Screen name="mp-round2" />
      <Stack.Screen name="mp-round3" />
      <Stack.Screen name="mp-round5" />
      <Stack.Screen name="mp-results" />
      <Stack.Screen name="mp-tiebreaker" />
    </Stack>
  );
}
