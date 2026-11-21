import * as T from 'three';
import { createModelWorkshop, type ModelTools, type Pigment } from './model-workshop.js';
import { around, chimneypot, foundation, roof, storey, tileCourses, type WindowStyle } from './architectural-parts.js';
import * as landmarks from './harbor-landmarks.js';
import type { Gouache } from './gouache.js';
import type { Site } from './painted-coast.js';
import type { RiverDistrict } from './river-neighborhoods.js';
type Street = 'houses' | 'steps' | 'terraces' | 'crescent' | 'apartments';
type Building = Exclude<Site['kind'], 'pines' | 'towers' | 'wharf'>;
const streetColors: readonly Pigment[] = ['plaster', 'chalk', 'sage', 'ochre', 'oxblood'];
const districtColors:Record<RiverDistrict,readonly number[]>={
  residential:[0,1,3],gardens:[2,2,1],exchange:[3,4,3],works:[4,4,0],civic:[1,1,0]
};
const floorHeight = 1.46;
const upperWindows: Record<Street, readonly [WindowStyle, WindowStyle]> = {
  houses: ['sash', 'oriel'],
  steps: ['fanlight', 'sash'],
  terraces: ['french', 'oriel'],
  crescent: ['paired', 'french'],
  apartments: ['paired', 'oriel']
};

function stair(p: ModelTools) {
  for (let i = 0; i < 10; i++) {
    const h = (i + 1) * floorHeight / 10;
    p.box('stone', 0, h / 2, 1.61 - i * .265, .89, h, .28);
    p.box('lintel', 0, h - .03, 1.69 - i * .265, .95, .06, .17);
  }
  for (const x of [-.49, .49]) {
    for (const i of [0, 3, 6, 9]) {
      const z = 1.61 - i * .265, y = (i + 1) * floorHeight / 10;
      p.box('iron', x, y + .28, z, .044, .56, .044);
    }
    p.rod('iron', p.vec(x, .70, 1.61), p.vec(x, 2.02, -.775), .034);
  }
}

function plantedTerrace(p: ModelTools) {
  p.box('slate', 0, .075, 0, 3.18, .15, 3.26);
  for (const x of [-1.48, 1.48]) {
    p.box('stone', x, .27, 0, .13, .38, 3.18);
    for (const z of [-1.26, 1.26])
      p.box('wood', x * .86, .91, z, .11, 1.65, .11);
  }
  for (const x of [-1.27, 1.27])
    p.box('wood', x, 1.69, 0, .13, .15, 3.03);
  for (let i = 0; i < 7; i++)
    p.box('wood', 0, 1.77, (i - 3) * .45, 3.03, .11, .11);
  for (const z of [-1.22, -.78, .90]) {
    p.box('clay', -1.07, .31, z, .42, .30, .40);
    for (let i = 0; i < 4; i++) {
      const x = -1.07 + Math.sin(i * 2.4) * .16, v = z + Math.cos(i * 2.4) * .11;
      p.rod('wood', p.vec(-1.07, .46, z), p.vec(x, .83, v), .031);
      p.orb(i % 2 ? 'sage' : 'foliage', x, .75 + i * .045, v, .18);
    }
  }
}

