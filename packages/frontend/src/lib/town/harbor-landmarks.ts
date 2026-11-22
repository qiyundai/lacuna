import * as T from 'three';
import type { ModelTools as Parts } from './model-workshop.js';
import { arch, around, chimneypot, foundation, lathe, roof, storey, tileCourses } from './architectural-parts.js';

export function market(p: Parts, bays: number, awning: 'ochre' | 'sage' | 'clay') {
  const span = bays * 1.44;
  foundation(p, span + .64, 3.28);
  p.entrance(-span/2+.23, .145, 1.65);
  for (let i = 0; i <= bays; i++) {
    const x = i * 1.44 - span / 2;
    for (const side of [-1, 1]) {
      const z = side * 1.36;
      p.box('stone', x, .32, z, .34, .42, .36);
      p.box('wood', x, 1.28, z, .18, 2.08, .21);
      p.rod('wood', p.vec(x, 1.71, z), p.vec(x + (i === bays ? -.48 : .48), 2.26, z), .086);
      p.rod('wood', p.vec(x, 2.16, z), p.vec(x, 2.89, 0), .085);
    }
    p.box('wood', x, 2.23, 0, .13, .16, 2.96);
  }
  roof(p, span + .89, 3.48, 2.36, .79, 'clay', .91);
  tileCourses(p, span + .89, 3.48, 2.36, .79, .91);
  for (const x of [-span * .38, 0, span * .38]) {
    p.rod('iron', p.vec(x, 2.48, 0), p.vec(x, 1.89, 0), .025);
    p.orb('lantern', x, 1.80, 0, .11);
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < bays * 3; i++) {
      const x = (i - (bays * 3 - 1) / 2) * .48;
      const shape = new T.Shape();
      shape.moveTo(x - .245, 0);
      shape.lineTo(x + .245, 0);
      shape.lineTo(x + .245, -.075);
      shape.quadraticCurveTo(x, -.28, x - .245, -.075);
      shape.closePath();
      const color = Math.floor(i / 3) % 2 === 0 ? awning : 'chalk';
      p.relief(color, shape, .045, 0, 1.84, side * 2.06);
      const a = p.vec(x - .246, 2.21, side * 1.36), b = p.vec(x + .246, 2.21, side * 1.36);
      const c = p.vec(x - .246, 1.84, side * 2.08), e = p.vec(x + .246, 1.84, side * 2.08);
      const cover = new T.BufferGeometry().setFromPoints([a, b, c, b, e, c, c, b, a, c, e, b]);
      cover.computeVertexNormals();
      p.place(cover, color, new T.Matrix4());
      cover.dispose();
    }
    for (let i = 0; i < bays; i++) {
      const x = (i + .5) * 1.44 - span / 2;
      p.box('wood', x, .43, side * .94, 1.19, .55, .56);
      p.box('lintel', x, .72, side * .94, 1.24, .08, .63);
      for (const sign of [-1, 1])
        p.box('wood', x, .83, side * .94 + sign * .21, 1.08, .12, .042);
      for (let j = 0; j < 6; j++) {
        for (const row of [-1, 1]) {
          const u = x + (j - 2.5) * .164, v = side * .94 + row * .083;
          p.orb(i % 2 ? 'ochre' : 'foliage', u, .85, v, .10);
        }
      }
    }
  }
}

export function warehouse(p: Parts) {
  foundation(p, 5.2, 3.64);
  p.entrance(0, .145, 1.98);
  storey(p, 5.2, 3.64, 2.64, 'oxblood', 'industrial');
  for (const sign of [-1, 1]) {
    for (let i = 0; i < 6; i++)
      p.box('wood', sign * .62 + (i - 2.5) * .17, 1.01, 1.87, .16, 1.79, .10);
    p.rod('iron', p.vec(sign * .62 - .43, .31, 1.95), p.vec(sign * .62 + .43, 1.77, 1.95), .041);
  }
  p.box('iron', 0, 2.05, 1.93, 3.06, .09, .14);
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 1.73, y = 2.68;
    const profile = new T.Shape();
    profile.moveTo(-.88, 0);
    profile.lineTo(.70, .82);
    profile.lineTo(.87, 0);
    profile.closePath();
    p.relief('zinc', profile, 3.87, x, y, -1.935);
    for (const z of [-1.27, 0, 1.27])
      p.box('glass', x + .79, y + .36, z, .17, .61, 1.14);
    p.box('lintel', x + .69, y + .82, 0, .14, .08, 3.96);
  }
  for (const side of [-1, 1]) {
    for (const x of [-2.51, -1.52, 1.52, 2.51]) {
      p.box('clay', x, 1.26, side * 1.83, .22, 2.46, .22);
      p.box('stone', x, .21, side * 1.84, .32, .30, .28);
    }
  }
  chimneypot(p, -2.15, 2.75, -1.18);
}

