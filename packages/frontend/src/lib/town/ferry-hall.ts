import * as T from 'three';
import type { Gouache } from './gouache.js';
import { createModelWorkshop, type ModelTools, type Pigment } from './model-workshop.js';

const bayWidth = 2.16;
const arcadeDepth = 3.1;


function archBand(p: ModelTools, color: Pigment, x: number, y: number, z: number, radius: number, rise: number, band: number, thickness: number) {
  const path = new T.Shape();
  path.absellipse(0, 0, radius, rise, 0, Math.PI, false, 0);
  path.absellipse(0, 0, radius - band, rise - band, Math.PI, 0, true, 0);
  path.closePath();
  p.relief(color, path, thickness, x, y, z);
}

function platform(p: ModelTools) {
  p.box('shade', 0, -.43, .3, bayWidth, 1, 5.2);
  p.box('stone', 0, .085, .3, bayWidth, .12, 5.23);
  p.box('lintel', 0, .12, 2.86, bayWidth - .016, .17, .20);
  p.box('slate', 0, .152, 1.95, bayWidth, .028, .055);
  for (const x of [-.72, 0, .72]) p.box('shade', x, .148, 2.39, .013, .009, .78);
  p.box('wood', 0, -.34, 2.92, .19, 1.09, .18);
  p.box('iron', 0, .07, 3.01, .20, .12, .035);
}

function pier(p: ModelTools, x: number, z: number) {
  p.box('shade', x, .32, z, .39, .35, .37);
  p.box('lintel', x, .5, z, .43, .09, .40);
  p.box('stone', x, .82, z, .31, .57, .29);
  p.box('lintel', x, 1.12, z, .35, .085, .34);
  for (const dx of [-.075, .075]) p.rod('iron', p.vec(x + dx, 1.15, z), p.vec(x + dx, 2.28, z), .050);
  p.box('gold', x, 1.23, z, .23, .055, .15);
  p.box('copper', x, 2.29, z, .27, .13, .21);
  p.box('lintel', x, 2.42, z, .34, .11, .29);
}

function roofSurface(p: ModelTools, halfSpan: number, ridgeY: number, curve: number, color: Pigment) {
  const left = -bayWidth / 2, right = bayWidth / 2;
  function point(x: number, angle: number, lift = 0) {
    return p.vec(x, ridgeY - curve * (1 - Math.cos(angle)) + lift, halfSpan * Math.sin(angle));
  }
  const points: T.Vector3[] = [];
  const normals: number[] = [];
  for (let i = 0; i < 18; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 18, b = a + Math.PI / 18;
    const v = point(left, a), w = point(right, a), u = point(left, b), t = point(right, b);
    points.push(v, u, t, v, t, w, v, t, u, v, w, t);
    for (const [index, angle] of [a, b, b, a, b, a, a, b, b, a, a, b].entries()) {
      const normal = p.vec(0, halfSpan * Math.cos(angle), curve * Math.sin(angle)).normalize();
      normal.multiplyScalar(index < 6 ? 1 : -1);
      normals.push(normal.x, normal.y, normal.z);
    }
    for (const x of [left + .025, 0]) p.rod('seam', point(x, a, .017), point(x, b, .017), .019);
  }
  const skin = new T.BufferGeometry().setFromPoints(points);
  skin.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
  p.place(skin, color, new T.Matrix4());
  skin.dispose();
}

function roofBay(p: ModelTools) {
  roofSurface(p, 1.92, 3.30, .81, 'copper');
  for (const side of [0, 2]) p.face(side, () => {
    p.box('copper', 0, 2.5, .33, bayWidth, .095, .145);
    p.box('gold', 0, 2.48, .41, bayWidth, .035, .035);
    p.box('iron', 0, 2.46, 0, bayWidth, .15, .14);
    archBand(p, 'copper', 0, 1.54, -.067, bayWidth / 2 - .09, .78, .10, .134);
    for (let i = -3; i <= 3; i++) {
      const x = i * .244;
      const y = 1.54 + .78 * Math.sqrt(1 - (x / (bayWidth / 2 - .09)) ** 2);
      p.rod('gold', p.vec(x, y, 0), p.vec(x, 2.42, 0), .019);
    }
  });
  for (const z of [-.43, .43]) {
    p.box('iron', 0, 3.49, z, bayWidth, .46, .065);
    for (let i = 0; i < 5; i++) {
      const x = (i - 2) * .42;
      p.box(i % 3 === 1 ? 'amber' : 'glass', x, 3.49, z + Math.sign(z) * .041, .366, .32, .025);
    }
    p.box('gold', 0, 3.67, z, bayWidth, .045, .11);
  }
  roofSurface(p, .55, 3.82, .13, 'copper');
  p.box('wood', 0, 2.53, 0, .11, .12, 3.36);
  for (const sign of [-1, 1]) {
    p.rod('iron', p.vec(0, 2.52, sign * 1.57), p.vec(0, 3.19, 0), .044);
    p.rod('iron', p.vec(0, 2.53, 0), p.vec(0, 2.87, sign * .76), .027);
  }
  p.rod('gold', p.vec(0, 2.53, 0), p.vec(0, 2.16, 0), .023);
  p.orb('lantern', 0, 2.07, 0, .13);
  p.mark('Interior pendant',0,2.07,0);
  p.box('copper', 0, 2.19, 0, .25, .048, .25);
}

