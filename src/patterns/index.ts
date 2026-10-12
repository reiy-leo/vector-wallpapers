/**
 * Pattern 注册入口 —— **新增 pattern 只需在此加一行**。
 *
 * PRD 的 19 个 id 已全部落地（A/B/C 各 5个、D 类 4 个）。
 * 注册顺序 = 库中展示顺序。
 */
import { createRegistry, IMPLEMENTED_PATTERN_IDS } from './registry';
import type { PatternDef } from './types';

// A 极简几何线条
import flowLines from './A-lines/flow-lines';
import offsetGrid from './A-lines/offset-grid';
import bauhausBlocks from './A-lines/bauhaus-blocks';
import arcComposition from './A-lines/arc-composition';
import contourRings from './A-lines/contour-rings';
import nouveauScroll from './A-lines/nouveau-scroll';

// B 波点 / 网格重复
import polkaDots from './B-repeat/polka-dots';
import triangleTiling from './B-repeat/triangle-tiling';
import checkerMesh from './B-repeat/checker-mesh';
import hexGrid from './B-repeat/hex-grid';
import diamondLattice from './B-repeat/diamond-lattice';
import girihStar from './B-repeat/girih-star';
import halftone from './B-repeat/halftone';
import papercut from './B-repeat/papercut';
import artDecoFan from './B-repeat/art-deco-fan';

// C 渐变流体 / 有机形态
import duskRidges from './C-organic/dusk-ridges';
import liquidMesh from './C-organic/liquid-mesh';
import auroraWave from './C-organic/aurora-wave';
import cloudBands from './C-organic/cloud-bands';
import blobField from './C-organic/blob-field';
import lowpolyFacet from './C-organic/lowpoly-facet';

// D 像素 / 复古游戏
import memphisGrid from './D-pixel/memphis-grid';
import neonPixels from './D-pixel/neon-pixels';
import newWaveSunset from './D-pixel/new-wave-sunset';
import pixelTerrain from './D-pixel/pixel-terrain';
import glitchRgb from './D-pixel/glitch-rgb';
import isometricVoxel from './D-pixel/isometric-voxel';

// 第三批（2026-10-12）
import stripeBands from './A-lines/stripe-bands';
import nestedShapes from './A-lines/nested-shapes';
import spiralPolygons from './A-lines/spiral-polygons';
import nodeWeb from './A-lines/node-web';
import chevron from './B-repeat/chevron';
import fishScales from './B-repeat/fish-scales';
import sunburst from './A-lines/sunburst';
import squareRings from './B-repeat/square-rings';
import raisedTiles from './B-repeat/raised-tiles';
import tortoiseGrid from './B-repeat/tortoise-grid';
import arrowRepeat from './B-repeat/arrow-repeat';
import pyramidFacets from './C-organic/pyramid-facets';
import conicMesh from './C-organic/conic-mesh';

/** 注册顺序 = 库中展示顺序。 */
const ALL: PatternDef[] = [
  flowLines,
  offsetGrid,
  arcComposition,
  contourRings,
  bauhausBlocks,
  polkaDots,
  hexGrid,
  diamondLattice,
  triangleTiling,
  checkerMesh,
  duskRidges,
  liquidMesh,
  auroraWave,
  cloudBands,
  blobField,
  memphisGrid,
  neonPixels,
  newWaveSunset,
  pixelTerrain,
  // 第二批（2026-10-12，依据 .agent/docs/STYLE-100-ANALYSIS.md §4.2 的结构缺口）
  girihStar,
  halftone,
  papercut,
  glitchRgb,
  artDecoFan,
  nouveauScroll,
  isometricVoxel,
  lowpolyFacet,
  // 第三批（2026-10-12，svgbackgrounds.com 免费集风格参考，自行实现）
  stripeBands,
  nestedShapes,
  spiralPolygons,
  nodeWeb,
  chevron,
  fishScales,
  sunburst,
  squareRings,
  raisedTiles,
  tortoiseGrid,
  arrowRepeat,
  pyramidFacets,
  conicMesh,
];

export const registry = createRegistry();
registry.register(ALL);

/** 已实现的 pattern id 清单（UI 层据此判断是否需要「敬请期待」占位）。 */
export const IMPLEMENTED = IMPLEMENTED_PATTERN_IDS;

export { ALL as ALL_PATTERN_DEFS };
export type { PatternDef };