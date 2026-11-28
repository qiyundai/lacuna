import * as T from 'three';
import type { ValleyWeather } from './valley-weather.js';
import { waterNoise, waterReflection } from './water-optics.js';

export type ArchiveWaterOptics={
  slopes:T.Texture;
  sunDirection:T.Vector3;
  hdr:boolean;
};

type FlowUniforms={
  time:T.IUniform<number>;
  day:T.IUniform<number>;
  runoff:T.IUniform<number>;
  overcast:T.IUniform<number>;
};

function catchBasin(radius:number,optics:ArchiveWaterOptics,uniforms:FlowUniforms){
  const geometry=new T.CircleGeometry(radius,80);
  const {surface,material}=waterReflection(geometry,uniforms.time,optics.hdr,
    {textureWidth:576,textureHeight:360,clipBias:.002,multisample:0},112,.23);
  Object.assign(material.uniforms,uniforms,{slopes:{value:optics.slopes},sunDirection:{value:optics.sunDirection}});
  material.vertexShader='varying vec3 waterPoint;varying vec2 basinPoint,basinCenter;\n'+material.vertexShader.replace('vUv =',`
    waterPoint=(modelMatrix*vec4(position,1.)).xyz;
    basinPoint=position.xy;basinCenter=(modelMatrix*vec4(0.,0.,0.,1.)).xz;
    vUv =`);
  material.fragmentShader=`
    varying vec4 vUv;
    varying vec3 waterPoint;
    varying vec2 basinPoint,basinCenter;
    uniform sampler2D tDiffuse,slopes;
    uniform vec3 sunDirection;
    uniform float time,day,runoff,overcast,reflectionEnabled;
    ${waterNoise}

    void main(){
      vec2 p=waterPoint.xz;
      vec3 eye=normalize(cameraPosition-waterPoint);
      float radius=length(basinPoint);
      float edge=radius/${radius.toFixed(3)};
      float grain=flowNoise(p*1.2+vec2(0.,-time*.64));
      float poolDepth=1.-smoothstep(.58,1.,edge);
      float footprint=max(length(dFdx(p)),length(dFdy(p)));
      vec2 slope=.08*(texture2D(slopes,p*.31+time*vec2(.038,-.055)).rg-.5);
      slope+=.038*(texture2D(slopes,p.yx*.60+time*vec2(-.092,.048)).rg-.5);
      vec2 impact=basinPoint+vec2(.11,-.09);
      float reach=length(impact);
      float wave=reach*16.1-time*7.1+1.06*grain+.37*sin(reach*5.7-time*2.3);
      float chop=sin(wave)+.27*sin(wave*1.87+grain*3.7);
      vec2 outward=normalize(p-basinCenter+vec2(.0001));
      float resolved=1.-smoothstep(.075,.24,footprint);
      slope+=outward*chop*runoff*.095*exp(-reach*.48)*resolved;
      vec3 normal=normalize(vec3(slope.x,1.,slope.y));
      vec2 uv=vUv.xy/vUv.w;
      vec3 bend=mat3(viewMatrix)*(reflect(-eye,normal)-reflect(-eye,vec3(0.,1.,0.)));
      vec2 distorted=clamp(uv+bend.xy*.079,.001,.999);
      vec3 reflected=reflectionEnabled>.5?texture2D(tDiffuse,distorted).rgb:
        mix(vec3(.018,.027,.041),vec3(.23,.31,.33),day);
      vec3 bottom=mix(vec3(.14,.20,.16),vec3(.018,.064,.067),poolDepth);
      float flicker=texture2D(slopes,basinPoint*1.14+time*vec2(-.12,.19)).g;
      bottom*=mix(vec3(.23,.34,.48),vec3(.78,.94,.93),day);
      bottom+=vec3(.15,.20,.16)*pow(flicker,4.)*(1.-poolDepth)*day*.42;
      float fresnel=waterFresnel(eye,normal);
      vec3 color=mix(bottom,reflected,.32+.63*fresnel);
      float turbulent=flowNoise(p*5.6+vec2(time*1.97,-time*2.71));
      float bubbles=(1.-smoothstep(.13,1.01+runoff*.56,reach))*smoothstep(.31,.84,.63*turbulent+.37*grain)*runoff;
      float rimWash=exp(-reach*1.05)*pow(.5+.5*cos(wave*.78),8.)*runoff*resolved*.15;
      vec3 foam=mix(vec3(.23,.33,.41),vec3(.66,.74,.71),day);
      color=mix(color,foam,clamp(bubbles*.77+rimWash,0.,.78));
      color+=day*(1.-overcast)*waterGlint(normal,normalize(sunDirection+eye),.19)*vec3(.22,.26,.27);
      gl_FragColor=vec4(color,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`;
  surface.name='Rain pool';surface.renderOrder=2;
  return surface;
}

