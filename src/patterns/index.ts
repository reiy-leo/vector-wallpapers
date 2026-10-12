/**
 * Pattern 注册入口 —— **新增 pattern 只需在此加一行**。
 *
 * PRD 的 19 个 id 已全部落地（A/B/C 各 5个、D 类 4 个）。
 * 注册顺序 = 库中展示顺序。
 *
 * ⚠️ 下方按文件夹分组的注释是历史分组；2026-10-12 分类重组后，
 * 展示分类以各 PatternDef 的 `category` 字段为准（文件未搬家）。
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
import ditherGradient from './D-pixel/dither-gradient';
import isometricVoxel from './D-pixel/isometric-voxel';

// 第三批（2026-10-12）
import stripeBands from './A-lines/stripe-bands';
import nestedShapes from './A-lines/nested-shapes';
import spiralPolygons from './A-lines/spiral-polygons';
import nodeWeb from './A-lines/node-web';
import chevron from './B-repeat/chevron';
import sunburst from './A-lines/sunburst';
import squareRings from './B-repeat/square-rings';
import raisedTiles from './B-repeat/raised-tiles';
import tortoiseGrid from './B-repeat/tortoise-grid';
import arrowRepeat from './B-repeat/arrow-repeat';
import pyramidFacets from './C-organic/pyramid-facets';
import conicMesh from './C-organic/conic-mesh';
import scatterBlobs from './C-organic/scatter-blobs';
import pebbleField from './C-organic/pebble-field';
import terrazzo from './C-organic/terrazzo';
import blobContours from './C-organic/blob-contours';
import topoLines from './A-lines/topo-lines';
import waveStripes from './A-lines/wave-stripes';
import tvStatic from './D-pixel/tv-static';
import christmasTrees from './C-organic/christmas-trees';
import pineForest from './C-organic/pine-forest';
import starryNightSky from './E-scene/starry-night-sky';
import oceanMoon from './E-scene/ocean-moon';
import mountainLake from './E-scene/mountain-lake';
import sandDunes from './E-scene/sand-dunes';
import riceTerraces from './E-scene/rice-terraces';
import citySkyline from './E-scene/city-skyline';
import sakuraFall from './E-scene/sakura-fall';
import ukiyoeFuji from './E-scene/ukiyoe-fuji';
import hotAirBalloons from './E-scene/hot-air-balloons';
import bambooMist from './E-scene/bamboo-mist';
// 第七批：9 个新分类
import seigaiha from './F-ornament/seigaiha';
import meanderKey from './F-ornament/meander-key';
import asanoha from './F-ornament/asanoha';
import shippo from './F-ornament/shippo';
import leafChain from './G-botanical/leaf-chain';
import petalScatter from './G-botanical/petal-scatter';
import palmFronds from './G-botanical/palm-fronds';
import ginkgoFans from './G-botanical/ginkgo-fans';
import dandelionWind from './G-botanical/dandelion-wind';
import fernFronds from './G-botanical/fern-fronds';
import lotusPond from './G-botanical/lotus-pond';
import wisteria from './G-botanical/wisteria';
import monstera from './G-botanical/monstera';
import constellations from './H-cosmos/constellations';
import planetOrbits from './H-cosmos/planet-orbits';
import nebulaDust from './H-cosmos/nebula-dust';
import eclipse from './H-cosmos/eclipse';
import interferenceRings from './I-optical/interference-rings';
import moireLines from './I-optical/moire-lines';
import opWaveGrid from './I-optical/op-wave-grid';
import impossibleCubes from './I-optical/impossible-cubes';
import voronoiCells from './J-generative/voronoi-cells';
import fractalTree from './J-generative/fractal-tree';
import hilbertCurve from './J-generative/hilbert-curve';
import cellularAutomaton from './J-generative/cellular-automaton';
import woodGrain from './K-texture/wood-grain';
import marbleVeins from './K-texture/marble-veins';
import basketWeave from './K-texture/basket-weave';
import linenWeave from './K-texture/linen-weave';
import archWindows from './L-architecture/arch-windows';
import staircase from './L-architecture/staircase';
import encausticTiles from './L-architecture/encaustic-tiles';
import blindsShadow from './L-architecture/blinds-shadow';
import memphisConfetti from './M-movement/memphis-confetti';
import swissGrid from './M-movement/swiss-grid';
import constructivist from './M-movement/constructivist';
import punchCard from './M-movement/punch-card';
import pawPrints from './N-animal/paw-prints';
import birdFlock from './N-animal/bird-flock';
import fishSchool from './N-animal/fish-school';
import butterflies from './N-animal/butterflies';

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
  ditherGradient,
  nouveauScroll,
  isometricVoxel,
  lowpolyFacet,
  // 第三批（2026-10-12，svgbackgrounds.com 免费集风格参考，自行实现）
  stripeBands,
  nestedShapes,
  spiralPolygons,
  nodeWeb,
  chevron,
  sunburst,
  squareRings,
  raisedTiles,
  tortoiseGrid,
  arrowRepeat,
  pyramidFacets,
  conicMesh,
  scatterBlobs,
  pebbleField,
  terrazzo,
  blobContours,
  // 第五批（2026-10-12）
  topoLines,
  waveStripes,
  tvStatic,
  christmasTrees,
  pineForest,
  starryNightSky,
  oceanMoon,
  mountainLake,
  sandDunes,
  riceTerraces,
  citySkyline,
  sakuraFall,
  ukiyoeFuji,
  hotAirBalloons,
  bambooMist,
  // 第七批（2026-10-12）：纹样/植物/宇宙/错觉/生成/材质/建筑/流派/动物
  seigaiha,
  meanderKey,
  asanoha,
  shippo,
  leafChain,
  petalScatter,
  palmFronds,
  ginkgoFans,
  dandelionWind,
  fernFronds,
  lotusPond,
  wisteria,
  monstera,
  constellations,
  planetOrbits,
  nebulaDust,
  eclipse,
  interferenceRings,
  moireLines,
  opWaveGrid,
  impossibleCubes,
  voronoiCells,
  fractalTree,
  hilbertCurve,
  cellularAutomaton,
  woodGrain,
  marbleVeins,
  basketWeave,
  linenWeave,
  archWindows,
  staircase,
  encausticTiles,
  blindsShadow,
  memphisConfetti,
  swissGrid,
  constructivist,
  punchCard,
  pawPrints,
  birdFlock,
  fishSchool,
  butterflies,
];

export const registry = createRegistry();
registry.register(ALL);

/** 已实现的 pattern id 清单（UI 层据此判断是否需要「敬请期待」占位）。 */
export const IMPLEMENTED = IMPLEMENTED_PATTERN_IDS;

export { ALL as ALL_PATTERN_DEFS };
export type { PatternDef };