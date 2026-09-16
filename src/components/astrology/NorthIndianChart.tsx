/**
 * NorthIndianChart — draws the traditional 12-house North Indian Kundali
 * chart using react-native-svg.
 *
 * House layout (house numbers, not signs):
 *
 *   ┌─────┬─────┬─────┐
 *   │ 12  │  1  │  2  │
 *   ├─────┼─────┼─────┤
 *   │ 11  │     │  3  │
 *   ├─────┼─────┼─────┤
 *   │ 10  │  9  │  8  │ …and houses 4-7 fill the bottom row
 *   └─────┴─────┴─────┘
 *
 * Ascendant sign occupies House 1 (top-center diamond).
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Line, Polygon, Text as SvgText, G } from 'react-native-svg';

import { colors, fonts } from '@/constants/theme';
import type { ReportPlanet, ReportKundali } from '@/types/firestore';

const SIGN_ABBR = ['Ar', 'Ta', 'Ge', 'Ca', 'Le', 'Vi', 'Li', 'Sc', 'Sa', 'Cp', 'Aq', 'Pi'];
const PLANET_ABBR: Record<string, string> = {
  Sun: 'Su',
  Moon: 'Mo',
  Mars: 'Ma',
  Mercury: 'Me',
  Jupiter: 'Ju',
  Venus: 'Ve',
  Saturn: 'Sa',
  Rahu: 'Ra',
  Ketu: 'Ke',
  Uranus: 'Ur',
  Neptune: 'Ne',
  Pluto: 'Pl',
  Ascendant: 'As',
};

// North Indian chart: fixed house positions on the 4x4 grid.
// Each cell is identified by [row, col] (0-indexed).
// The center 2x2 cells (rows 1-2, cols 1-2) are merged into the inner diamond.
const HOUSE_CELLS: Record<number, [number, number]> = {
  1:  [0, 1],
  2:  [0, 2],
  3:  [1, 2],
  4:  [2, 2],
  5:  [3, 2],
  6:  [3, 1],
  7:  [3, 0],
  8:  [2, 0],
  9:  [1, 0],
  10: [0, 0],
  11: [0, 1], // will be handled by the diamond layout - actually:
  12: [0, 2],
};

// North Indian fixed positions (clockwise from top):
// Outer squares: TL, TC, TR, MR, BR, BC, BL, ML
// Inner diamond: 4 triangles
// Standard mapping of houses to positions in a 4×4 grid:
type HouseLayout = {
  center: [number, number]; // center for text placement (x,y in 0..1 normalized)
  sign?: number; // sign number 1..12 goes here in Lagna chart
};

function buildHouseMap(lagnaSign: number): Map<number, number> {
  // house h has sign = ((lagnaSign - 1 + h - 1) % 12) + 1
  const map = new Map<number, number>();
  for (let h = 1; h <= 12; h++) {
    map.set(h, ((lagnaSign - 1 + h - 1) % 12) + 1);
  }
  return map;
}

function groupPlanetsByHouse(planets: ReportPlanet[]): Map<number, ReportPlanet[]> {
  const map = new Map<number, ReportPlanet[]>();
  for (const p of planets) {
    const h = p.houseNumber ?? 0;
    if (h < 1 || h > 12) continue;
    if (!map.has(h)) map.set(h, []);
    map.get(h)!.push(p);
  }
  return map;
}

/* ─── geometry helpers ─────────────────────────────────────── */

interface Props {
  kundali: ReportKundali;
  size?: number;
}

