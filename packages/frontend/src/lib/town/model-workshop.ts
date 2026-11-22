import { localHour } from './city-clock.js';
import { stirGroundPlants } from './coastal-breeze.js';
import * as T from 'three';
import { paintMaterial, type Gouache } from './gouache.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { finishBuilding } from './surface-relief.js';

export const colors = {
  stone: '#c4a78a', lintel: '#dfcbb0', shade: '#9a7969', plaster: '#bd8162',
  copper: '#487c77', seam: '#78a19a', gold: '#b29461',
  iron: '#3e5457', glass: '#50666c', seaGlass: '#8da9a7', amber: '#d59b56', glow: '#f2c88a', lantern: '#f2c88a',
  wood: '#674b3c', recess: '#363a39', slate: '#505b5a', clay: '#a96450',
  ochre: '#cd9d66', sage: '#93a797', chalk: '#d5c1a6', oxblood: '#97594e',
  foliage: '#526d55', zinc: '#6d8390', verdigris: '#92aba0', crystal: '#b3d4c9'
} as const;
export type Pigment = keyof typeof colors;
type Finish = 'mineral' | 'metal' | 'glazing' | 'crystal' | 'light' | 'hands' | 'leaves';
const surfaceKinds: Partial<Record<Pigment, number>> = {
  plaster:1, ochre:1, sage:1, chalk:1, oxblood:1, stone:2, shade:2, lintel:2, slate:3, clay:3
};

function sculpt(width: number, depth: number, boxShape: T.BufferGeometry, rodShape: T.BufferGeometry, sphere: T.BufferGeometry, roomWindows:boolean) {
  const batches: Record<Finish, T.BufferGeometry[]> = { mineral: [], metal: [], glazing: [], crystal: [], light: [], hands: [], leaves: [] };
  let frame = new T.Matrix4();
  let roomAnchor:T.Vector3|undefined;
  function room(x:number,y:number,z:number,draw:()=>void){
    const previous=roomAnchor;
    roomAnchor=new T.Vector3(x,y,z).applyMatrix4(frame);
    draw();
    roomAnchor=previous;
  }
  const markers: T.Object3D[] = [];
  function mark(name: string, x: number, y: number, z: number, heading = 0) {
    const marker = new T.Object3D();
    marker.name = name;
    const transform = new T.Matrix4().makeRotationY(heading).setPosition(x,y,z);
    transform.premultiply(frame).decompose(marker.position, marker.quaternion, marker.scale);
    markers.push(marker);
  }
  function entrance(x: number, y: number, z: number, heading = 0) {
    mark('Door threshold', x, y, z, heading);
  }
  const vec = (x: number, y: number, z: number) => new T.Vector3(x, y, z);
  function place(shape: T.BufferGeometry, color: Pigment, transform: T.Matrix4) {
    const geometry = shape.clone().applyMatrix4(transform.premultiply(frame));
    geometry.deleteAttribute('uv');
    const warmPane=color==='amber'||color==='glow';
    const tint = new T.Color(colors[roomWindows&&warmPane?'seaGlass':color]);
    const rgb = new Float32Array(geometry.getAttribute('position').count * 3);
    const positions = shape.getAttribute('position');
    const glazing = color === 'glass' || color === 'seaGlass';
    const pane = glazing || warmPane;
    for (let i = 0; i < positions.count; i++) {
      const lift = pane ? 1 - .32 * (positions.getY(i) + .5) + .12 * positions.getX(i) : 1;
      rgb[i * 3] = tint.r * lift;
      rgb[i * 3 + 1] = tint.g * lift;
      rgb[i * 3 + 2] = tint.b * lift;
    }
    geometry.setAttribute('color', new T.BufferAttribute(rgb, 3));
    const finish = color==='foliage'?'leaves':color === 'lantern' || (!roomWindows&&warmPane) ? 'light'
      : pane ? 'glazing' : color === 'crystal' ? 'crystal' : ['copper', 'seam', 'gold', 'iron'].includes(color) ? 'metal' : 'mineral';
    if(roomWindows&&(finish==='glazing'||finish==='crystal')){
      geometry.computeBoundingBox();
      const center=geometry.boundingBox!.getCenter(new T.Vector3());
      const anchor=roomAnchor??center;
      const key=finish==='crystal'?0:Math.round(anchor.x*8)*17+Math.round(anchor.z*8)*67+Math.round(anchor.y*8)*43;
      const threshold=((Math.imul(key,2654435761)>>>0)/4294967296);
      geometry.setAttribute('roomThreshold',new T.Float32BufferAttribute(new Float32Array(positions.count).fill(threshold),1));
      const size=geometry.boundingBox!.getSize(new T.Vector3());
      const axis=size.x<size.z?'x':'z';
      const normal=new T.Vector3();normal[axis]=Math.sign(center[axis])||1;
      geometry.userData.emitter={center,normal,threshold};
    }
    if(finish==='mineral') geometry.setAttribute('surfaceKind',new T.BufferAttribute(new Float32Array(positions.count).fill(surfaceKinds[color]??0),1));
    batches[finish].push(geometry);
  }
  function box(c: Pigment, x: number, y: number, z: number, w: number, h: number, d: number) {
    place(boxShape, c, new T.Matrix4().makeScale(w, h, d).setPosition(x, y, z));
  }
  function rod(c: Pigment, a: T.Vector3, b: T.Vector3, r: number) {
    const axis = b.clone().sub(a);
    const rotation = new T.Quaternion().setFromUnitVectors(vec(0, 1, 0), axis.clone().normalize());
    place(rodShape, c, new T.Matrix4().compose(a.clone().lerp(b, .5), rotation, vec(r, axis.length(), r)));
  }
  function orb(c: Pigment, x: number, y: number, z: number, r: number) {
    place(sphere, c, new T.Matrix4().makeScale(r, r, r).setPosition(x, y, z));
  }
  function clock(x:number,y:number,z:number,radius:number){
    const center=vec(x,y,z);
    for(const minute of [false,true]){
      rod('iron',center,vec(x,y+radius*(minute?.84:.57),z),radius*(minute?.043:.065));
      const hand=batches.metal.pop()!;
      const pivot=center.clone().applyMatrix4(frame),axis=vec(0,0,1).transformDirection(frame);
      const count=hand.getAttribute('position').count;
      hand.setAttribute('pivot',new T.Float32BufferAttribute(Array.from({length:count},()=>pivot.toArray()).flat(),3));
      hand.setAttribute('dialAxis',new T.Float32BufferAttribute(Array.from({length:count},()=>axis.toArray()).flat(),3));
      hand.setAttribute('minuteHand',new T.Float32BufferAttribute(new Float32Array(count).fill(Number(minute)),1));
      batches.hands.push(hand);
    }
  }
  function relief(c: Pigment, path: T.Shape, thickness: number, x: number, y: number, z: number) {
    const g = new T.ExtrudeGeometry(path, { depth: thickness, bevelEnabled: false, curveSegments: 12 });
    place(g, c, new T.Matrix4().makeTranslation(x, y, z));
    g.dispose();
  }
  function face(side: number, fn: () => void, reach = side % 2 ? width / 2 : depth / 2) {
    const previous = frame;
    const angle = side * Math.PI / 2;
    frame = previous.clone().multiply(new T.Matrix4().makeRotationY(angle))
      .multiply(new T.Matrix4().makeTranslation(0, 0, reach));
    fn();
    frame = previous;
  }
  return { batches, markers, room, mark, entrance, clock, vec, box, rod, orb, relief, face, place };
}