export function crane(p: Parts) {
  foundation(p, 3.0, 3.0);
  lathe(p, 'iron', 0, .12, 0, [[1.18, 0], [1.18, .22], [.88, .33], [.80, .53]], 16);
  for (const x of [-.57, .57])
    for (const z of [-.57, .57]) {
      p.rod('iron', p.vec(x, .57, z), p.vec(x * .61, 3.06, z * .61), .094);
      p.rod('copper', p.vec(x, .68, z), p.vec(-x * .61, 2.82, z * .61), .053);
    }
  p.box('copper', 0, 3.04, 0, 1.60, .22, 1.48);
  p.box('ochre', -.23, 3.49, 0, 1.26, .80, 1.26);
  for (const z of [-.64, .64])
    p.box('glass', -.24, 3.61, z, .91, .37, .055);
  p.box('slate', -.24, 3.96, 0, 1.47, .14, 1.45);
  p.box('iron', -.96, 3.35, 0, .72, .70, 1.03);
  for (const z of [-.28, .28]) {
    const at = (t: number, upper: boolean) => p.vec(-.18 + 3.64 * t, 3.82 + 2.01 * t + (upper ? .47 * (1 - t) + .14 : 0), z * (1 - .65 * t));
    p.rod('ochre', at(0, false), at(1, false), .070);
    p.rod('ochre', at(0, true), at(1, true), .067);
    for (let i = 0; i < 6; i++)
      p.rod('ochre', at(i / 6, i % 2 === 0), at((i + 1) / 6, i % 2 !== 0), .044);
    p.rod('iron', p.vec(-.93, 3.80, z), p.vec(.02, 5.14, z), .066);
    p.rod('iron', p.vec(.02, 5.14, z), at(1, true), .025);
  }
  p.rod('iron', p.vec(3.45, 5.90, 0), p.vec(3.45, 2.14, 0), .038);
  p.box('gold', 3.45, 2.08, 0, .24, .26, .20);
  const hook = new T.TorusGeometry(.17, .043, 6, 12, Math.PI * 1.55).toNonIndexed();
  p.place(hook, 'iron', new T.Matrix4().makeRotationZ(1.56).setPosition(3.46, 1.85, 0));
  hook.dispose();
}

