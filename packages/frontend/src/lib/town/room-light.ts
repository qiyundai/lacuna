import { fadingLightSlots } from './fading-light-slots.js';
import * as T from 'three';
import { roomGlow,type CityLight } from './city-clock.js';

export type WindowEmitter={center:T.Vector3;normal:T.Vector3;threshold:number};
export type RoomSource=WindowEmitter & {workplace:boolean;address:number;fixture?:{reach:number;width:number}};

export function floorSeed(address:number,matrix:T.Matrix4){
  const e=matrix.elements;
  let key=address;
  for(const n of [e[12],e[13],e[14]])key=Math.imul(key^Math.round(n*16),16777619);
  return ((key^(key>>>16))>>>0)/4294967296;
}

export function roomLighting(){
  const occupancy={value:new T.Vector3(.1,.55,.5)},daylight={value:1};
  const roomEmission=`
    float activity=mix(occupancy.x,occupancy.y,household.y);
    float distanceToSleep=2.*abs(fract(threshold+occupancy.z)-.5);
    float lit=smoothstep(distanceToSleep-.009,distanceToSleep+.009,activity);
    vec3 emission=mix(vec3(2.5,1.13,.43),vec3(1.68,1.39,.90),threshold)*lit*mix(1.,.29,daylight);`;
  function facade(crystal=false,proxy=false){
    const material=new T.MeshLambertMaterial({vertexColors:!proxy,color:proxy?'#bead95':'#ffffff',
      transparent:crystal,opacity:crystal?.34:1,depthWrite:!crystal});
    material.customProgramCacheKey=()=>proxy?'distant-facade':'occupied-glass';
    material.onBeforeCompile=shader=>{
      Object.assign(shader.uniforms,{occupancy,daylight});
      shader.vertexShader=(proxy?'varying vec3 facadePoint,facadeNormal;varying vec2 facadeGrid;':'attribute float roomThreshold;')+
        'varying vec2 household;varying vec3 roomColor;uniform vec3 occupancy;uniform float daylight;\n'+shader.vertexShader.replace('#include <color_vertex>',`
          #ifdef USE_INSTANCING_COLOR
            vColor=vec4(1.);
          #endif
          #ifdef USE_COLOR
            vColor.rgb=color;
          #endif
          household=instanceColor.rg;
          ${proxy?`facadePoint=position;facadeNormal=normal;
            float span=abs(normal.x)>.5?length(instanceMatrix[2].xyz):length(instanceMatrix[0].xyz);
            facadeGrid=max(vec2(1.),floor(vec2(span/1.45,length(instanceMatrix[1].xyz)/1.7)+.5));`:'float threshold=fract(household.x+roomThreshold);'+roomEmission+'roomColor=emission;'}
        `);
      shader.fragmentShader='varying vec3 roomColor;varying vec2 household;uniform vec3 occupancy;uniform float daylight;\n'+
        (proxy?'varying vec3 facadePoint,facadeNormal;varying vec2 facadeGrid;\n':'')+shader.fragmentShader.replace('#include <opaque_fragment>',`
        float threshold=household.x;
        ${proxy?`vec2 grid=vec2((abs(facadeNormal.x)>.5?facadePoint.z:facadePoint.x)+.5,facadePoint.y+.5)*facadeGrid;
          vec2 border=abs(fract(grid)-.5);
          vec2 aa=max(fwidth(grid),vec2(.018));
          vec2 panes=1.-smoothstep(vec2(.22,.26)-aa,vec2(.22,.26)+aa,border);
          float mask=panes.x*panes.y*(1.-abs(facadeNormal.y));
          threshold=fract(threshold+dot(floor(grid),vec2(.618034,.754878))+dot(facadeNormal,vec3(.42,0.,.79)));
          ${roomEmission}
          outgoingLight+=emission*mask;`:'outgoingLight=outgoingLight*mix(.36,1.,daylight)+roomColor;'}
        #include <opaque_fragment>
        `);
    };
    return material;
  }
  const glazing=facade(),crystal=facade(true),proxy=facade(false,true);
  const sources:RoomSource[]=[];
  return {glazing,crystal,proxy,sources,apply(light:CityLight){
    occupancy.value.set(light.residential,light.workplace,light.roomPhase);daylight.value=light.daylight;
  },dispose(){glazing.dispose();crystal.dispose();proxy.dispose();}};
}

