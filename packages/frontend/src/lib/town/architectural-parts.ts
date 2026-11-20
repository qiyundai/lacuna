import * as T from 'three';
import type { ModelTools, Pigment } from './model-workshop.js';

export function around(p: ModelTools, width: number, depth: number, draw: (span: number, side: number) => void) {
  for (let side = 0; side < 4; side++) {
    p.face(side, () => draw(side % 2 ? depth : width, side), (side % 2 ? width : depth) / 2);
  }
}

export function foundation(p: ModelTools, w: number, d: number) {
  p.box('shade', 0, -4.45, 0, w, 8.94, d);
  for (const y of [-.37, -1.28, -2.52, -4.12]) {
    p.box('stone', 0, y, 0, w + .045, .082, d + .045);
  }
  around(p, w, d, (span) => {
    for (const sign of [-1, 1]) {
      const x = sign * (span / 2 - .24);
      p.box('shade', x, -2.5, .08, .35, 5.08, .28);
      p.box('stone', x, -.31, .12, .43, .13, .33);
    }
  });
  p.box('stone', 0, .06, 0, w + .10, .17, d + .10);
}

export function lathe(p: ModelTools, color: Pigment, x: number, y: number, z: number, profile: number[][], sides = 20) {
  const shape = new T.LatheGeometry(profile.map(([r, h]) => new T.Vector2(r!, h!)), sides).toNonIndexed();
  p.place(shape, color, new T.Matrix4().makeTranslation(x, y, z));
  shape.dispose();
}

export function arch(p: ModelTools, color: Pigment, x: number, y: number, z: number, radius: number, rise: number, band: number, depth: number) {
  const path = new T.Shape();
  path.absellipse(0, 0, radius, rise, 0, Math.PI, false, 0);
  path.absellipse(0, 0, radius - band, rise - band, Math.PI, 0, true, 0);
  path.closePath();
  p.relief(color, path, depth, x, y, z);
}

export function roof(p: ModelTools, w: number, d: number, y: number, rise: number, color: Pigment, hip = .77) {
  const a = w / 2, b = d / 2, ridge = a * hip;
  const points = [p.vec(-a, y, -b), p.vec(a, y, -b), p.vec(a, y, b), p.vec(-a, y, b),
    p.vec(-ridge, y + rise, 0), p.vec(ridge, y + rise, 0)];
  const triangles = [0, 4, 5, 0, 5, 1, 1, 5, 2, 2, 5, 4, 2, 4, 3, 3, 4, 0];
  const skin = new T.BufferGeometry().setFromPoints(triangles.map(i => points[i]!));
  skin.computeVertexNormals();
  p.place(skin, color, new T.Matrix4());
  skin.dispose();
  p.box('wood', 0, y - .035, 0, w, .10, d);
  p.box(color, 0, y + rise, 0, ridge * 2 + .075, .105, .14);
  for (const [corner, end] of [[0, 4], [1, 5], [2, 5], [3, 4]] as const) {
    p.rod(color, points[corner]!, points[end]!, .049);
  }
}

export function tileCourses(p: ModelTools, w: number, d: number, y: number, rise: number, hip: number, metal = false) {
  const a = w / 2, b = d / 2;
  if (metal) {
    for (let i = -3; i <= 3; i++) {
      const x = a * i / 4;
      const t = Math.min(1, (a - Math.abs(x)) / (a * (1 - hip)));
      for (const sign of [-1, 1])
        p.rod('zinc', p.vec(x, y, sign * b), p.vec(x, y + rise * t + .016, sign * b * (1 - t)), .023);
    }
  } else {
    for (let i = 1; i < 7; i++) {
      const t = i / 7, halfWidth = a * (1 - (1 - hip) * t);
      for (const sign of [-1, 1]) {
        p.box('clay', 0, y + t * rise + .009, sign * b * (1 - t), halfWidth * 2, .045, .072);
      }
    }
  }
}

export function chimneypot(p: ModelTools, x: number, y: number, z: number) {
  p.box('shade', x, y + .36, z, .38, .82, .41);
  p.box('lintel', x, y + .73, z, .49, .10, .52);
  for (const dz of [-.12, .12])
    p.box('clay', x, y + .88, z + dz, .17, .26, .16);
}

function balcony(p: ModelTools, x: number, y: number, w: number) {
  p.box('stone', x, y, .18, w + .20, .10, .55);
  for (const sx of [-1, 1]) {
    p.box('iron', x + sx * w / 2, y + .30, .19, .045, .045, .43);
    p.box('shade', x + sx * w * .32, y - .13, .13, .12, .21, .24);
  }
  p.box('gold', x, y + .37, .43, w + .09, .048, .058);
  for (let i = 0; i <= 4; i++)
    p.box('iron', x - w / 2 + w * i / 4, y + .19, .42, .04, .35, .04);
}