export function glasshouse(p: Parts) {
  foundation(p, 5.85, 3.2);
  p.box('stone', 0, .37, 0, 5.60, .61, 3.03);
  for (let i = 0; i <= 8; i++) {
    const x = (i - 4) * .681;
    for (const sign of [-1, 1]) {
      const outline = [[1.45, .64], [1.45, 1.71], [1.32, 2.14], [.93, 2.57], [.42, 2.78], [0, 2.84]];
      for (let j = 1; j < outline.length; j++) {
        const [z, y] = outline[j - 1]!, [nz, ny] = outline[j]!;
        const a = p.vec(x, y!, sign * z!), b = p.vec(x, ny!, sign * nz!);
        p.rod('copper', a, b, .041);
        if (i === 8)
          continue;
        const c = a.clone();
        c.x += .681;
        const d = b.clone();
        d.x += .681;
        if (j > 1 || i !== 4) {
          const skin = new T.BufferGeometry().setFromPoints([a, b, c, b, d, c, c, b, a, c, d, b]);
          skin.computeVertexNormals();
          p.place(skin, 'crystal', new T.Matrix4());
          skin.dispose();
        }
        p.rod('seam', a, c, .027);
      }
    }
  }
  for (const x of [-2.73, 2.73]) {
    p.entrance(x, .64, 0, Math.sign(x)*Math.PI/2);
    const apex = p.vec(x, 2.80, 0);
    for (const sign of [-1, 1]) {
      const outline = [[1.45, .67], [1.45, 1.70], [1.32, 2.13], [.93, 2.56], [.42, 2.77]];
      const center = p.vec(x, 1.86, 0);
      for (let i = 1; i < outline.length; i++) {
        const [z, y] = outline[i - 1]!, [nextZ, nextY] = outline[i]!;
        const a = p.vec(x, y!, sign * z!), b = p.vec(x, nextY!, sign * nextZ!);
        const fan = new T.BufferGeometry().setFromPoints([center, a, b, b, a, center]);
        fan.computeVertexNormals();
        p.place(fan, 'crystal', new T.Matrix4());
        fan.dispose();
        p.rod('seam', center, b, .027);
      }
      p.rod('gold', center, apex, .036);
    }
    for (const z of [-1.05, -.56, .56, 1.05])
      p.box('copper', x, 1.48, z, .07, 1.79, .072);
    p.box('wood', x, 1.44, 0, .09, 1.60, .83);
    p.box('glass', x + Math.sign(x) * .07, 1.65, 0, .04, .86, .63);
  }
  for (const x of [-1.60, .22, 1.63]) {
    p.box('clay', x, .85, 0, .56, .43, .56);
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      const tip = p.vec(x + .58 * Math.cos(a), 1.42 + (i % 2) * .29, .54 * Math.sin(a));
      const crown = p.vec(x, 1.92, 0);
      const mid = crown.clone().lerp(tip, .54);
      const dx = -Math.sin(a) * .17, dz = Math.cos(a) * .17;
      const left = p.vec(mid.x + dx, mid.y + .13, mid.z + dz), right = p.vec(mid.x - dx, mid.y + .13, mid.z - dz);
      const leaf = new T.BufferGeometry().setFromPoints([crown, left, tip, crown, tip, right, tip, left, crown, right, tip, crown]);
      leaf.computeVertexNormals();
      p.place(leaf, i % 2 ? 'foliage' : 'sage', new T.Matrix4());
      leaf.dispose();
    }
    p.rod('wood', p.vec(x, .94, 0), p.vec(x, 1.91, 0), .072);
  }
  p.box('gold', 0, 2.85, 0, 5.58, .09, .12);
}

export function station(p: Parts) {
  foundation(p, 6.55, 3.42);
  storey(p, 6.3, 2.94, 2.58, 'sage', 'pilasters', true, 'fanlight', 0, false);
  p.entrance(0, .17, 2.94);
  roof(p, 6.66, 3.31, 2.61, .84, 'slate');
  p.box('ochre', 0, 2.15, 1.49, 2.22, 3.98, .56);
  const pediment = new T.Shape();
  pediment.moveTo(-1.24, 0);
  pediment.lineTo(0, .95);
  pediment.lineTo(1.24, 0);
  pediment.closePath();
  p.relief('stone', pediment, .72, 0, 4.01, 1.12);
  const dial = new T.Shape();
  dial.absarc(0, 0, .425, 0, Math.PI * 2, false);
  p.relief('chalk', dial, .08, 0, 3.77, 1.83);
  p.rod('iron', p.vec(0, 3.76, 1.93), p.vec(.18, 3.91, 1.93), .028);
  p.rod('iron', p.vec(0, 3.76, 1.93), p.vec(-.11, 4.03, 1.93), .034);
  for (const x of [-.53, 0, .53])
    p.box('wood', x, 1.13, 1.81, .43, 1.99, .09);
  for (const x of [-2.85, -1.42, 0, 1.42, 2.85]) {
    p.box('iron', x, 1.09, 2.55, .086, 2.12, .086);
    p.rod('iron', p.vec(x, 1.69, 2.55), p.vec(x, 2.25, 1.81), .049);
  }
  p.box('copper', 0, 2.21, 2.17, 6.79, .13, 1.12);
  p.box('gold', 0, 2.14, 2.72, 6.79, .06, .06);
  p.box('stone', 0, .07, 2.20, 6.84, .20, 1.56);
}