export function windowShafts(depth:T.DepthTexture,camera:T.PerspectiveCamera,limit:number){
  const screen=new T.Vector2(),scene=new T.Scene();
  const material=new T.ShaderMaterial({uniforms:{depth:{value:depth},screen:{value:screen},invProjection:{value:camera.projectionMatrixInverse}},
    side:T.BackSide,transparent:true,depthTest:false,depthWrite:false,blending:T.AdditiveBlending,
    vertexShader:`
      varying vec3 boxPoint;flat varying vec3 eye;flat varying float strength;
      void main(){
        boxPoint=position;strength=instanceColor.r;
        eye=(inverse(instanceMatrix)*vec4(cameraPosition,1.)).xyz;
        gl_Position=projectionMatrix*viewMatrix*instanceMatrix*vec4(position,1.);
      }`,
    fragmentShader:`
      varying vec3 boxPoint;flat varying vec3 eye;flat varying float strength;
      uniform sampler2D depth;uniform vec2 screen;uniform mat4 invProjection;
      void main(){
        vec2 uv=gl_FragCoord.xy/screen;
        vec4 end=invProjection*vec4(uv*2.-1.,texture2D(depth,uv).r*2.-1.,1.);
        vec3 path=boxPoint-eye;
        vec3 nearFace=(sign(-path)*.5-eye)/(path+vec3(.000001));
        float from=max(0.,max(nearFace.x,max(nearFace.y,nearFace.z)));
        float to=min(1.,(-end.z/end.w)*gl_FragCoord.w);
        float span=max(0.,to-from);
        float density=0.;
        for(int i=0;i<5;i++){
          vec3 p=eye+path*(from+(float(i)+.5)*span*.2);
          float along=clamp(p.z+.5,0.,1.);
          float r=length(p.xy)/(.17+.34*along);
          density+=(1.-smoothstep(.34,1.,r))*(1.-along)*(1.-along);
        }
        gl_FragColor=vec4(1.,.60,.32,.12*density*span*length(path)*strength);
      }`});
  const mesh=new T.InstancedMesh(new T.BoxGeometry(),material,limit);
  mesh.frustumCulled=false;mesh.count=0;scene.add(mesh);
  const bounds=new T.Sphere(),transform=new T.Object3D(),axis=new T.Vector3(0,0,1),aim=new T.Vector3(),view=new T.Frustum(),clip=new T.Matrix4();
  const lastEye=new T.Vector3(Infinity,0,0),lastRotation=new T.Quaternion(),intensity=new T.Color();
  const fades=fadingLightSlots(limit);
  let previous=-Infinity,previousLight:CityLight|undefined,changing=false;
  function select(sources:RoomSource[],light:CityLight,time:number,skip?:number){

    view.setFromProjectionMatrix(clip.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    const nearby=light.daylight>=1?[]:sources.flatMap(source=>{
      const distance=camera.position.distanceToSquared(source.center);
      const reach=source.fixture?.reach??2.6,range=source.fixture?175+reach*3:52;
      return distance<range*range && source.address!==skip && (source.fixture || roomGlow(source.threshold,source.workplace,light)>.1)
        && view.intersectsSphere(bounds.set(source.center,reach))?[{source,score:distance/(source.fixture?reach*.85:1),strength:source.fixture?1.35:roomGlow(source.threshold,source.workplace,light)}]:[];
    });
    fades.select(nearby,screen.x<290?limit/2:limit);
    previous=time;previousLight=light;lastEye.copy(camera.position);lastRotation.copy(camera.quaternion);
  }
  function place(light:CityLight){
    mesh.count=0;
    for(const {source,gain} of fades.slots){
      if(!source||gain<=0||light.daylight>=1)continue;
      const reach=source.fixture?.reach??2.6,width=source.fixture?.width??1.3;
      aim.copy(source.normal);if(!source.fixture)aim.y-=.17;aim.normalize();
      transform.position.copy(source.center).addScaledVector(aim,reach*.5);
      transform.quaternion.setFromUnitVectors(axis,aim);
      transform.scale.set(width,width*.93,reach);transform.updateMatrix();
      mesh.setColorAt(mesh.count,intensity.setScalar(gain*(1-light.daylight)));
      mesh.setMatrixAt(mesh.count++,transform.matrix);
    }
    mesh.instanceMatrix.needsUpdate=true;
    if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
  }
  return {screen,invalidate(){previous=-Infinity;},render(renderer:T.WebGLRenderer,sources:RoomSource[],light:CityLight,time:number,dt:number,skip?:number){
    const refresh=time-previous>.7 || previousLight!==light || lastEye.distanceToSquared(camera.position)>1 || Math.abs(lastRotation.dot(camera.quaternion))<.9998;
    if(refresh)select(sources,light,time,skip);
    if(refresh||changing){
      changing=fades.advance(dt);
      place(light);
    }
    if(!mesh.count)return changing;
    const clear=renderer.autoClear;renderer.autoClear=false;renderer.render(scene,camera);renderer.autoClear=clear;
    return changing;
  },dispose(){mesh.dispose();mesh.geometry.dispose();material.dispose();}};
}