function clockGate(p: ModelTools) {
  for (const side of [0, 2]) p.face(side, () => {
    for (const x of [-.95, .95]) {
      p.box('stone', x, 1.37, .18, .19, 2.44, .42);
      p.box('lintel', x, 2.51, .18, .30, .15, .53);
      p.box('stone', x, .36, .22, .36, .37, .54);
    }
    const tympanum = new T.Shape();
    tympanum.absarc(0, 0, .99, 0, Math.PI, false);
    tympanum.closePath();
    p.relief('glass', tympanum, .18, 0, 2.62, .12);
    archBand(p, 'stone', 0, 2.62, .08, 1.13, 1.17, .15, .38);
    archBand(p, 'gold', 0, 2.62, .46, 1.085, 1.12, .04, .035);
    p.box('lintel', 0, 2.60, .25, 2.22, .12, .46);
    for (let i = 1; i < 10; i++) {
      const a = i * Math.PI / 10;
      p.rod('gold', p.vec(0, 2.65, .32), p.vec(.99 * Math.cos(a), 2.62 + .99 * Math.sin(a), .32), .019);
    }
    const dialY = 3.16;
    const disk = (color: Pigment, radius: number, z: number, thickness: number) => {
      const shape = new T.Shape();
      shape.absarc(0, 0, radius, 0, Math.PI * 2, false);
      p.relief(color, shape, thickness, 0, dialY, z);
    };
    disk('copper', .385, .33, .17);
    disk('gold', .353, .49, .036);
    disk('lintel', .312, .524, .019);
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      const tick = (r: number) => p.vec(Math.sin(a) * r, dialY + Math.cos(a) * r, .552);
      p.rod('iron', tick(i % 3 ? .25 : .225), tick(.286), .013);
    }
    p.clock(0,dialY,.574,.312);
    p.orb('gold', 0, dialY, .59, .032);
    p.orb('gold', 0, 3.92, .23, .09);
    p.rod('gold', p.vec(0, 3.78, .23), p.vec(0, 4.095, .23), .029);
  });
}

function boardingLanding(p: ModelTools) {
  for (const [z, top] of [[3.02, .03], [3.18, -.09], [3.34, -.21]] as const)
    p.box('stone', 0, top - .22, z, 1.54, .44, .20);
  for (const x of [-.83, .83]) {
    p.rod('iron', p.vec(x, .12, 2.50), p.vec(x, .95, 2.50), .038);
    p.rod('iron', p.vec(x, -.20, 3.32), p.vec(x, .64, 3.32), .038);
    p.rod('gold', p.vec(x, .95, 2.50), p.vec(x, .64, 3.32), .039);
    p.orb('gold', x, .95, 2.50, .061);
  }
}

function lifeRing(p: ModelTools) {
  const x = .76, z = 2.49, y = .80;
  p.rod('iron', p.vec(x, .15, z), p.vec(x, 1.14, z), .046);
  p.box('wood', x, .82, z, .61, .085, .085);
  for (let i = 0; i < 8; i++) {
    const segment = new T.TorusGeometry(.237, .052, 8, 9, Math.PI / 4).toNonIndexed();
    const rotation = new T.Matrix4().makeRotationZ(i * Math.PI / 4).setPosition(x, y, z + .088);
    p.place(segment, i % 2 ? 'clay' : 'lintel', rotation);
    segment.dispose();
  }
  const rope = new T.TorusGeometry(.32, .011, 5, 36).toNonIndexed();
  p.place(rope, 'gold', new T.Matrix4().makeTranslation(x, y, z + .074));
  rope.dispose();
}

function waitingBench(p: ModelTools) {
  for (const z of [-.18, 0, .18]) p.box('wood', 0, .60, -.64 + z, 1.53, .075, .13);
  for (const x of [-.52, .52]) {
    for (const z of [-.8, -.48]) p.rod('iron', p.vec(x, .15, z), p.vec(x, .59, z), .047);
    p.rod('iron', p.vec(x, .48, -.78), p.vec(x, 1.08, -.89), .043);
  }
  for (const y of [.82, 1.02]) p.box('wood', 0, y, -.86, 1.53, .125, .075);
}

