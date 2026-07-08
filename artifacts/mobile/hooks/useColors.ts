import { useColorScheme } from 'react-native';
import colors from '@/constants/colors';

/**
 * Returns the design tokens for the current color scheme.
 *
 * The returned object contains all color tokens for the active palette
 * plus scheme-independent values like `radius`.
 */
export function useColors() {
  const scheme = useColorScheme();
  // Extract only the palette keys (not radius) to avoid Record type mismatch.
  type Palette = typeof colors.light;
  type PaletteMap = { light: Palette; dark?: Palette };
  const paletteMap = colors as PaletteMap;
  const palette: Palette =
    scheme === 'dark' && paletteMap.dark ? paletteMap.dark : paletteMap.light;
  return { ...palette, radius: colors.radius };
}