export function civic(p: Parts) {
  foundation(p, 6.32, 3.64);
  storey(p, 6.12, 3.46, 2.82, 'chalk', 'pilasters', true, 'fanlight', 0, false);
  p.entrance(0, .16, 2.98);
  roof(p, 6.44, 3.73, 2.84, .65, 'clay');
  lathe(p, 'stone', 0, 3.10, 0, [[1.28, 0], [1.28, .24], [1.13, .27], [1.13, 1.26], [1.24, 1.31], [1.24, 1.45]], 24);
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6;
    p.rod('lintel', p.vec(1.13 * Math.sin(a), 3.44, 1.13 * Math.cos(a)), p.vec(1.13 * Math.sin(a), 4.31, 1.13 * Math.cos(a)), .074);
  }
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4, direction = p.vec(Math.sin(a), 0, Math.cos(a));
    const rib = (r: number, y: number) => direction.clone().multiplyScalar(r).setY(4.53 + y);
    const profile = [[1.4, .10], [1.28, .21], [1.17, .58], [.94, .95], [.62, 1.24], [.25, 1.41]];
    for (let j = 1; j < profile.length; j++)
      p.rod('seam', rib(profile[j - 1]![0]!, profile[j - 1]![1]!), rib(profile[j]![0]!, profile[j]![1]!), .028);
  }
  lathe(p, 'copper', 0, 4.53, 0, [[1.38, 0], [1.40, .09], [1.28, .20], [1.17, .57], [.94, .94], [.62, 1.23], [.26, 1.39], [.17, 1.41]], 24);
  lathe(p, 'gold', 0, 5.91, 0, [[.23, 0], [.18, .13], [.12, .15], [.12, .45], [.22, .49], [0, .80]], 12);
  for (let i = 0; i < 4; i++)
    p.box('stone', 0, .08 + i * .09, 2.88 - i * .22, 3.27, .16 + i * .18, .25);
  for (const x of [-1.34, -.45, .45, 1.34]) {
    lathe(p, 'chalk', x, .37, 2.11, [[.21, 0], [.21, .13], [.15, .17], [.13, 1.96], [.22, 2.05], [.22, 2.15]], 12);
  }
  p.box('lintel', 0, 2.62, 2.12, 3.27, .26, 1.05);
  const pediment = new T.Shape();
  pediment.moveTo(-1.72, 0);
  pediment.lineTo(0, .76);
  pediment.lineTo(1.72, 0);
  pediment.closePath();
  p.relief('stone', pediment, 1.09, 0, 2.76, 1.57);
  p.box('chalk', 0, 2.78, 2.66, 3.44, .09, .12);
}

export function belfry(p: Parts) {
  foundation(p, 2.36, 2.36);
  storey(p, 2.14, 2.14, 2.64, 'ochre', 'pilasters', true);
  p.box('ochre', 0, 4.20, 0, 2.08, 3.13, 2.08);
  around(p, 2.08, 2.08, () => {
    for (const y of [3.36, 4.92]) {
      p.box('recess', 0, y, .025, .22, .68, .045);
      p.box('lintel', 0, y - .35, .04, .38, .075, .14);
    }
    for (const x of [-.91, .91])
      p.box('stone', x, 4.18, .01, .17, 3.15, .17);
  });
  p.box('lintel', 0, 5.78, 0, 2.43, .22, 2.43);
  for (const x of [-.89, .89])
    for (const z of [-.89, .89]) {
      p.box('stone', x, 6.73, z, .30, 1.78, .30);
      p.box('lintel', x, 7.30, z, .41, .14, .41);
    }
  around(p, 2.06, 2.06, () => arch(p, 'ochre', 0, 6.78, -.25, 1.03, .93, .27, .26));
  p.box('wood', 0, 7.44, 0, 1.92, .16, .28);
  lathe(p, 'gold', 0, 6.19, 0, [[.59, 0], [.60, .08], [.48, .17], [.33, .42], [.27, .76], [.15, .83], [0, .86]], 20);
  p.orb('iron', 0, 6.14, 0, .105);
  p.box('lintel', 0, 7.73, 0, 2.43, .22, 2.43);
  lathe(p, 'copper', 0, 7.84, 0, [[1.69, 0], [1.18, .29], [.61, 1.26], [.11, 2.27], [0, 2.46]], 4);
  p.rod('gold', p.vec(0, 10.10, 0), p.vec(0, 10.82, 0), .045);
  p.orb('gold', 0, 10.39, 0, .13);
}

