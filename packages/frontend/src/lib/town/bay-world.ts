import * as T from 'three';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import { cloudDriftRate } from './corridor-light.js';

import {lightAt, type CityLight} from './city-clock.js';

const relief = new ImprovedNoise();
const sectorWidth = 640;
const horizonVertex = `
  varying vec3 sightline;
  void main() {
    sightline = position;
    vec4 clip = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.);
    gl_Position = clip.xyww;
  }
`;

function cloudNoise() {
  const size = 256;
  const data = new Uint8Array(size * size);
  function lattice(x: number, y: number, cells: number) {
    const hash = Math.sin((x % cells) * 127.1 + (y % cells) * 311.7 + cells * 5.4) * 43758.5453;
    return hash - Math.floor(hash);
  }
  function layer(u: number, v: number, cells: number) {
    const x = u * cells, y = v * cells;
    const i = Math.floor(x), j = Math.floor(y);
    const s = T.MathUtils.smoothstep(x - i, 0, 1), t = T.MathUtils.smoothstep(y - j, 0, 1);
    return T.MathUtils.lerp(T.MathUtils.lerp(lattice(i,j,cells), lattice(i+1,j,cells), s),
      T.MathUtils.lerp(lattice(i,j+1,cells), lattice(i+1,j+1,cells), s), t);
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const sample = .52 * layer(u, v, 5) + .27 * layer(u, v, 11) + .14 * layer(u, v, 23) + .07 * layer(u, v, 47);
      data[y * size + x] = Math.round(255 * sample);
    }
  }
  const texture = new T.DataTexture(data, size, size, T.RedFormat);
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.magFilter = T.LinearFilter;
  texture.minFilter = T.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