export type WindowStyle = 'sash' | 'fanlight' | 'paired' | 'oriel' | 'french' | 'factory';
type WallPattern = 'shutters' | 'gallery' | 'industrial' | 'pilasters';

function archedLight(p: ModelTools, x: number, sill: number, top: number, width: number, wall: Pigment, fan: boolean) {
  const radius = width / 2, rise = Math.min(radius * .85, (top - sill) * .42);
  const spring = top - rise;
  const corners = new T.Shape();
  corners.moveTo(-radius, 0);
  corners.absellipse(0, 0, radius, rise, Math.PI, 0, true, 0);
  corners.lineTo(radius, rise + .016);
  corners.lineTo(-radius, rise + .016);
  corners.closePath();
  p.relief(wall, corners, .17, x, spring, -.167);
  const band = Math.min(.073, radius * .23);
  arch(p, 'stone', x, spring, -.023, radius, rise, band, .098);
  for (const sign of [-1, 1]) {
    p.box('stone', x + sign * (radius - band/2), (spring+sill)/2, .023, band, spring-sill, .10);
  }
  if (fan) {
    p.box('wood', x, spring, -.057, width, .058, .06);
    p.box('wood', x, (spring+sill)/2, -.057, .049, spring-sill, .06);
    for (const angle of [Math.PI/4, Math.PI/2, 3*Math.PI/4]) {
      p.rod('gold', p.vec(x, spring, -.034), p.vec(x+(radius-band)*Math.cos(angle), spring+(rise-band)*Math.sin(angle), -.034), .018);
    }
  } else {
    p.box('wood', x, sill+(spring-sill)*.54, -.057, width-2*band, .038, .056);
  }
}

function oriel(p: ModelTools, x: number, sill: number, top: number, width: number, pane: Pigment) {
  const half = width / 2, outer = half * .69, projection = .31;
  const corners = [[-half, 0], [-outer, projection], [outer, projection], [half, 0]] as const;
  const outline = new T.Shape(corners.map(([u,z]) => new T.Vector2(u, -z)));
  for (const [y, thickness, color] of [[sill-.045,.09,'stone'], [top-.012,.085,'copper']] as const) {
    const slab = new T.ExtrudeGeometry(outline, {depth: thickness, bevelEnabled:false}).rotateX(-Math.PI/2);
    p.place(slab, color, new T.Matrix4().makeTranslation(x, y, 0));
    slab.dispose();
  }
  for (let i=1; i<corners.length; i++) {
    const [u,z] = corners[i-1]!, [v,t] = corners[i]!;
    const a = p.vec(x+u, sill, z), b = p.vec(x+v, sill, t);
    const c = p.vec(x+u, top, z), d = p.vec(x+v, top, t);
    const glass = new T.BufferGeometry().setFromPoints([a,b,c,c,b,d]);
    glass.computeVertexNormals();
    p.place(glass, pane, new T.Matrix4());
    glass.dispose();
    const railY = top-(top-sill)*.26;
    p.rod('wood', p.vec(x+u,railY,z+.018), p.vec(x+v,railY,t+.018), .026);
  }
  const peak = p.vec(x, top+.175, -.012);
  for (let i=1; i<corners.length; i++) {
    const [u,z] = corners[i-1]!, [v,t] = corners[i]!;
    const left = p.vec(x+u,top+.055,z+.023), right = p.vec(x+v,top+.055,t+.023);
    const hood = new T.BufferGeometry().setFromPoints([left,right,peak]);
    hood.computeVertexNormals();
    p.place(hood,'copper',new T.Matrix4());
    hood.dispose();
    if (i<corners.length-1) p.rod('seam',right,peak,.014);
  }
  for (const [u,z] of corners) p.box('wood', x+u, (sill+top)/2, z+.015, .064, top-sill, .067);
  for (const sign of [-1,1]) {
    p.rod('stone', p.vec(x+sign*outer,sill-.23,.015), p.vec(x+sign*outer,sill-.025,projection-.035), .063);
  }
}