export function viaduct(p: Parts) {
  const w = 2.34;
  const span = new T.Shape();
  span.moveTo(-w / 2, -1.47);
  span.lineTo(-.88, -1.47);
  span.lineTo(-.88, .85);
  span.absellipse(0, .85, .88, 1.10, Math.PI, 0, true, 0);
  span.lineTo(.88, -1.47);
  span.lineTo(w / 2, -1.47);
  span.lineTo(w / 2, 2.62);
  span.lineTo(-w / 2, 2.62);
  span.closePath();
  p.relief('shade', span, 1.76, 0, 0, -.88);
  for (const side of [-1, 1]) {
    const z = side === 1 ? .88 : -1.01;
    arch(p, 'stone', 0, .85, z, 1.05, 1.30, .18, .13);
    p.box('lintel', 0, 2.12, side * .98, .22, .33, .21);
    p.box('stone', -1.03, .05, side * .91, .28, 1.73, .22);
    p.box('lintel', -1.03, .84, side * .91, .41, .13, .31);
    p.box('stone', 0, 2.82, side * .99, w, .26, .18);
    p.box('iron', 0, 3.06, side * .99, w, .065, .067);
    for (const x of [-.91, -.30, .30, .91])
      p.box('iron', x, 2.96, side * .99, .045, .21, .046);
  }
  p.box('stone', 0, 2.65, 0, w, .13, 2.13);
  for (const z of [-.45, .45])
    p.box('iron', 0, 2.75, z, w, .055, .068);
}

export function lighthouse(p: Parts) {
  lathe(p, 'shade', 0, 0, 0, [[2.04, -9.0], [2.04, .23], [2.14, .26], [2.14, .42], [1.79, .57], [1.66, .79]], 24);
  lathe(p, 'chalk', 0, 0, 0, [[1.34, .55], [1.38, .76], [1.26, 1.11], [.89, 6.92], [.96, 7.11], [.98, 7.41]], 32);
  for (const y of [1.02, 4.07, 4.54, 7.06]) {
    const r = 1.27 - (y - 1.02) * .062;
    lathe(p, y > 4 && y < 5 ? 'oxblood' : 'stone', 0, y, 0, [[r + .035, 0], [r + .035, .07], [r + .015, .22]], 32);
  }
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * .41, y = 1.49 + i * 1.12, r = 1.28 - (y - 1) * .062;
    const frame = new T.Matrix4().makeRotationY(a).setPosition(Math.sin(a) * r, y, Math.cos(a) * r);
    const path = new T.Shape();
    path.moveTo(-.14, 0);
    path.lineTo(.14, 0);
    path.lineTo(.14, .31);
    path.absarc(0, .31, .14, 0, Math.PI, false);
    path.closePath();
    const inset = new T.ExtrudeGeometry(path, { depth: .047, bevelEnabled: false });
    p.place(inset, 'recess', frame);
    inset.dispose();
  }
  lathe(p, 'copper', 0, 7.39, 0, [[.99, 0], [1.22, .16], [1.35, .27], [1.35, .39], [.91, .41]], 24);
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8, b = a + Math.PI / 8;
    const point = (r: number, h: number, angle: number) => p.vec(r * Math.sin(angle), h, r * Math.cos(angle));
    p.rod('iron', point(1.24, 7.75, a), point(1.24, 8.22, a), .030);
    p.rod('gold', point(1.24, 8.22, a), point(1.24, 8.22, b), .036);
    if (i % 2 === 0)
      p.rod('iron', point(.78, 7.85, a), point(.78, 9.22, a), .057);
  }
  lathe(p, 'lantern', 0, 8.17, 0, [[.29, 0], [.42, .17], [.42, .63], [.27, .84]], 20);
  for (let i = 0; i < 5; i++)
    lathe(p, 'lantern', 0, 8.29 + i * .12, 0, [[.42, 0], [.47, .028], [.42, .06]], 20);
  lathe(p, 'copper', 0, 9.16, 0, [[1.03, 0], [1.09, .10], [.88, .24], [.64, .54], [.19, .89], [0, .98]], 24);
  p.rod('gold', p.vec(0, 10.08, 0), p.vec(0, 10.61, 0), .043);
}
