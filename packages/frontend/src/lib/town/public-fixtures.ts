import * as T from 'three';
import type { CityLight } from './city-clock.js';

type PublicPlace='market'|'wharf';

export function publicFixtures(){
  const strength={market:{value:0},wharf:{value:0}};
  const skins=new Map<string,T.MeshStandardMaterial>();
  function dress(model:T.Group,kind:PublicPlace,bulb:T.MeshStandardMaterial){
    model.updateMatrixWorld(true);
    const lamps:T.Vector3[]=[];
    model.traverse(node=>{if(node.name==='Interior pendant')lamps.push(node.getWorldPosition(new T.Vector3()));});
    if(!lamps.length)return;
    model.traverse(node=>{
      if(!(node instanceof T.Mesh)||!(node.material instanceof T.MeshStandardMaterial)||node.geometry.userData.glassFinish||!node.geometry.hasAttribute('color'))return;
      const original=node.material;
      if(!node.geometry.boundingSphere)node.geometry.computeBoundingSphere();
      const center=node.geometry.boundingSphere!.center;
      const nearby=lamps.map(p=>node.worldToLocal(p.clone())).sort((a,b)=>a.distanceToSquared(center)-b.distanceToSquared(center)).slice(0,3);
      const key=[kind,original.uuid,...nearby.flatMap(p=>p.toArray().map(n=>Math.round(n*100)))].join('/');
      let skin=skins.get(key);
      if(!skin){
        skin=original.clone();
        const isBulb=original===bulb;
        skin.customProgramCacheKey=()=>original.customProgramCacheKey()+'/pendant/'+Number(isBulb);
        skin.onBeforeCompile=(shader,renderer)=>{
          original.onBeforeCompile(shader,renderer);
          shader.uniforms.fixturePower=strength[kind];
          shader.uniforms.pendants={value:Array.from({length:3},(_,i)=>nearby[i]??new T.Vector3(0,-1000,0))};
          shader.vertexShader='varying vec3 interiorPoint,interiorNormal;\n'+shader.vertexShader.replace('#include <begin_vertex>',`
            #include <begin_vertex>
            interiorPoint=position;interiorNormal=normal;
          `);
          shader.fragmentShader='uniform vec3 pendants[3];uniform float fixturePower;varying vec3 interiorPoint,interiorNormal;\n'+
            shader.fragmentShader.replace('#include <opaque_fragment>',`
              float pool=0.;
              for(int i=0;i<3;i++){
                vec3 ray=pendants[i]-interiorPoint;
                float r=length(ray);
                float facing=max(0.,dot(normalize(interiorNormal),ray/max(.001,r)));
                pool+=(.10+.90*facing)*(1.-smoothstep(.2,3.65,r))/(.45+r*r*.50);
              }
              outgoingLight+=fixturePower*vec3(1.,.57,.25)*${isBulb?'1.8':'diffuseColor.rgb*min(1.8,pool)*2.4'};
              #include <opaque_fragment>
            `);
        };
        if(isBulb)skin.emissiveIntensity=0;
        skins.set(key,skin);
      }
      node.material=skin;
    });
  }
  return {dress,apply(light:CityLight){
    const hour=light.roomPhase*24;
    const trading=T.MathUtils.smoothstep(hour,5,7)*(1-T.MathUtils.smoothstep(hour,20,23));
    strength.market.value=(1-light.daylight)*trading;
    strength.wharf.value=(1-light.daylight)*(.52+.48*trading);
  },dispose(){for(const skin of skins.values())skin.dispose();skins.clear();}};
}