const skyFragment = `
  varying vec3 sightline;
  uniform sampler2D weather;
  uniform vec3 sunDirection;
  uniform float seconds;
  uniform float gouache,daylight,twilight,dawn,starTime,meteorAge;
  uniform vec2 meteorStart;
  float hashStar(vec2 p){
    vec3 q=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));
    q+=dot(q,q.yzx+33.33);
    return fract((q.x+q.y)*q.z);
  }
  vec3 stars(vec2 sky,float density,float strength){
    vec2 grid=sky*density, cell=floor(grid);
    float seed=hashStar(cell);
    vec2 center=.2+.6*vec2(hashStar(cell+9.),hashStar(cell-17.));
    float d=length(fract(grid)-center);
    float pixel=clamp(length(fwidth(grid))*.42,.016,.3);
    float radius=mix(.022,.108,pow(seed,7.));
    float sparkle=.83+.17*sin(starTime*(.35+seed*.85)+82.*seed);
    float point=(1.-smoothstep(max(0.,radius-pixel),radius+pixel,d))*min(1.,radius*radius/(pixel*pixel));
    vec2 offset=abs(fract(grid)-center);
    float rays=exp(-min(offset.x,offset.y)/max(.015,pixel*.45)-max(offset.x,offset.y)*11.);
    point+=smoothstep(.965,1.,seed)*rays*.62;
    return mix(vec3(.59,.69,1.),vec3(1.,.84,.70),seed)*point*sparkle*strength*(.35+3.3*pow(seed,5.));
  }
  float sampleCloud(vec2 p) {
    float curl = texture2D(weather, p * .48 + .31).r;
    return texture2D(weather, p + vec2(curl*.16, curl*.11)).r * .83 +
      texture2D(weather, p * vec2(2.7,3.8) + .13).r * .17;
  }
  void main() {
    vec3 dir = normalize(sightline);
    float altitude = max(0.,dir.y);
    float facing = max(0.,dot(normalize(dir.xz + vec2(.00001)),normalize(sunDirection.xz)));
    float halo = max(0.,dot(dir,sunDirection));
    vec3 horizon=mix(vec3(.34,.47,.65),vec3(1.25,.64,.33),pow(facing,2.4));
    vec3 sky=mix(horizon,vec3(.055,.24,.49),1.-exp(-altitude*7.2));
    sky+=vec3(.63,.26,.07)*pow(halo,53.);
    vec2 wind=seconds*vec2(.00031,.00012);
    vec2 high=(cameraPosition.xz+dir.xz*940./max(.06,altitude+.08))*vec2(.000045,.00014)+wind*.5;
    float veil=sampleCloud(high+vec2(.23,.75));
    float filament=texture2D(weather,high*vec2(1.3,6.4)+veil*.24).r;
    sky=mix(sky,mix(vec3(.66,.78,.91),vec3(1.48,.92,.68),facing),
      smoothstep(.42,.70,veil*.78+.22*filament)*.53*smoothstep(.01,.12,altitude));
    sky+=vec3(6.8,4.4,2.3)*smoothstep(.99989,.99997,halo);
    vec2 horizonDir=normalize(dir.xz+cameraPosition.xz*.000008+vec2(.000001));
    float azimuth=atan(horizonDir.x,-horizonDir.y);
    float sectors=azimuth*1.27324+.10;
    float lobe=fract(sectors+.5)-.5;
    float mass=sqrt(max(0.,1.-lobe*lobe/(.45*.45)));
    vec2 bankUv=horizonDir*.92+vec2(.7*altitude,altitude*1.9)+wind;
    float billow=sampleCloud(bankUv*2.);
    float bristle=texture2D(weather,bankUv*vec2(6.,9.)+billow*.25).r;
    float top=.018+mass*(.074+.071*billow)+.077*(billow-.48)+.021*(bristle-.50);
    float cloudEdge=top-altitude;
    float bankCover=smoothstep(-.001,.006,cloudEdge)*smoothstep(.016,.052,altitude)*smoothstep(.04,.30,mass);
    float silver=exp(-52.*abs(cloudEdge));
    float facet=clamp(.20+.46*silver+(sampleCloud(bankUv*2.-sunDirection.xz*.044)-billow)*3.3+.35*billow,0.,1.);
    vec3 bankPigment=mix(vec3(.30,.29,.43),mix(vec3(.91,.96,1.12),vec3(1.59,.88,.48),facing),facet);
    vec3 duskTint=mix(vec3(.98,.48,.61),vec3(.88,.74,1.02),dawn);
    sky*=mix(vec3(1.),duskTint,twilight);
    if(daylight<.9999){
      vec2 dome=dir.xz/(1.+max(dir.y,0.));
      float dust=texture2D(weather,dome*2.2+vec2(.2,.7)).r;
      float band=exp(-9.*abs(dot(dir,normalize(vec3(.37,.77,.51)))+.13));
      vec3 velvet=mix(vec3(.063,.049,.107),vec3(.007,.009,.032),smoothstep(.0,.45,altitude));
      velvet+=band*(.24+dust*dust*2.)*vec3(.036,.023,.068);
      vec3 points=stars(dome,135.,.95)+stars(dome+4.3,51.,2.7);
      if(meteorAge>=0.){
        vec2 travel=normalize(vec2(-meteorStart.y,meteorStart.x))*.022+meteorStart*.17;
        vec2 head=meteorStart+travel*meteorAge;
        vec2 offset=dome-head;
        float along=clamp(-dot(offset,travel)/dot(travel,travel),0.,.25);
        float width=max(.00038,length(fwidth(dome))*.46);
        points+=vec3(1.8,2.1,2.7)*exp(-length(offset+along*travel)/width)*(1.-along*4.)
          *smoothstep(0.,.09,meteorAge)*(1.-smoothstep(.64,1.1,meteorAge));
      }
      velvet+=points*smoothstep(.002,.052,altitude)*(1.-smoothstep(.44,.78,veil)*.69);
      sky=mix(velvet,sky,daylight);
    }
    bankPigment*=mix(vec3(.085,.080,.14),mix(vec3(1.),duskTint,twilight),daylight);
    sky=mix(sky,bankPigment,bankCover*.94);
    float transmission=1.;
    vec3 clouds=vec3(0.);
    for(int layer=0;layer<9;layer++){
      float level=(float(layer)+.5)/9.;
      float h=210.+level*154.-cameraPosition.y;
      float distanceToLayer=2.*h/(max(0.,dir.y)+sqrt(dir.y*dir.y+max(1.,h)*.000035));
      vec2 q=(cameraPosition.xz+dir.xz*distanceToLayer)*vec2(.000091,.000135)+wind+vec2(.61,.27);
      float weatherMap=sampleCloud(q);
      float detail=texture2D(weather,q*2.83+vec2(level*.07,weatherMap*.19)).r;
      float wisps=texture2D(weather,q*vec2(6.4,11.2)+detail*.21).r;
      float height=(weatherMap-.39)*3.6+(detail-.48)*.47+(wisps-.5)*.085;
      float coverage=smoothstep(-.025,.10,height-level)*smoothstep(.0,.18,level+.10*detail);
      float rim=1.-smoothstep(.0,.30,height-level);
      float facingLight=texture2D(weather,q+sunDirection.xz*.031).r;
      float lit=clamp(.14+.54*level+.58*rim+(weatherMap-facingLight)*2.3,0.,1.);
      lit=mix(lit,floor(lit*9.)/9.,gouache*.24);
      vec3 shade=mix(vec3(.27,.35,.50),vec3(.50,.31,.38),facing*.68);
      vec3 light=mix(vec3(.94,1.03,1.17),vec3(1.65,1.02,.56),facing*facing);
      vec3 pigment=mix(shade,light,lit)+vec3(.8,.42,.12)*rim*pow(halo,22.);
      float opacity=coverage*.24*smoothstep(.002,.045,altitude);
      clouds+=transmission*opacity*pigment;
      transmission*=1.-opacity;
    }
    sky=sky*transmission+clouds*mix(vec3(.031,.030,.064),mix(vec3(1.),duskTint,twilight),daylight);
    float valleyMist=pow(abs(dir.z),18.)*(1.-smoothstep(.002,.065,abs(dir.y)));
    sky=mix(sky,mix(vec3(.026,.032,.058),vec3(.15,.24,.25),daylight),valleyMist*.94);
    gl_FragColor = vec4(sky,1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const chains = [
  {z:-450, spread:98, height:48, seed:5, gaps:false},
  {z:-750, spread:124, height:86, seed:13, gaps:false},
  {z:645, spread:116, height:49, seed:27, gaps:true}
];

function headlands(sector: number) {
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const rock = new T.Color();
  for (const chain of chains) {
    const offset = positions.length / 3, columns = 80, rows = 20;
    for (let i=0; i<=columns; i++) {
      const x = sector*sectorWidth + sectorWidth*i/columns;
      const {seed} = chain;
      const bend = relief.noise(x*.0032,seed,2);
      const center = chain.z + bend*94;
      const opening = chain.gaps ? T.MathUtils.smoothstep(relief.noise(x*.005,seed,6),-.26,.18) : 1;
      for (let j=0; j<=rows; j++) {
        const v = j/rows*2-1, z = center + v*chain.spread;
        const spine = v + .19*relief.noise(x*.011,seed,3);
        const shoulders = Math.pow(Math.max(0,1-Math.abs(spine)),1.18) * (1 - T.MathUtils.smoothstep(Math.abs(v),.81,1));
        const mass = .76 + .69*relief.noise(x*.007,z*.006,seed) + .38*relief.noise(x*.018,z*.021,seed);
        const crags = relief.noise(x*.041,z*.033,seed+4);
        const valley = Math.abs(relief.noise(x*.009 + v*.95,seed,z*.007));
        const gully = Math.exp(-valley*14) * .21 * Math.sin(Math.PI*Math.abs(v));
        const corridor=chain.z<0?T.MathUtils.smoothstep(Math.abs(x-76),220,460):1;
        const y = -3 + corridor*shoulders*opening*chain.height*(mass+.17*crags-gully);
        positions.push(x,y,z);
        const tint = T.MathUtils.clamp(.46 + .28*bend + .26*crags + y*.0018,0,1);
        const forest = T.MathUtils.smoothstep(crags + .32*bend - y*.004, -.28, .26);
        rock.setRGB(.13+.16*tint-.15*forest, .13+.092*tint-.057*forest, .15+.094*tint-.050*forest);
        colors.push(rock.r,rock.g,rock.b);
        if (i<columns && j<rows) {
          const a=offset+i*(rows+1)+j,b=a+rows+1;
          indices.push(a,a+1,b,b,a+1,b+1);
        }
      }
    }
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export type ValleyLighting = { direction:T.Vector3; direct:T.Color; sky:T.Color; ground:T.Color };

export function createBayWorld(scene: T.Scene, throughCorridor=false) {
  const noise = cloudNoise();
  const sunDirection = new T.Vector3();
  const daylight={value:1},twilight={value:0},meteorAge={value:-1},meteorStart=new T.Vector2();
  const skyMaterial = new T.ShaderMaterial({
    uniforms: {
      weather: { value: noise },daylight,twilight,dawn:{value:0},meteorAge,meteorStart:{value:meteorStart},starTime:{value:0},
      sunDirection: { value: sunDirection },
      seconds: { value: 0 },
      gouache: { value: 1 }
    },
    vertexShader: horizonVertex,
    fragmentShader: skyFragment,
    side: T.BackSide,
    depthWrite: false,
    depthTest: true
  });
  const sky = new T.Mesh(new T.BoxGeometry(2,2,2),skyMaterial);
  sky.frustumCulled=false;
  sky.renderOrder=10;
  const range = new T.Group();
  const mountain = new T.MeshLambertMaterial({vertexColors:true,fog:false});
  mountain.onBeforeCompile = shader => {
    shader.uniforms.sunDirection = {value: sunDirection};
    shader.uniforms.daylight=daylight;
    shader.uniforms.bayPigment = {value: noise};
    shader.vertexShader = 'varying float bayDistance; varying vec3 bayPosition;\n'+shader.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\n bayDistance = length(mvPosition.xyz); bayPosition = position;');
    shader.fragmentShader = 'varying float bayDistance; varying vec3 bayPosition; uniform sampler2D bayPigment; uniform float daylight; uniform vec3 sunDirection;\n'+shader.fragmentShader.replace('#include <opaque_fragment>', `
      vec2 slope = vec2(bayPosition.x*.007 + bayPosition.z*.004, bayPosition.z*.004 - bayPosition.y*.008);
      float pigment = texture2D(bayPigment,slope).r;
      float face = dot(normalize(cross(dFdx(bayPosition),dFdy(bayPosition))),sunDirection);
      outgoingLight *= .91 + .31*smoothstep(.21,.68,pigment) + .32*face;
      outgoingLight += vec3(.019,.013,.008)*smoothstep(.46,.76,pigment)*max(0.,face);
      outgoingLight = mix(outgoingLight,mix(vec3(.028,.032,.063),vec3(.40,.404,.49),daylight),smoothstep(230.,1320.,bayDistance)*.81);
      #include <opaque_fragment>`);
  };
  const tiles = new Map<number,T.Mesh<T.BufferGeometry,T.MeshLambertMaterial>>();
  let centerSector: number | undefined;
  const sun = new T.DirectionalLight('#ffddac',1.98);
  const ambient = new T.HemisphereLight('#cbdaf5','#a88b83',.84);
  const lighting:ValleyLighting={direction:sunDirection,direct:new T.Color(),
    sky:ambient.color.clone().multiplyScalar(ambient.intensity),
    ground:ambient.groundColor.clone().multiplyScalar(ambient.intensity)};
  sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);
  sun.shadow.normalBias=.052;
  sun.shadow.bias=-.00028;
  Object.assign(sun.shadow.camera,{left:-82,right:82,top:73,bottom:-73,near:1,far:270});
  scene.add(sky,range,sun,sun.target,ambient);
  const daySun=sun.color.clone(),nightSun=new T.Color('#9fb6ff'),duskSun=new T.Color('#ffa884');
  const daySky=ambient.color.clone(),nightSky=new T.Color('#94a0cd'),duskSky=new T.Color('#eebed1');
  const dayGround=ambient.groundColor.clone(),nightGround=new T.Color('#666280');
  function setTime(seconds: number, focusX: number, cameraX: number, focusZ=0,light:CityLight=lightAt(12),starSeconds=seconds,focusY=4) {
    const sector = Math.floor(cameraX/sectorWidth);
    if (centerSector!==sector) {
      for (let i=sector-3;i<=sector+3;i++) {
        if (tiles.has(i)) continue;
        const tile = new T.Mesh(headlands(i),mountain);
        tiles.set(i,tile);
        range.add(tile);
      }
      for (const [i, tile] of tiles) {
        if (Math.abs(sector - i) <= 3) continue;
        range.remove(tile);
        tile.geometry.dispose();
        tiles.delete(i);
      }
      centerSector=sector;
    }
    const bearing=(throughCorridor?-.026:Math.PI+.072)+light.bearingOffset*(throughCorridor?.28:.90);
    const elevation = T.MathUtils.lerp(.63,.12+(throughCorridor?.40:.71)*light.solarHeight,light.daylight);
    sunDirection.set(Math.sin(bearing),elevation,-Math.cos(bearing)).normalize();
    skyMaterial.uniforms.seconds!.value=seconds*cloudDriftRate;
    sun.target.position.set(focusX,focusY,focusZ);
    sun.position.copy(sun.target.position).addScaledVector(sunDirection,112);
    daylight.value=light.daylight;
    twilight.value=light.twilight;
    skyMaterial.uniforms.dawn!.value=Number(light.phase==='dawn');
    skyMaterial.uniforms.starTime!.value=starSeconds;
    sun.color.copy(nightSun).lerp(daySun,light.daylight).lerp(duskSun,light.twilight*.80);
    ambient.color.copy(nightSky).lerp(daySky,light.daylight).lerp(duskSky,light.twilight*.55);
    ambient.groundColor.copy(nightGround).lerp(dayGround,light.daylight);
    sun.intensity=T.MathUtils.lerp(.40,2.38+elevation*.52,light.daylight);
    ambient.intensity=T.MathUtils.lerp(.52,.84,light.daylight);
    lighting.sky.copy(ambient.color).multiplyScalar(ambient.intensity);
    lighting.ground.copy(ambient.groundColor).multiplyScalar(ambient.intensity);
    lighting.direct.copy(sun.color).multiplyScalar(sun.intensity);
  }
  return {
    sun, sunDirection, lighting, daylight,meteorAge,meteorStart,
    setTime,
    setPainted(enabled: boolean) {
      skyMaterial.uniforms.gouache!.value = Number(enabled);
    },
    dispose() {
      scene.remove(sky, range, sun, sun.target, ambient);
      for (const tile of tiles.values()) tile.geometry.dispose();
      tiles.clear();
      mountain.dispose();
      sky.geometry.dispose();
      skyMaterial.dispose();
      noise.dispose();
      sun.shadow.dispose();
    }
  };
}