function windowBay(p: ModelTools, style: WindowStyle, x: number, sill: number, top: number, width: number, wall: Pigment, room: number) {
  const pane = room === 0 ? 'amber' : room % 2 ? 'seaGlass' : 'glass';
  if (style === 'oriel') {
    oriel(p,x,sill,top,width,pane);
    return;
  }
  const height = top-sill;
  p.box(pane, x, sill+height/2, -.115, width, height, .041);
  if (style === 'fanlight' || style === 'paired') {
    if (style === 'paired') {
      for (const sign of [-1,1]) archedLight(p, x+sign*width*.25, sill, top, width/2, wall, false);
      p.box('lintel', x, top-width*.22, .035, .15, .072, .15);
    } else archedLight(p, x, sill, top, width, wall, true);
    return;
  }
  if ((style === 'french' || style === 'sash') && (room === 0 || room === 3)) {
    const curtain = new T.Shape();
    curtain.moveTo(0, 0);
    curtain.lineTo(width*.26, 0);
    curtain.quadraticCurveTo(width*.21, -height*.34, width*.084, -height*.58);
    curtain.lineTo(width*.14, -height*.91);
    curtain.lineTo(0, -height*.90);
    curtain.closePath();
    p.relief('chalk', curtain, .014, x-width/2, top, -.091);
  }
  const industrial = style === 'factory';
  const frame = industrial ? 'iron' : 'wood';
  const columns = industrial ? 3 : 2;
  const rows = industrial ? 4 : style === 'french' ? 3 : 2;
  for (let i=1; i<columns; i++) p.box(frame, x+width*(i/columns-.5), sill+height/2, -.068, .040, height, .058);
  for (let i=1; i<rows; i++) p.box(frame, x, sill+height*i/rows, -.064, width, .040, .064);
  if (style === 'sash') {
    p.box('chalk', x, sill+height*.51, -.024, width+.035, .072, .092);
  } else if (style === 'french') {
    for (const sign of [-1,1]) p.box('wood', x+sign*width*.25, sill+.105, -.065, width*.47, .20, .060);
  }
}

export function storey(p: ModelTools, w: number, d: number, h: number, wall: Pigment, pattern: WallPattern,
  ground = false, style: WindowStyle = pattern === 'industrial' ? 'factory' : pattern === 'pilasters' ? 'fanlight' : 'sash', phase = 0, markDoor = true) {
  p.box('recess', 0, h / 2, 0, w - .42, h, d - .42);
  around(p, w, d, (span, side) => {
    const bays = Math.max(1, Math.floor(span / (pattern === 'industrial' ? 1.52 : 1.14)));
    const pitch = span / bays;

    for (let i = 0; i < bays; i++) {
      const x = pitch * (i + .5) - span / 2;
      const door = ground && side === 0 && i === Math.floor(bays / 2);
      const featured = side % 2 === 0 && (bays === 1 || i === Math.floor((bays-1)/2));
      const unit = style === 'oriel' && (!featured || ground) ? 'sash' : style;
      const wide = unit === 'paired' || unit === 'oriel' || unit === 'factory';
      const open = door ? Math.min(.80,pitch*.64) : Math.min(pitch*(wide ? .80 : .68), wide ? 1.38 : .89);
      const sill = door ? .10 : unit === 'french' ? .145 : ground ? .47 : .29;
      const top = h - (unit === 'fanlight' || unit === 'paired' ? .19 : .25);
      const room = (phase * 3 + side * 2 + i) % 5;
      for (const sign of [-1, 1]) {
        p.box(wall, x + sign * (open + pitch) / 4, h / 2, -.083, (pitch - open) / 2, h, .17);
      }
      p.box(wall, x, sill / 2, -.085, open, sill, .17);
      p.box(wall, x, (top + h) / 2, -.085, open, h - top, .17);
      p.box('lintel', x, sill, .012, open + .14, .083, .22);
      if (!door) windowBay(p, unit, x, sill, top, open, wall, room);
      if (door) {
        if (markDoor) p.entrance(x, .105, .30);
        p.box('wood', x, (sill+top)/2, -.115, open, top-sill, .041);
        p.box('amber', x, top - .14, -.071, open - .08, .21, .031);
        for (const panelY of [sill + .24, sill + .64]) {
          for (const sx of [-1, 1])
            p.box('wood', x + sx * open * .225, panelY, -.060, open * .33, .25, .066);
        }
        p.box('gold', x + open * .12, sill + .63, -.005, .032, .11, .035);
        p.box('stone', x, .045, .15, open + .25, .12, .43);
        p.box('lintel', x, top + .11, .072, open + .32, .095, .30);
      } else if (pattern === 'shutters' && side % 2 === 0 && unit === 'sash') {
        for (const sign of [-1, 1]) {
          p.box('sage', x + sign * (open / 2 + .108), (top + sill) / 2, .03, .18, top - sill, .08);
          for (const dy of [.25, .64])
            p.box('verdigris', x + sign * (open / 2 + .108), sill + dy * (top - sill), .082, .16, .042, .035);
        }
      } else if (pattern === 'gallery' && side % 2 === 0 && !ground && unit !== 'oriel')
        balcony(p, x, sill - .08, open + .12);
      else if (pattern === 'pilasters') {
        p.box('stone', x - pitch * .43, h / 2, .038, .12, h - .15, .16);
        if (unit !== 'fanlight' && unit !== 'paired') p.box('lintel', x, top + .05, .015, open + .21, .13, .20);
      }
    }
  });
  p.box('shade', 0, h - .065, 0, w + .10, .12, d + .10);
  p.box('lintel', 0, h - .017, 0, w + .16, .063, d + .16);
}
