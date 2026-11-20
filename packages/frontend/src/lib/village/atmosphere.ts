import * as T from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

const surfaceVertex = `
  varying vec2 vUv;
  varying vec3 vWorld;
  #ifdef RIVER_REFLECTION
    uniform mat4 textureMatrix;
    varying vec4 reflectionUv;
  #endif
  void main() {
    vUv = uv;
    #ifdef RIVER_REFLECTION
      reflectionUv = textureMatrix * vec4(position,1.0);
    #endif
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const noise = `
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float softNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
               mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
  }
`;

const waterFragment = `
  uniform float clock;
  uniform float shower;
  uniform float puddle;
  #ifdef RIVER_REFLECTION
    uniform sampler2D tDiffuse;
    varying vec4 reflectionUv;
  #else
    uniform samplerCube horizon;
  #endif
  varying vec2 vUv;
  varying vec3 vWorld;
  ${noise}
  void main() {
    vec2 p = vWorld.xz;
    float bend = softNoise(p * .45 + vec2(clock * .07, 0.0));
    vec2 waves = vec2(sin(p.y * 8.0 + bend * 4.0 + clock * .85),
                      sin(p.x * 2.8 - p.y * 5.1 + clock * .62));
    vec2 cell = p * 1.56;
    vec2 tile = floor(cell);
    vec2 drop = .25 + .5 * vec2(hash(tile), hash(tile + 17.0));
    float age = fract(clock * .40 + hash(tile + 9.0));
    float distanceToDrop = length(fract(cell) - drop);
    float ring = (1.0 - smoothstep(.009,.043,abs(distanceToDrop - age * .43))) *
                 smoothstep(.02,.18,age) * (1.0 - age) * shower;
    vec3 normal = normalize(vec3(waves.x * .045 + ring * .10, 1.0, waves.y * .075 + bend * .045));
    vec3 eye = normalize(vWorld - cameraPosition);
    vec3 reflected = reflect(eye, normal);
    float shore = smoothstep(.0,.20,vUv.y)*(1.0-smoothstep(.81,1.0,vUv.y));
    vec3 bed = mix(vec3(.050,.130,.120), vec3(.032,.108,.112), shore);
    float fresnel = pow(1.0 - clamp(-dot(eye,normal),0.0,1.0), 2.0);
    #ifdef RIVER_REFLECTION
      vec2 projected = reflectionUv.xy / reflectionUv.w;
      vec2 offset = vec2(waves.x + ring, waves.y + ring) * vec2(.0024,.0045);
      vec3 reflectedVillage = texture2D(tDiffuse,clamp(projected+offset,.002,.998)).rgb;
      vec3 color = mix(bed,reflectedVillage * vec3(.87,.95,.93),.38+.47*fresnel);
    #else
      vec3 sky = textureCube(horizon, vec3(-reflected.x, reflected.yz)).rgb;
      vec3 color = mix(bed, sky * vec3(.90,.98,1.03), .30 + .57*fresnel);
    #endif
    float streak = smoothstep(.85,.98, waves.x*.5+.5) * smoothstep(.48,.84,softNoise(p*vec2(1.5,8.0)+bend));
    color += vec3(.60,.48,.28) * streak * (.06+.13*fresnel) + vec3(.50,.61,.54)*ring*.60;
    float rim = length((vUv-.5)*2.0) + .14*(softNoise(p*3.0)-.5) + .12* sin(vUv.x*14.0);
    float alpha = mix(1.0, .72 * (1.0-smoothstep(.68,1.0,rim)), puddle);
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const veilFragment = `
  uniform float clock;
  uniform float mode;
  uniform float strength;
  varying vec2 vUv;
  varying vec3 vWorld;
  ${noise}
  void main() {
    float x=vUv.x, y=vUv.y;
    vec3 tint;
    float density;
    if(mode < .5) {
      float axis=x + .44*y;
      float strands = .22 + .78 * softNoise(vec2(axis*21.0,clock*.045));
      density = exp(-pow(abs(axis-.62)*2.8,2.0))*strands*smoothstep(0.0,.32,y)*(1.0-smoothstep(.86,1.0,y));
      tint=vec3(1.0,.71,.33);
    } else if(mode < 1.5) {
      float eddy=softNoise(vec2(vWorld.x*.16-clock*.044,vWorld.y*.67+vWorld.z*.13));
      density=pow(sin(3.14159*clamp(y,.0,1.0)),1.65)*smoothstep(.06,.86,eddy);
      tint=vec3(.68,.79,.75);
    } else {
      float wisp=sin(y*8.0-clock*.77)*(.035+.14*y) + .10*y;
      float width=.035+.095*y;
      density=exp(-pow(abs(x-.5-wisp)/width,2.0))*sin(3.14159*y)*
        (.45+.55*softNoise(vec2(y*8.0-clock*.28,x*7.0)));
      tint=vec3(.87,.90,.79);
    }
    density*=smoothstep(.0,.12,x)*(1.0-smoothstep(.88,1.0,x));
    gl_FragColor=vec4(tint,clamp(density*strength,0.0,1.0));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function glowTexture() {
  const canvas=document.createElement('canvas');
  canvas.width=canvas.height=128;
  const ctx=canvas.getContext('2d')!;
  const halo=ctx.createRadialGradient(64,64,0,64,64,64);
  for(const [radius,alpha] of [[0,.80],[.10,.51],[.23,.28],[.45,.10],[.78,.018],[1,0]] as const)
    halo.addColorStop(radius,`rgba(255,255,255,${alpha})`);
  ctx.fillStyle=halo;
  ctx.fillRect(0,0,128,128);
  return new T.CanvasTexture(canvas);
}

export function atmosphere(scene:T.Scene, horizon:T.CubeTexture, renderer:T.WebGLRenderer) {
  const group=new T.Group();
  scene.add(group);
  const clock={value:4.2}, shower={value:0};
  const plane=new T.PlaneGeometry(1,1);
  function sheet(material:T.Material,x:number,y:number,z:number,width:number,height:number) {
    const mesh=new T.Mesh(plane,material);
    mesh.position.set(x,y,z);mesh.scale.set(width,height,1);
    group.add(mesh);
    return mesh;
  }
  function water(puddle:number){
    return new T.ShaderMaterial({uniforms:{clock,shower,puddle:{value:puddle},horizon:{value:horizon}},
      vertexShader:surfaceVertex,fragmentShader:waterFragment,transparent:!!puddle,depthWrite:!puddle});
  }
  const compact=renderer.domElement.clientWidth<700;
  const river = new Reflector(plane,{textureWidth:compact?320:512,textureHeight:compact?240:320,multisample:0,clipBias:.002});
  if(!renderer.extensions.has('EXT_color_buffer_float'))river.getRenderTarget().texture.type=T.UnsignedByteType;
  const riverMaterial=river.material as T.ShaderMaterial;
  riverMaterial.defines={RIVER_REFLECTION:1};
  Object.assign(riverMaterial.uniforms,{clock,shower,puddle:{value:0}});
  riverMaterial.vertexShader=surfaceVertex;
  riverMaterial.fragmentShader=waterFragment;
  river.position.set(0,-.389,-19);river.scale.set(110,10,1);river.rotation.x=-Math.PI/2;
  group.add(river);
  let moving=true;
  let lastCapture=-Infinity, previousSky=-1, previousAspect=0;
  const previousCamera=new T.Matrix4();
  const capture=river.onBeforeRender.bind(river);
  river.onBeforeRender=(renderer,world,camera,geometry,mat,batch)=>{
    const aspect=camera.projectionMatrix.elements[0]!;
    const changed=!previousCamera.equals(camera.matrixWorld) || previousAspect!==aspect || previousSky!==horizon.version;
    const now=performance.now();
    const age=now-lastCapture;
    if(age<140 || (!changed && (!moving || age<1400)))return;
    capture(renderer,world,camera,geometry,mat,batch);
    previousCamera.copy(camera.matrixWorld);previousAspect=aspect;
    previousSky=horizon.version;lastCapture=now;
  };
  const wet=water(1);
  for(const [x,z,width,length,angle] of [[-1.4,-3.4,2.1,1.1,.22],[1.75,-6.6,2.2,.83,-.23],[-1.1,-9.5,2.65,.75,.1],[.8,-12.1,1.25,.53,-.25],[4.0,-4.7,1.3,.66,.4]] as const){
    const pool=sheet(wet,x,-.018,z,width,length);
    pool.rotation.set(-Math.PI/2,0,angle);
  }
  function veil(mode:number,strength:number,x:number,y:number,z:number,w:number,h:number,angle=0){
    const material=new T.ShaderMaterial({uniforms:{clock,mode:{value:mode},strength:{value:strength}},
      vertexShader:surfaceVertex,fragmentShader:veilFragment,transparent:true,depthWrite:false,side:T.DoubleSide});
    const mesh=sheet(material,x,y,z,w,h);mesh.rotation.y=angle;mesh.renderOrder=2;
    return mesh;
  }
  const sunlight=new T.ShaderMaterial({
    uniforms:{clock},vertexShader:surfaceVertex,transparent:true,depthWrite:false,
    blending:T.AdditiveBlending,
    fragmentShader:`
      uniform float clock;
      varying vec2 vUv;
      varying vec3 vWorld;
      ${noise}
      void main(){
        vec2 p = vWorld.xz;
        float lateral = p.x - p.y * .43 + 1.85;
        float sunlitArea = exp(-pow(abs(lateral)/1.08,2.0))*smoothstep(-.5,.5,p.y)*(1.0-smoothstep(2.9,5.7,p.y));
        float laths = smoothstep(.035,.14,abs(fract(lateral*2.35+.18)-.5));
        float screen = mix(.38,1.0,laths);
        float movingLeaves = softNoise(p*2.4+vec2(clock*.036,0));
        gl_FragColor=vec4(1.0,.70,.34,sunlitArea*screen*(.16+.24*movingLeaves));
        #include <colorspace_fragment>
      }`
  });
  const matLight=sheet(sunlight,0,.202,3.60,8.9,5.15);
  matLight.rotation.x=-Math.PI/2;
  const deskLight=sheet(sunlight,-1.36,.703,2.64,2.73,1.22);
  deskLight.rotation.x=-Math.PI/2;
  const beam=veil(0,.22,-1.25,1.52,1.85,5.0,3.15,.42);
  beam.rotation.z=-.32;
  veil(0,.13,-2.1,2.65,-6.3,6.0,5.3,-.4);
  veil(1,.28,0,.85,-21.2,69,2.7);
  veil(1,.29,0,2.35,-30.7,100,5.5);
  const steam=veil(2,.54,-2.13,1.10,2.65,.34,.54);
  const glow=glowTexture();
  const glows:T.Sprite[]=[];
  function lantern(x:number,y:number,z:number,size:number,intensity:number){
    const light=new T.PointLight('#ffb760',intensity,5.3,2);
    light.position.set(x,y,z);scene.add(light);
    const halo=new T.Sprite(new T.SpriteMaterial({map:glow,color:'#ffbd69',transparent:true,opacity:.88,
      blending:T.AdditiveBlending,depthWrite:false,toneMapped:false}));
    halo.position.copy(light.position);halo.scale.set(size,size,1);halo.renderOrder=3;
    group.add(halo);glows.push(halo);
  }
  lantern(-2.8,2.2,.1,2.65,12);
  lantern(3.58,2.1,-.85,1.95,7);

  const motes=new Float32Array(72*3), phases=new Float32Array(72);
  let seed=406;
  const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  for(let i=0;i<phases.length;i++){
    const inside=i<38;
    motes[i*3]=(random()-.5)*(inside?5:14);
    motes[i*3+1]=.40+random()*(inside?2.33:3.7);
    motes[i*3+2]=inside?.5+random()*3.1:-2-random()*11;
    phases[i]=random()*6.28;
  }
  const leafGeometry=new T.BufferGeometry();
  leafGeometry.setAttribute('position',new T.Float32BufferAttribute([
    0,.09,0, -.045,.012,.011, 0,-.08,0,
    0,.09,0, 0,-.08,0, .035,.025,.016
  ],3));
  const leaves=new T.InstancedMesh(leafGeometry,new T.MeshLambertMaterial({color:'#e2aa60',side:T.DoubleSide}),15);
  const leafSeeds=Array.from({length:leaves.count},(_,i)=>({
    x:i%3===0?5.4+random()*1.6:-5.6+random()*3.9,z:-2.4-random()*10,
    phase:random()*8,rate:.042+random()*.025
  }));
  const leafPose=new T.Object3D();
  leaves.frustumCulled=false;group.add(leaves);
  function driftLeaves(time:number){
    leafSeeds.forEach((seed,i)=>{
      const fall=(time*seed.rate+seed.phase)%1;
      const sway=time*.53+seed.phase;
      leafPose.position.set(seed.x+Math.sin(sway)*.60+fall*1.2, .06+(1-fall)*3.3,seed.z+Math.cos(sway*.73)*.35);
      leafPose.rotation.set(.5+Math.sin(sway),sway+fall*2.4,Math.cos(sway*.65));
      leafPose.scale.setScalar(Math.min(1,fall*15,(1-fall)*15));
      leafPose.updateMatrix();leaves.setMatrixAt(i,leafPose.matrix);
    });
    leaves.instanceMatrix.needsUpdate=true;
  }
  driftLeaves(clock.value);
  const moteGeometry=new T.BufferGeometry();
  moteGeometry.setAttribute('position',new T.BufferAttribute(motes,3));
  moteGeometry.setAttribute('seed',new T.BufferAttribute(phases,1));
  const moteMaterial=new T.ShaderMaterial({uniforms:{clock,resolution:{value:600}},
    vertexShader:`
      attribute float seed;
      uniform float clock, resolution;
      varying float light;
      void main(){
        vec3 p=position+vec3(sin(clock*.24+seed)*.19,sin(clock*.37+seed*3.0)*.12,cos(clock*.19+seed)*.13);
        vec4 eye=modelViewMatrix*vec4(p,1.0);
        gl_Position=projectionMatrix*eye;
        gl_PointSize=clamp(resolution*.022/max(.75,-eye.z),1.5,7.0);
        light=.26+.34*(sin(clock*.50+seed)*.5+.5);
      }`,
    fragmentShader:`varying float light;
      void main(){float r=length(gl_PointCoord-.5)*2.0;
        gl_FragColor=vec4(1.0,.85,.55,light*(1.0-smoothstep(.08,1.0,r)));
        #include <colorspace_fragment>
      }`,transparent:true,depthWrite:false,blending:T.AdditiveBlending});
  const dust=new T.Points(moteGeometry,moteMaterial);group.add(dust);

  return {
    updateRiverBanks(width:number){river.scale.x=width;previousSky=-1;lastCapture=-Infinity;},
    update(dt:number,still:boolean,rain:boolean,camera:T.PerspectiveCamera){
      moving=!still;
      if(!still){clock.value+=dt;driftLeaves(clock.value);}
      shower.value=still?Number(rain):T.MathUtils.damp(shower.value,Number(rain),1.3,dt);
      steam.rotation.y=Math.atan2(camera.position.x-steam.position.x,camera.position.z-steam.position.z);
    },
    resize(height:number){moteMaterial.uniforms.resolution!.value=height;},
    dispose(){
      river.getRenderTarget().dispose();
      for(const halo of glows)halo.material.dispose();
      glow.dispose();moteGeometry.dispose();moteMaterial.dispose();
    }
  };
}