export type ModelTools = ReturnType<typeof sculpt>;

export function createModelWorkshop(width: number, depth: number, paint?: Gouache,roomWindows=true,clockHour:T.IUniform<number>={value:localHour()},wind:T.IUniform<number>={value:0}) {
  const finishes = {
    mineral: new T.MeshStandardMaterial({ vertexColors: true, roughness: .84 }),
    metal: new T.MeshStandardMaterial({ vertexColors: true, metalness: .38, roughness: .54 }),
    glazing: new T.MeshStandardMaterial({ vertexColors: true, metalness: .24, roughness: .22 }),
    crystal: new T.MeshStandardMaterial({vertexColors:true, transparent:true, opacity:.34, depthWrite:false, roughness:.24}),
    leaves: new T.MeshStandardMaterial({vertexColors:true,roughness:.92}),
    hands: new T.MeshLambertMaterial({vertexColors:true}),
    light: new T.MeshBasicMaterial({ vertexColors: true })
  };
  stirGroundPlants(finishes.leaves,wind,.075,.48);
  finishes.hands.onBeforeCompile=shader=>{
    shader.uniforms.clockHour=clockHour;
    shader.vertexShader='uniform float clockHour;attribute vec3 pivot,dialAxis;attribute float minuteHand;\n'+shader.vertexShader.replace('#include <begin_vertex>',`
      vec3 arm=position-pivot;
      float angle=-6.2831853*clockHour*mix(1./12.,1.,minuteHand);
      vec3 transformed=pivot+arm*cos(angle)+cross(dialAxis,arm)*sin(angle)+dialAxis*dot(dialAxis,arm)*(1.-cos(angle));
    `);
  };
  if (paint?.relief) finishBuilding(finishes.mineral,paint.relief);
  if (paint) {
    paintMaterial(finishes.mineral, paint);
    paintMaterial(finishes.metal, paint);
  }
  const boxShape = new T.BoxGeometry(1, 1, 1).toNonIndexed();
  const rodShape = new T.CylinderGeometry(1, 1, 1, 10).toNonIndexed();
  const sphere = new T.SphereGeometry(1, 12, 8).toNonIndexed();
  const meshes: T.BufferGeometry[] = [];

  function module(build: (parts: ReturnType<typeof sculpt>) => void) {
    const parts = sculpt(width, depth, boxShape, rodShape, sphere,roomWindows);
    build(parts);
    const group = new T.Group();
    for (const [finish, pieces] of Object.entries(parts.batches)) {
      if (!pieces.length) continue;
      const geometry = mergeGeometries(pieces)!;
      if(roomWindows&&(finish==='glazing'||finish==='crystal')){
        geometry.userData.emitters=pieces.map(piece=>piece.userData.emitter);
        geometry.userData.glassFinish=finish;
      }
      pieces.forEach(piece => piece.dispose());
      meshes.push(geometry);
      const mesh = new T.Mesh(geometry, finishes[finish as Finish]);
      mesh.castShadow = finish !== 'crystal';
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    for (const marker of parts.markers) group.add(marker);
    return group;
  }

  return { module, boxShape,
    dispose() {
      for (const g of [boxShape, rodShape, sphere, ...meshes]) g.dispose();
      for (const material of Object.values(finishes)) material.dispose();
    }
  };
}