export function NorthIndianChart({ kundali, size = 320 }: Props) {
  const s = size;
  const q = s / 4; // quarter size

  // Find ascendant sign (currentSign of planet named "Ascendant", or first planet's currentSign)
  const ascendant = kundali.planets.find((p) => p.name === 'Ascendant');
  const lagnaSign = ascendant?.currentSign ?? 1;

  const houseSignMap = buildHouseMap(lagnaSign);
  const planetsByHouse = groupPlanetsByHouse(kundali.planets.filter((p) => p.name !== 'Ascendant'));

  // House cell centers — North Indian layout:
  // 12 houses arranged in specific cells within 4×4 grid
  // [house] → [cx, cy] center in pixels
  const houseCenters: Record<number, [number, number]> = {
    1:  [2 * q, 0.5 * q],          // top center
    2:  [3.5 * q, 0.5 * q],        // top right
    3:  [3.5 * q, 2 * q],          // middle right
    4:  [3.5 * q, 3.5 * q],        // bottom right
    5:  [2 * q, 3.5 * q],          // bottom center
    6:  [0.5 * q, 3.5 * q],        // bottom left
    7:  [0.5 * q, 2 * q],          // middle left (adjusted below)
    8:  [0.5 * q, 2 * q],          // middle left
    9:  [0.5 * q, 0.5 * q],        // top left
    10: [2 * q, 2 * q],            // center (inner - bottom)
    11: [2 * q, 2 * q],            // center inner
    12: [2 * q, 2 * q],            // center inner
  };

  // More precise centers for North Indian chart (3×3 grid of 9 cells + 4 inner triangles):
  // The standard North Indian chart is a square divided into 12 sections:
  // 4 corner cells + 4 edge cells + 4 inner triangles
  //
  // Standard positions:
  const centers: Record<number, [number, number]> = {
    1:  [s / 2, q / 2],               // top center cell mid
    2:  [s - q / 2, q / 2],           // top-right corner
    3:  [s - q / 2, s / 2],           // right center
    4:  [s - q / 2, s - q / 2],       // bottom-right corner
    5:  [s / 2, s - q / 2],           // bottom center
    6:  [q / 2, s - q / 2],           // bottom-left corner
    7:  [q / 2, s / 2],               // left center
    8:  [q / 2, q / 2],               // top-left corner
    9:  [s / 2 - q * 0.5, s / 2 + q * 0.25],  // inner bottom-left triangle
    10: [s / 2, s / 2 + q * 0.4],    // inner bottom triangle
    11: [s / 2 + q * 0.5, s / 2 + q * 0.25],  // inner bottom-right triangle
    12: [s / 2, s / 2 - q * 0.4],    // inner top triangle
  };

  // Recalculate proper inner diamond triangle centers:
  // Inner area: from (q, q) to (3q, 3q), center at (2q, 2q)
  const innerCx = s / 2;
  const innerCy = s / 2;
  const innerR = q; // half-size of inner square

  // 4 inner triangle centers
  const innerCenters: Record<number, [number, number]> = {
    12: [innerCx, innerCy - innerR * 0.55],  // top inner triangle
    3:  [innerCx + innerR * 0.55, innerCy],  // right inner triangle  
    10: [innerCx, innerCy + innerR * 0.55],  // bottom inner triangle
    9:  [innerCx - innerR * 0.55, innerCy],  // left inner triangle
  };

  // Outer house centers (8 outer houses)
  const outerCenters: Record<number, [number, number]> = {
    1: [innerCx, q / 2],
    2: [s - q / 2, q / 2],
    3: [s - q / 2, innerCy],
    4: [s - q / 2, s - q / 2],
    5: [innerCx, s - q / 2],
    6: [q / 2, s - q / 2],
    7: [q / 2, innerCy],
    8: [q / 2, q / 2],
  };

  const allCenters: Record<number, [number, number]> = {
    ...outerCenters,
    ...innerCenters,
  };

  function renderHouseText(house: number) {
    const [cx, cy] = allCenters[house] ?? [0, 0];
    const sign = houseSignMap.get(house) ?? 1;
    const signName = SIGN_ABBR[(sign - 1) % 12];
    const planets = planetsByHouse.get(house) ?? [];
    const planetStr = planets.map((p) => (p.isRetrograde ? `${PLANET_ABBR[p.name] ?? p.name.slice(0,2)}(R)` : PLANET_ABBR[p.name] ?? p.name.slice(0,2))).join(' ');

    return (
      <G key={house}>
        {/* Sign number */}
        <SvgText
          x={cx}
          y={cy - 6}
          textAnchor="middle"
          fontSize={10}
          fontFamily={fonts.bodySemiBold}
          fill={colors.primary}
        >
          {sign} {signName}
        </SvgText>
        {/* Planets — always rendered (even empty) so this <G>'s child count
            never changes between renders; react-native-svg under Fabric can
            crash with "addViewAt: ... already has a parent" when an SVG
            node's children are conditionally added/removed across renders. */}
        <SvgText
          x={cx}
          y={cy + 9}
          textAnchor="middle"
          fontSize={9}
          fontFamily={fonts.bodyRegular}
          fill={colors.textPrimary}
        >
          {planetStr}
        </SvgText>
      </G>
    );
  }

  return (
    <View style={styles.container}>
      <Svg width={s} height={s}>
        {/* Outer border */}
        <Polygon
          points={`0,0 ${s},0 ${s},${s} 0,${s}`}
          fill={colors.surfaceMuted}
          stroke={colors.primary}
          strokeWidth={1.5}
        />

        {/* Inner diamond */}
        <Polygon
          points={`${q},${q} ${3*q},${q} ${3*q},${3*q} ${q},${3*q}`}
          fill="none"
          stroke={colors.primary}
          strokeWidth={1}
        />

        {/* Inner X diagonals (creates 4 triangles inside the center square) */}
        <Line x1={q} y1={q} x2={3*q} y2={3*q} stroke={colors.primary} strokeWidth={1} />
        <Line x1={3*q} y1={q} x2={q} y2={3*q} stroke={colors.primary} strokeWidth={1} />

        {/* Outer grid lines (vertical and horizontal through center) */}
        <Line x1={s/2} y1={0} x2={s/2} y2={q} stroke={colors.primary} strokeWidth={1} />
        <Line x1={s/2} y1={3*q} x2={s/2} y2={s} stroke={colors.primary} strokeWidth={1} />
        <Line x1={0} y1={s/2} x2={q} y2={s/2} stroke={colors.primary} strokeWidth={1} />
        <Line x1={3*q} y1={s/2} x2={s} y2={s/2} stroke={colors.primary} strokeWidth={1} />

        {/* Render all 12 houses */}
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(renderHouseText)}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