function ticketOffice(p: ModelTools) {
  p.box('wood', 0, .65, -.75, 1.68, 1, .99);
  p.box('lintel', 0, 1.13, -.73, 1.81, .09, 1.12);
  for (const x of [-.77, .77]) for (const z of [-1.18, -.32])
    p.box('copper', x, 1.59, z, .083, .93, .085);
  p.box('amber', 0, 1.57, -1.17, 1.48, .80, .043);
  for (const x of [-.49, 0, .49]) p.box('wood', x, 1.58, -1.14, .039, .86, .059);
  p.box('copper', 0, 2.07, -.74, 1.86, .14, 1.18);
  p.box('gold', 0, 2.01, -.17, 1.84, .035, .095);
  for (let i = -4; i <= 4; i++) p.rod('gold', p.vec(i * .143, 1.44, -.31), p.vec(i * .143, 1.99, -.31), .017);
  p.box('gold', 0, 1.44, -.31, 1.25, .043, .04);
}

function endScreen(p: ModelTools) {
  p.face(1, () => {
    p.box('wood', 0, 2.49, 0, 3.74, .14, .16);
    for (const sign of [-1, 1]) {
      p.box('stone', sign * 1.18, .53, -.01, .62, .78, .22);
      p.box('lintel', sign * 1.18, .95, -.01, .71, .10, .29);
      p.rod('iron', p.vec(sign * 1.18, .98, 0), p.vec(sign * 1.18, 2.43, 0), .060);
    }
    const fan = new T.Shape();
    fan.absellipse(0, 0, 1.82, .73, 0, Math.PI, false, 0);
    fan.closePath();
    p.relief('glass', fan, .07, 0, 2.52, -.06);
    for (let i = 1; i < 12; i++) {
      const a = i * Math.PI / 12;
      p.rod('gold', p.vec(0, 2.52, .035), p.vec(1.82 * Math.cos(a), 2.52 + .73 * Math.sin(a), .035), .025);
    }
    archBand(p, 'copper', 0, 2.52, -.09, 1.92, .81, .085, .23);
    p.box('copper', 0, 3.49, -.015, .88, .45, .10);
    p.box('amber', 0, 3.49, .045, .72, .29, .04);
    p.box('gold', 0, 3.49, .075, .045, .33, .04);
  });
}

export function createFerryHallKit(paint?: Gouache,roomWindows=false,clockHour?:T.IUniform<number>) {
  const {module, dispose} = createModelWorkshop(bayWidth, arcadeDepth, paint,roomWindows,clockHour);
  const quay = module(platform);
  const bay = module(roofBay);
  const supports = module(p => {
    for (const z of [-1.55, 1.55]) pier(p, 0, z);
  });
  const shoreEntry=module(p=>p.entrance(0,.15,-2.27,Math.PI));
  const landing = module(boardingLanding), ring = module(lifeRing);
  const gate = module(clockGate), bench = module(waitingBench), booth = module(ticketOffice), screen = module(endScreen);
  const mooring = module(p => {
    for (const x of [-.081, .081]) p.rod('iron', p.vec(x, .18, 2.65), p.vec(x, .43, 2.65), .055);
    p.box('iron', 0, .45, 2.65, .31, .085, .16);
    p.box('iron', 0, .20, 2.65, .34, .082, .24);
  });
  return {
    buildLanding() {
      const landing = new T.Group();
      landing.name = 'Mooring quay';
      for (const x of [-bayWidth, 0, bayWidth]) {
        const platform = quay.clone();
        platform.position.x = x;
        landing.add(platform);
        const fitting = (x === 0 ? bench : mooring).clone();
        fitting.position.x = x;
        landing.add(fitting);
      }
      landing.add(ring.clone(),shoreEntry.clone());
      return landing;
    },
    build(bays: number) {
      if (!Number.isSafeInteger(bays) || bays < 3) throw new RangeError('Ferry Hall needs at least three bays');
      const hall = new T.Group();
      hall.name = 'Ferry Hall';
      hall.add(shoreEntry.clone());
      const entry = Math.floor(bays / 2);
      function add(template: T.Group, name: string, x: number) {
        const part = template.clone();
        part.name = name;
        part.position.x = x;
        hall.add(part);
        return part;
      }
      for (let i = 0; i < bays; i++) {
        const x = (i - (bays - 1) / 2) * bayWidth;
        add(quay, 'Quay ' + (i + 1), x);
        add(bay, 'Arcade bay ' + (i + 1), x);
        add(supports, 'Piers ' + (i + 1), x - bayWidth / 2);
        if (i === entry) {
          add(gate, 'Boarding gate', x);
          add(landing, 'Boarding steps', x);
        }
        else if (i === entry - 1) add(booth, 'Ticket office', x);
        else add(bench, 'Waiting bench', x);
        if (i === entry + 1) add(ring, 'Life ring', x);
        if (i === 0 || i === bays - 1) add(mooring, 'Bollard', x);
      }
      const last = (bays - 1) * bayWidth / 2;
      add(supports, 'End piers', last + bayWidth / 2);
      add(screen, 'East fanlight', last);
      add(screen, 'West fanlight', -last).rotation.y = Math.PI;
      return hall;
    },
    dispose
  };
}
