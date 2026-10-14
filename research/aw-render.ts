import { writeFileSync, mkdirSync } from 'node:fs';
import def from '../src/patterns/C-organic/aurora-wave';
import { renderStandaloneSVG, createDefaultConfig, applyPreset } from '../src/engine/render';
const out = process.argv[2] || '/tmp/aw';
mkdirSync(out, { recursive: true });
const W = 2560, H = 1440;
const cases: Array<[string, any]> = [];
for (const seed of [1, 2, 3, 7]) cases.push([`default s${seed}`, createDefaultConfig(def, { width: W, height: H, seed })]);
for (const p of def.presets) { const c = applyPreset(def, p.id, createDefaultConfig(def, { width: W, height: H, seed: 1 })); cases.push([`preset ${p.id}`, c]); }
for (const s of def.rerollSchemes!) { const c = createDefaultConfig(def, { width: W, height: H, seed: 4 }); for (const e of c.elements) { const p = (s.elements as any)[e.id]; if (p) e.paint = p; } cases.push([s.id, c]); }
const ext = (name: string, f: (c: any) => void) => { const c = createDefaultConfig(def, { width: W, height: H, seed: 5 }); f(c); cases.push([name, c]); };
for (const ctl of def.controls) if (ctl.type === 'range') { ext(`${ctl.key}=min`, (c) => (c.params[ctl.key] = ctl.min)); ext(`${ctl.key}=max`, (c) => (c.params[ctl.key] = ctl.max)); }
const meta: any[] = [];
cases.forEach(([name, c], i) => { const svg = renderStandaloneSVG(def, c); const f = `${out}/${String(i).padStart(2, '0')}.svg`; writeFileSync(f, svg); meta.push({ name, file: f, bytes: svg.length }); });
writeFileSync(`${out}/meta.json`, JSON.stringify(meta, null, 1));
console.log(meta.map((m) => `${m.name}\t${m.bytes}`).join('\n'));
