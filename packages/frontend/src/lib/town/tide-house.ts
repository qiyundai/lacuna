import * as T from 'three';
import { stoneFlight } from './architectural-parts.js';
import type { Gouache } from './gouache.js';
import { colors, createModelWorkshop, type ModelTools as Tools, type Pigment } from './model-workshop.js';

const width = 5.4;
const depth = 3.96;
const lobbyHeight = 2.32;
const floorHeight = 1.54;
const bayWidth = 1.52;

export function createTideHouseKit(paint?: Gouache,roomWindows=false) {
  const {module, boxShape, dispose} = createModelWorkshop(width, depth, paint,roomWindows);
  function bays(side: number) {
    return side % 2 ? [-bayWidth / 2, bayWidth / 2] : [-bayWidth, 0, bayWidth];
  }
  function archedHead(p: Tools, x: number, spring: number, radius: number, top: number) {
    const spandrel = new T.Shape();
    spandrel.moveTo(-radius, 0);
    spandrel.absarc(0, 0, radius, Math.PI, 0, true);
    spandrel.lineTo(radius, top - spring);
    spandrel.lineTo(-radius, top - spring);
    spandrel.closePath();
    p.relief('stone', spandrel, .24, x, spring, -.24);
    for (let i = 0; i < 9; i++) {
      const a = i * Math.PI / 9 + .009, b = (i + 1) * Math.PI / 9 - .009;
      const outer = radius + (i === 4 ? .145 : .092);
      const wedge = new T.Shape();
      wedge.absarc(0, 0, outer, a, b, false);
      wedge.absarc(0, 0, radius, b, a, true);
      wedge.closePath();
      p.relief(i === 4 ? 'lintel' : 'stone', wedge, .11, x, spring, -.018);
    }
  }

  function entranceCanopy(p: Tools) {
    const hub = p.vec(0, 2.05, .035);
    let left = p.vec(-.92, 1.84, .11);
    for (let i = 1; i <= 10; i++) {
      const angle = Math.PI - i * Math.PI / 10;
      const right = p.vec(.92 * Math.cos(angle), 1.84 - .075 * Math.sin(angle), .11 + .91 * Math.sin(angle));
      const skin = new T.BufferGeometry().setFromPoints([hub, left, right, hub, right, left]);
      skin.computeVertexNormals();
      p.place(skin, i % 2 ? 'copper' : 'seam', new T.Matrix4());
      skin.dispose();
      p.rod('gold', hub, right, .017);
      p.rod('gold', left, right, .029);
      left = right;
    }
    for (const sign of [-1, 1]) {
      const x = sign * .83;
      p.rod('iron', p.vec(x, 1.52, .015), p.vec(sign * .67, 1.84, .56), .024);
      p.rod('gold', p.vec(x, 1.63, .02), p.vec(x, 1.63, .29), .026);
      p.box('iron', x, 1.59, .30, .17, .075, .18);
      p.box('lantern', x, 1.45, .30, .125, .22, .12);
      p.box('iron', x, 1.328, .30, .15, .045, .15);
    }
  }

  function lobby(p: Tools) {
    p.box('shade', 0, -.74, 0, width + .16, 1.50, depth + .16);
    p.box('slate', 0, .055, 0, width + .32, .11, depth + .32);
    p.box('recess', 0, 1.16, 0, width - .92, 2.24, depth - .92);
    for (let side = 0; side < 4; side++) p.face(side, () => {
      const centers = bays(side), span = side % 2 ? depth : width, radius = .59, spring = 1.42;
      let edge = -span / 2;
      for (const x of centers) {
        const pier = x - radius - edge;
        p.box('stone', edge + pier / 2, lobbyHeight / 2, -.13, pier, lobbyHeight, .26);
        p.box('lintel', edge + pier / 2, .24, -.09, pier + .06, .23, .38);
        p.box('lintel', edge + pier / 2, spring, -.07, pier + .07, .085, .40);
        for (const y of [.58, 1.02, 1.82]) p.box('shade', edge + pier / 2, y, .006, pier, .018, .02);
        archedHead(p, x, spring, radius, lobbyHeight);
        const entrance = side === 0 && x === 0;
        p.box('wood', x, 1.06, -.36, 1.23, 1.96, .13);
        p.box(entrance ? 'amber' : 'glass', x, 1.16, -.279, 1.04, 1.64, .031);
        p.box('iron', x, 1.16, -.249, .045, 1.65, .049);
        p.box('wood', x, spring, -.247, 1.08, .066, .055);
        for (const offset of [-.27, .27]) {
          p.box('wood', x + offset, .46, -.24, .49, .62, .065);
          if (entrance) p.box('gold', x + offset * .4, .92, -.199, .031, .19, .039);
        }
        const origin = p.vec(x, spring, -.223);
        for (const angle of [35, 70, 110, 145]) {
          const a = angle * Math.PI / 180;
          p.rod('gold', origin, p.vec(x + Math.cos(a) * .60, spring + Math.sin(a) * .60, -.223), .017);
        }
        edge = x + radius;
      }
      p.box('stone', (edge + span / 2) / 2, lobbyHeight / 2, -.13, span / 2 - edge, lobbyHeight, .26);
    });
    p.box('shade', 0, lobbyHeight - .12, 0, width + .17, .16, depth + .17);
    p.box('lintel', 0, lobbyHeight - .025, 0, width + .29, .076, depth + .29);
    p.face(0, () => entranceCanopy(p));
    const firstTread=stoneFlight(p,1.58,depth/2+.52,-.18,0,.292,0);
    p.entrance(0,firstTread,depth/2+.49);
  }

  function railing(p: Tools, x: number, y: number, extent: number, projection: number) {
    const corners = [[-extent, .02], [-extent, projection - .12], [-extent + .12, projection],
      [extent - .12, projection], [extent, projection - .12], [extent, .02]];
    const path = new T.Shape(corners.map(([u, v]) => new T.Vector2(u!, -v!)));
    const slab = new T.ExtrudeGeometry(path, {depth: .09, bevelEnabled: false}).rotateX(-Math.PI / 2);
    p.place(slab, 'lintel', new T.Matrix4().makeTranslation(x, y, 0));
    slab.dispose();
    for (let i = 1; i < corners.length; i++) {
      const [u, v] = corners[i - 1]!, [s, t] = corners[i]!;
      const a = p.vec(x + u!, y + .46, v!), b = p.vec(x + s!, y + .46, t!);
      p.rod('gold', a, b, .025);
      const count = Math.ceil(a.distanceTo(b) / .15);
      for (let j = 0; j < count; j++) {
        const top = a.clone().lerp(b, j / count);
        p.rod('iron', top.clone().setY(y + .08), top, .016);
      }
    }
  }

  function oriel(p: Tools, light: Pigment) {
    const corners = [[-.65, .012], [-.43, .46], [.43, .46], [.65, .012]] as const;
    const outline = new T.Shape(corners.map(([x, z]) => new T.Vector2(x, -z)));
    for (const [y, h, color] of [[.17, .15, 'stone'], [1.29, .09, 'lintel'], [1.39, .061, 'copper']] as const) {
      const molding = new T.ExtrudeGeometry(outline, {depth: h, bevelEnabled: true, bevelSize: .035, bevelThickness: .032, bevelSegments: 1});
      molding.rotateX(-Math.PI / 2);
      p.place(molding, color, new T.Matrix4().makeTranslation(0, y, 0));
      molding.dispose();
    }
    for (let i = 1; i < corners.length; i++) {
      const [x, z] = corners[i - 1]!, [nextX, nextZ] = corners[i]!;
      const length = Math.hypot(nextX - x, nextZ - z);
      const angle = -Math.atan2(nextZ - z, nextX - x);
      const centerX = (x + nextX) / 2, centerZ = (z + nextZ) / 2;
      const panel = (color: Pigment, y: number, h: number, d: number) => {
        const orientation = new T.Matrix4().makeRotationY(angle);
        orientation.multiply(new T.Matrix4().makeScale(length, h, d)).setPosition(centerX, y, centerZ);
        p.place(boxShape, color, orientation);
      };
      panel(light, .817, .98, .044);
      panel('gold', 1.054, .040, .077);
      p.rod('copper', p.vec(x, .30, z), p.vec(x, 1.31, z), .043);
    }
    p.rod('copper', p.vec(.65, .30, .012), p.vec(.65, 1.31, .012), .043);
    p.box('iron', 0, .814, .487, .041, .96, .040);
    for (const x of [-.33, .33]) p.rod('stone', p.vec(x, -.012, .016), p.vec(x, .20, .36), .074);
  }

  function upper(p: Tools, pattern: number) {
    p.box('recess', 0, floorHeight / 2, 0, width - .60, floorHeight, depth - .60);
    for (let side = 0; side < 4; side++) p.face(side, () => {
      const span = side % 2 ? depth : width, centers = bays(side);
      p.box('plaster', 0, .143, -.095, span, .286, .19);
      p.box('plaster', 0, 1.415, -.095, span, .25, .19);
      let edge = -span / 2;
      for (const [i, x] of centers.entries()) {
        const wide = side === 0 && x === 0, half = wide ? .59 : .48;
        const pier = x - half - edge;
        p.box('plaster', edge + pier / 2, .79, -.095, pier, 1.04, .19);
        p.box('wood', x, .79, -.15, half * 2 + .045, 1.05, .07);
        const lit = (i + side * 2 + pattern) % 5;
        const pane = lit === 0 ? 'glow' : lit === 2 ? 'amber' : 'glass';
        p.room(x,.79,0,()=>p.box(pane, x, .79, -.101, half * 2 - .083, .95, .022));
        p.box('iron', x, .79, -.068, .038, .99, .044);
        p.box('iron', x, .99, -.065, half * 2 - .03, .036, .044);
        for (const sign of [-1, 1]) {
          p.box('stone', x + sign * (half + .041), .79, .019, .081, 1.05, .13);
        }
        p.box('lintel', x, .272, .042, half * 2 + .22, .088, .21);
        p.box('stone', x, 1.321, .03, half * 2 + .19, .095, .16);
        if (wide) {
          if (pattern % 2 === 0) p.room(x,.79,0,()=>oriel(p, pane));
          else railing(p, x, .18, .70, .45);
        } else if (lit === 0) {
          p.box('stone', x - half * .64, .79, -.083, half * .39, .91, .02);
        }
        if (side === 2 && i === 0 || side === 1 && i === 1) {
          const shutter = x + half + .19;
          p.box('copper', shutter, .79, .063, .25, .91, .064);
          for (let n = 0; n < 6; n++) p.box('seam', shutter, .46 + n * .123, .105, .206, .025, .032);
        }
        edge = x + half;
      }
      p.box('plaster', (edge + span / 2) / 2, .79, -.095, span / 2 - edge, 1.04, .19);
      for (const sign of [-1, 1]) {
        const x = sign * (span / 2 - .20);
        p.box('stone', x, floorHeight / 2, .028, .31, floorHeight, .14);
        p.box('lintel', x - sign * .13, floorHeight / 2, .089, .049, floorHeight, .069);
      }
      if (side === 2) p.rod('copper', p.vec(-span / 2 + .44, 0, .14), p.vec(-span / 2 + .44, floorHeight, .14), .045);
    });
    p.box('shade', 0, .016, 0, width + .1, .032, depth + .1);
  }

  function crown(p: Tools) {
    for (const [y, w, h] of [[.04, .15, .08], [.13, .26, .1], [.245, .43, .095]] as const)
      p.box('lintel', 0, y, 0, width + w, h, depth + w);
    for (let side = 0; side < 4; side++) p.face(side, () => {
      const span = side % 2 ? depth : width;
      for (let x = -span / 2 + .17; x < span / 2; x += .29) p.box('stone', x, .16, .129, .11, .143, .143);
    });
    p.box('slate', 0, .31, 0, width + .34, .10, depth + .34);
    const rings = [[.35, 2.85, 2.14], [.46, 2.72, 2.01], [.94, 2.43, 1.72], [1.56, 2.24, 1.53]] as const;
    for (let side = 0; side < 4; side++) {
      function edgePoint(ring: typeof rings[number], f: number) {
        const [y, x, z] = ring;
        return [p.vec(f * x, y, z), p.vec(x, y, -f * z), p.vec(-f * x, y, -z), p.vec(-x, y, f * z)][side]!;
      }
      const sheets = side % 2 ? 8 : 11;
      for (let j = 0; j < sheets; j++) {
        const f = 2 * j / sheets - 1, next = 2 * (j + 1) / sheets - 1;
        for (let r = 1; r < rings.length; r++) {
          const a = edgePoint(rings[r - 1]!, f), b = edgePoint(rings[r - 1]!, next);
          const c = edgePoint(rings[r]!, next), d = edgePoint(rings[r]!, f);
          const geometry = new T.BufferGeometry().setFromPoints([a, b, c, a, c, d]);
          geometry.computeVertexNormals();
          const tint = new T.Color(colors.copper).multiplyScalar(.85 + ((j * 7 + side * 3) % 8) * .039);
          const rgb = Array.from({length: 6}, () => tint.toArray()).flat();
          geometry.setAttribute('color', new T.Float32BufferAttribute(rgb, 3));
          p.batches.metal.push(geometry);
          p.rod('seam', a, d, .024);
        }
      }
    }
    p.box('copper', 0, 1.56, 0, 4.53, .11, 3.11);
    for (const side of [0, 2]) p.face(side, () => {
      for (const x of [-1.48, 0, 1.48]) {
        p.box('copper', x, .86, -.083, .80, .91, .61);
        p.box('gold', x, .85, .226, .60, .68, .06);
        p.box('glass', x, .85, .264, .50, .57, .03);
        p.box('gold', x, .85, .285, .031, .59, .036);
        p.box('gold', x, .90, .285, .50, .031, .036);
        const peak = new T.Shape();
        peak.moveTo(-.52, 0); peak.lineTo(0, .37); peak.lineTo(.52, 0); peak.closePath();
        p.relief('seam', peak, .77, x, 1.27, -.45);
        p.rod('gold', p.vec(x - .5, 1.29, .332), p.vec(x, 1.64, .332), .023);
        p.rod('gold', p.vec(x, 1.64, .332), p.vec(x + .5, 1.29, .332), .023);
      }
    });
    p.box('shade', 1.34, 1.94, -.85, .51, .76, .43);
    p.box('lintel', 1.34, 2.30, -.85, .62, .14, .54);
    for (const x of [1.21, 1.47]) p.rod('clay', p.vec(x, 2.33, -.85), p.vec(x, 2.64, -.85), .085);
    const mast = p.vec(-.92, 1.60, -.72);
    p.rod('gold', mast, mast.clone().setY(2.84), .029);
    p.orb('gold', mast.x, 2.69, mast.z, .084);
    p.rod('gold', p.vec(mast.x - .31, 2.61, mast.z), p.vec(mast.x + .31, 2.61, mast.z), .018);
  }

  const ground = module(lobby);
  ground.name = 'Arcade';
  const levels = Array.from({length: 5}, (_, index) => module(p => upper(p, index)));
  const roof = module(crown);
  roof.name = 'Mansard';
  return {
    build(floors: number, phase = 0) {
      if (!Number.isSafeInteger(floors) || floors < 1) throw new RangeError('Floor count must be a positive integer');
      const building = new T.Group();
      building.name = 'Tide House';
      building.add(ground.clone());
      for (let i = 0; i < floors - 1; i++) {
        const level = levels[T.MathUtils.euclideanModulo(i + phase, levels.length)]!.clone();
        level.name = 'Floor ' + (i + 2);
        level.position.y = lobbyHeight + i * floorHeight;
        building.add(level);
      }
      const cap = roof.clone();
      cap.position.y = lobbyHeight + (floors - 1) * floorHeight;
      building.add(cap);
      return building;
    },
    dispose
  };
}
