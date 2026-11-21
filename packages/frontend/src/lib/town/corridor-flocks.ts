import * as T from 'three';
import gull from './flying-gull.json';
import { corridorLightField } from './corridor-light.js';
import { valleyOrigin } from './valley-river.js';

const spacing=260,reach=4,capacity=13;
type WallBounds={west:number,east:number};

function gullGeometry(){
  const positions:number[]=[],colors:number[]=[];
  const palette=gull.palette.map(([r,g,b])=>new T.Color().setRGB(r!/255,g!/255,b!/255,T.SRGBColorSpace));
  for(const [x,y,z,pigment] of gull.vertices){
    positions.push(x!/2048,y!/2048,z!/2048);
    const color=palette[pigment!]!;
    colors.push(color.r,color.g,color.b);
  }
  const geometry=new T.BufferGeometry();
  geometry.setIndex(gull.indices);
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  return geometry;
}

function flightPath(row:number,walls:WallBounds){
  let seed=Math.imul(row+29,0x85ebca6b)>>>0;
  function draw(){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    return seed/4294967296;
  }
  const phase=draw(),angularSpeed=.046+.026*draw(),turn=draw()<.5?-1:1;
  const across=42+draw()*65,along=80+draw()*58,height=19+draw()*25;
  const centerX=valleyOrigin.x+12+(draw()-.5)*57;
  const count=7+Math.floor(draw()*(capacity-6));
  const birds=Array.from({length:count},(_,i)=>{
    const rank=Math.ceil(i/2);
    return {lag:rank*(.37+draw()*.25),offset:(i%2?1:-1)*rank*(1.5+draw()*1.2),
      rise:(draw()-.5)*4.8,span:.86+.26*draw(),phase:draw()*Math.PI*2};
  });
  const west=walls.west-34,east=walls.east+34;
  const speed=angularSpeed*across,loopLength=2*Math.PI*across;
  const duration=(east-west+loopLength)/speed;
  return {phase,turn,speed,across,along,height,centerX,birds,west,east,loopLength,duration,period:duration+14+draw()*16};
}

export function corridorFlocks(ground:(x:number,z:number)=>number,clock:T.IUniform<number>,walls:WallBounds){
  const group=new T.Group();group.name='Corridor gulls';
  const geometry=gullGeometry();
  const material=new T.ShaderMaterial({
    vertexColors:true,side:T.DoubleSide,uniforms:{flightTime:clock},
    vertexShader:`
      uniform float flightTime;
      varying vec3 pigment;
      ${corridorLightField}
      void main(){
        vec3 root=(modelMatrix*instanceMatrix[3]).xyz;
        float bird=float(gl_InstanceID);
        float rhythm=flightTime*(8.6+.85*sin(bird*5.13))+bird*2.4+root.z*.013;
        float flapping=smoothstep(-.54,.34,sin(flightTime*.68+bird*1.94+root.x*.021));
        float span=abs(position.x),side=sign(position.x);
        float sweep=sin(rhythm)-.13;
        float tip=sin(rhythm-.85)-sin(rhythm);
        float angle=side*flapping*(.75*sweep+.44*tip*smoothstep(.17,.48,span))*smoothstep(.032,.11,span);
        vec2 hinge=vec2(side*.025,0.);
        vec3 posed=position;
        posed.xy=hinge+mat2(cos(angle),sin(angle),-sin(angle),cos(angle))*(posed.xy-hinge);
        posed*=1.-smoothstep(600.,790.,distance(root,cameraPosition));
        float light=smoothstep(-.4,.4,canopyLightField(root,flightTime));
        pigment=color*mix(vec3(.64,.71,.76),vec3(1.04,1.01,.94),light);
        gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(posed,1.);
      }`,
    fragmentShader:`
      varying vec3 pigment;
      void main(){
        gl_FragColor=vec4(pigment*(gl_FrontFacing?1.:.82),1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const frame=new T.Object3D();
  const slots=Array.from({length:2*reach+1},()=>{
    const mesh=new T.InstancedMesh(geometry,material,capacity);
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    mesh.boundingSphere=new T.Sphere(new T.Vector3((walls.west+walls.east)/2,105,0),Math.hypot((walls.east-walls.west)/2+54,175,115));
    group.add(mesh);
    return {mesh,row:Infinity,path:flightPath(0,walls)};
  });
  function tick(time:number,eyeZ:number){
    const center=Math.round(eyeZ/spacing);
    for(let row=center-reach;row<=center+reach;row++){
      const slot=slots[T.MathUtils.euclideanModulo(row,slots.length)]!;
      const {mesh}=slot;
      if(slot.row!==row){
        slot.row=row;slot.path=flightPath(row,walls);mesh.position.z=row*spacing;
        mesh.count=slot.path.birds.length;
      }
      mesh.visible=Math.abs(eyeZ-mesh.position.z)<970;
      if(!mesh.visible)continue;
      const path=slot.path;
      const elapsed=time+path.phase*path.period*2;
      const trip=Math.floor(elapsed/path.period);
      const direction=trip%2===0?1:-1;
      const approach=Math.abs(path.centerX-(direction===1?path.west:path.east));
      const tripTime=elapsed-trip*path.period;
      for(const [i,bird] of path.birds.entries()){
        const travel=T.MathUtils.clamp(tripTime-bird.lag,0,path.duration)*path.speed-approach;
        const arc=T.MathUtils.clamp(travel,0,path.loopLength);
        const a=arc/path.across,leg=travel-arc;
        const drift=bird.phase+time*.41;
        const vx=direction*Math.cos(a);
        const vz=path.turn*(path.along/path.across*Math.sin(a)+leg*.00072);
        const yaw=Math.atan2(vx,vz),offset=bird.offset+1.1*Math.sin(drift);
        const x=path.centerX+direction*(path.across*Math.sin(a)+leg)+offset*Math.cos(yaw);
        const z=path.turn*(-path.along*Math.cos(a)+leg*leg*.00036)-offset*Math.sin(yaw);
        const floor=Math.max(0,ground(x,mesh.position.z+z));
        frame.position.set(x,floor+path.height+bird.rise+4*Math.sin(a+.6)+.7*Math.sin(drift*.83),z);
        const bank=direction*path.turn*.24*Math.min(1,arc/9,(path.loopLength-arc)/9);
        frame.rotation.set(-.055*Math.cos(a),yaw,bank+.046*Math.sin(drift),'YXZ');
        frame.scale.setScalar(bird.span);frame.updateMatrix();
        mesh.setMatrixAt(i,frame.matrix);
      }
      mesh.instanceMatrix.needsUpdate=true;
    }
  }
  tick(0,0);
  return {group,tick,dispose(){for(const {mesh} of slots)mesh.dispose();geometry.dispose();material.dispose();}};
}