function waterVeil(drop:number,optics:ArchiveWaterOptics,uniforms:FlowUniforms){
  const geometry=new T.CylinderGeometry(1,1,drop,48,36,true);
  const material=new T.ShaderMaterial({
    uniforms:{...uniforms,slopes:{value:optics.slopes},sunDirection:{value:optics.sunDirection}},
    side:T.FrontSide,transparent:true,depthWrite:false,
    vertexShader:`
      uniform float time,runoff;
      varying vec2 currentUv;
      varying vec3 flowPoint;
      void main(){
        float h=1.-uv.y;
        float angle=6.2831853*uv.x;
        float pace=sqrt(.034+h)*14.5-time*7.8;
        float twist=angle+.08*sin(pace*.53)+.16*h;
        vec2 radial=vec2(sin(twist),cos(twist));
        float throatShape=.85-.35*smoothstep(0.,.72,h)+.29*pow(h,8.);
        float folds=.062*cos(angle*7.+sin(pace))+.039*sin(angle*13.-pace*.81);
        vec3 shape=position;
        shape.xz=radial*(throatShape+folds*mix(.4,1.,runoff));
        shape.xz+=h*.10*vec2(sin(pace*.36),cos(pace*.29));
        flowPoint=(modelMatrix*vec4(shape,1.)).xyz;
        currentUv=uv;
        gl_Position=projectionMatrix*viewMatrix*vec4(flowPoint,1.);
      }`,
    fragmentShader:`
      uniform float time,day,runoff,overcast;
      uniform sampler2D slopes;
      uniform vec3 sunDirection;
      varying vec2 currentUv;
      varying vec3 flowPoint;
      ${waterNoise}

      void main(){
        float fall=1.-currentUv.y;
        float velocity=sqrt(.034+fall);
        float phase=velocity-time*.53;
        vec2 track=vec2(currentUv.x*3.0,currentUv.y*.43);
        vec2 film=texture2D(slopes,track+vec2(.09*sin(phase*5.),phase*.41)).rg-.5;
        vec2 filaments=texture2D(slopes,vec2(currentUv.x*4.0+film.y*.18,phase*.19)).rg-.5;
        vec3 face=normalize(cross(dFdx(flowPoint),dFdy(flowPoint)));
        vec3 tangent=normalize(cross(vec3(0.,1.,0.),face)+vec3(.0001,0.,0.));
        vec3 normal=normalize(face+tangent*(film.x*.56+filaments.x*.46)+vec3(0.,film.y*.27,0.));
        vec3 eye=normalize(cameraPosition-flowPoint);
        float fresnel=waterFresnel(eye,normal);
        float highlight=waterGlint(normal,normalize(eye+sunDirection),.25)*(1.-.65*overcast);
        float threads=smoothstep(.045,.34,film.x*.46+filaments.x*.62);
        float scatter=smoothstep(.64,1.,fall)*(.34+.62*threads);
        vec3 velvet=mix(vec3(.15,.20,.24),vec3(.34,.44,.46),day);
        vec3 silver=mix(vec3(.33,.37,.38),vec3(.74,.81,.79),day);
        float gleam=.26*threads+.7*fresnel+.41*scatter;
        vec3 color=mix(velvet,silver,clamp(gleam,0.,1.))+vec3(.41,.48,.46)*highlight*day;
        float opacity=(.09+.30*threads+.44*fresnel+.23*scatter)*smoothstep(.006,.53,runoff);
        gl_FragColor=vec4(color,opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const mesh=new T.Mesh(geometry,material);
  mesh.renderOrder=3;mesh.name='Oculus waterfall';
  return mesh;
}

function impactMist(uniforms:FlowUniforms){
  const seeds:number[]=[];
  for(let i=0;i<152;i++)seeds.push(i/152,(i*.618034)%1,(i*.75487767)%1);
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(seeds,3));
  const material=new T.ShaderMaterial({
    uniforms,transparent:true,depthWrite:false,
    vertexShader:`
      uniform float time,runoff;
      varying float opacity, softness;
      void main(){
        float a=position.x*6.2831853;
        float age=fract(position.z+time*(1.15+position.y*1.9));
        float speed=(.75+position.y*1.9)*sqrt(runoff);
        float radius=.09+speed*age;
        float rise=age*(.6+2.8*position.y)-3.*age*age;
        softness=step(.71,position.z);
        vec3 p=vec3(radius*cos(a),max(.025,rise)*sqrt(runoff),radius*sin(a));
        vec4 view=modelViewMatrix*vec4(p,1.);
        gl_Position=projectionMatrix*view;
        gl_PointSize=clamp((.9+position.y*1.5+softness*4.)*33./max(8.,-view.z),.8,10.);
        opacity=(1.-smoothstep(.25,1.,age))*smoothstep(0.,.08,age)*runoff*mix(.62,.21,softness);
      }`,
    fragmentShader:`
      uniform float day;
      varying float opacity, softness;
      void main(){
        float d=length(gl_PointCoord-.5)*2.;
        float edge=1.-smoothstep(.14+.24*softness,1.,d);
        vec3 ink=mix(vec3(.32,.40,.47),vec3(.71,.77,.76),day);
        gl_FragColor=vec4(ink,opacity*edge*edge);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const points=new T.Points(geometry,material);
  points.name='Cascade spray';points.renderOrder=4;points.frustumCulled=false;
  return points;
}

export function archiveWater(radius:number,waterline:number,outlet:number,optics:ArchiveWaterOptics){
  const time={value:0},day={value:1},runoff={value:0},overcast={value:0};
  const uniforms={time,day,runoff,overcast};
  const pool=catchBasin(radius,optics,uniforms);
  const fall=waterVeil(outlet-waterline,optics,uniforms);
  const spray=impactMist(uniforms);
  pool.position.y=waterline;
  fall.position.y=(outlet+waterline)/2;
  spray.position.y=waterline+.014;
  const group=new T.Group();group.add(pool,fall,spray);
  fall.visible=false;spray.visible=false;
  return {
    group,
    tick(seconds:number,daylight:number,weather:ValleyWeather){
      time.value=seconds;day.value=daylight;
      runoff.value=weather.runoff;overcast.value=weather.overcast;
      fall.visible=weather.runoff>.006;spray.visible=weather.runoff>.09;
      const width=.16+.84*Math.sqrt(weather.runoff);
      fall.scale.set(width,1,width);
    },
    dispose(){
      pool.dispose();pool.geometry.dispose();
      fall.geometry.dispose();fall.material.dispose();
      spray.geometry.dispose();spray.material.dispose();
    }
  };
}