function mansard(p: ModelTools, w: number, d: number) {
  const a = w / 2, b = d / 2;
  const corners = [[-a, -b], [a, -b], [a, b], [-a, b]];
  for (let i = 0; i < 4; i++) {
    const [x, z] = corners[i]!, [u, v] = corners[(i + 1) % 4]!;
    const lo = p.vec(x!, 0, z!), hi = p.vec(x! * .75, .94, z! * .69);
    const end = p.vec(u!, 0, v!), cap = p.vec(u! * .75, .94, v! * .69);
    const shape = new T.BufferGeometry().setFromPoints([lo, hi, end, end, hi, cap, lo, end, hi, end, cap, hi]);
    shape.computeVertexNormals();
    p.place(shape, 'zinc', new T.Matrix4());
    shape.dispose();
  }
  roof(p, w * .76, d * .70, .94, .28, 'slate');
  around(p, w, d, (span, side) => {
    const centers = side % 2 ? [0] : [-span * .23, span * .23];
    for (const x of centers) {
      if (side % 2 === 1) {
        const cheek = new T.Shape();
        cheek.moveTo(-.35, 0);
        cheek.lineTo(.35, 0);
        cheek.lineTo(.35, .38);
        cheek.absarc(0, .38, .35, 0, Math.PI, false);
        cheek.closePath();
        p.relief('chalk', cheek, .35, x, .075, -.27);
        const surround = new T.Shape();
        surround.absarc(0, 0, .258, 0, Math.PI * 2, false);
        const eye = new T.Path();
        eye.absarc(0, 0, .189, 0, Math.PI * 2, true);
        surround.holes.push(eye);
        p.relief('copper', surround, .081, x, .465, .081);
        const pane = new T.Shape();
        pane.absarc(0, 0, .19, 0, Math.PI * 2, false);
        p.relief('glass', pane, .016, x, .465, .083);
        p.box('gold', x, .465, .109, .377, .028, .027);
        p.box('gold', x, .465, .109, .028, .377, .027);
        continue;
      }
      p.box('chalk', x, .42, -.14, .59, .70, .38);
      p.box('glass', x, .41, .067, .38, .45, .046);
      p.box('wood', x, .41, .099, .036, .46, .036);
      p.box('copper', x, .77, -.14, .72, .10, .51);
    }
  });
}

export function createHarborBuildings(paint?: Gouache) {
  const workshop = createModelWorkshop(3.0, 3.15, paint);
  const templates = new Map<string, T.Group>();
  function part(key: string, make: (p: ModelTools) => void) {
    let source = templates.get(key);
    if (!source) {
      source = workshop.module(make);
      templates.set(key, source);
    }
    return source.clone();
  }
  function add(g: T.Group, mesh: T.Group, x = 0, y = 0, z = 0, turn = 0) {
    mesh.position.set(x, y, z);
    mesh.rotation.y = turn;
    g.add(mesh);
  }
  function dwelling(kind: Street, floors: number, colorIndex: number, windowSeed: number) {
    const g = new T.Group(), color = streetColors[colorIndex % streetColors.length]!;
    const w = kind === 'apartments' ? 4.58 : 3, d = kind === 'apartments' ? 3.70 : 3.15;
    const pattern = kind === 'crescent' || kind === 'terraces' ? 'gallery' : kind === 'apartments' ? 'pilasters' : 'shutters';
    add(g, part('foot/' + w, p => foundation(p, w, d)));
    for (let level = 0; level < floors; level++) {
      const ground = level === 0;
      const style = ground ? (pattern === 'shutters' ? 'sash' : 'fanlight') : upperWindows[kind][windowSeed % 2 === 0 ? 0 : 1];
      const phase = (windowSeed + level) % 3;
      const key = [pattern, w, color, ground, style, phase].join('/');
      add(g, part(key, p => storey(p, w, d, floorHeight, color, pattern, ground, style, phase)), 0, level * floorHeight);
    }
    const top = floors * floorHeight;
    if (kind === 'terraces')
      add(g, part('pergola', plantedTerrace), 0, top);
    else if (kind === 'apartments')
      add(g, part('mansard', p => { mansard(p, w + .18, d + .16); chimneypot(p, -1.30, .80, -.72); }), 0, top);
    else {
      const material = colorIndex % 3 === 0 ? 'slate' : 'clay';
      const gable = kind === 'houses' || kind === 'steps';
      const cap = part('roof/' + gable + '/' + material, p => {
        const roofW = (gable ? d : w) + .22, roofD = (gable ? w : d) + .24;
        roof(p, roofW, roofD, .04, gable ? .97 : .64, material, gable ? .96 : .61);
        tileCourses(p, roofW, roofD, .04, gable ? .97 : .64, gable ? .96 : .61, material === 'slate');
        chimneypot(p, roofW * .25, .59, -.35);
        if (gable) {
          for (const sign of [-1, 1]) {
            p.box('chalk', sign * roofW * .479, .30, 0, .085, .43, .65);
            p.box('recess', sign * roofW * .498, .32, 0, .045, .25, .31);
          }
        }
      });
      add(g, cap, 0, top, 0, gable ? Math.PI / 2 : 0);
    }
    return g;
  }
  function street(kind: Street, seed: number, width: number, additions:number,district?:RiverDistrict) {
    const g = new T.Group(), apartments = kind === 'apartments';
    const pitch = apartments ? 4.87 : kind === 'steps' ? 4.0 : 3.28;
    const count = Math.max(1, Math.min(3, Math.round(width / pitch)));
    for (let i = 0; i < count; i++) {
      const centered = i - (count - 1) / 2;
      const n = (seed >>> (i * 6)) % 43;
      const floors = apartments ? 4 + n % 2 : kind === 'steps' ? 2 + i : kind === 'crescent' ? 3 : 2 + n % 2;
      const y = kind === 'steps' ? i * .33 : 0;
      const z = kind === 'crescent' ? centered * centered * .39 : (n % 3) * .15;
      const angle = kind === 'crescent' ? centered * .24 : (n % 3 - 1) * .033;
      const tint=kind==='crescent'?seed:n,palette=district && districtColors[district];
      const color=palette?palette[tint%palette.length]!:tint%5;
      add(g, dwelling(kind, floors+additions, color, (seed >>> (i*5+3)) % 6), centered * pitch, y, z, angle);
      if (kind === 'steps')
        add(g, part('stair', stair), centered * pitch + 1.88, y, z + .05);
    }
    if (kind === 'steps' || kind === 'terraces' || (seed % 3 === 0 && kind === 'houses')) {
      const annex = part('courtyard-studio', p => {
        foundation(p, 2.55, 2.28);
        storey(p, 2.55, 2.28, 1.74, 'chalk', 'shutters', true);
        roof(p, 2.74, 2.47, 1.77, .58, 'slate');
        tileCourses(p, 2.74, 2.47, 1.77, .58, .77, true);
      });
      add(g, annex, (count-1)*pitch/2+.68, .17, -3.0, Math.PI/2);
    }
    return g;
  }
  function build(kind: Building, seed: number, width: number, additions=0,district?:RiverDistrict) {
    const g = new T.Group();
    switch (kind) {
      case 'houses':
      case 'steps':
      case 'terraces':
      case 'crescent':
      case 'apartments':
        return street(kind, seed, width, additions,district);
      case 'market': {
        const bays = Math.max(3, Math.min(6, Math.round(width / 1.54)));
        const awning = (['ochre', 'sage', 'clay'] as const)[seed % 3]!;
        add(g, part('market/' + bays + '/' + awning, p => landmarks.market(p, bays, awning)));
        break;
      }
      case 'arches':
        for (let i = -2; i <= 2; i++)
          add(g, part('viaduct', landmarks.viaduct), i * 2.34);
        break;
      case 'beacon':
        add(g, part('lighthouse', landmarks.lighthouse));
        add(g, dwelling('houses', 1, 1, seed), -2.14, 0, -1.30, -Math.PI/2);
        break;
      case 'belfry':
        add(g, dwelling('crescent', 2, 3, seed), 1.04, 0, -.26);
        add(g, part('belfry', landmarks.belfry), -1.28, 0, .74);
        break;
      case 'crane':
        add(g, part('warehouse', landmarks.warehouse), -1.27, 0, -.84);
        add(g, part('crane', landmarks.crane), 1.82, 0, 1.25, -.66);
        break;
      default:
        add(g, part(kind, landmarks[kind]));
    }
    return g;
  }
  function outbuilding(kind:'studio'|'pergola'|'shed'){
    if(kind==='pergola')return part('pergola',plantedTerrace);
    if(kind==='shed')return part('warehouse',landmarks.warehouse);
    return dwelling('houses',1,1,2);
  }
  return { build, outbuilding, dispose() { templates.clear(); workshop.dispose(); } };
}
