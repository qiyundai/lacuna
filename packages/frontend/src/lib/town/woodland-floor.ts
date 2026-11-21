import * as T from 'three';
import { forestTrees, groveCell } from './corridor-vegetation.js';
import { inValley } from './valley-river.js';
import type { WoodlandTree } from './woodland-boughs.js';

export function woodlandFloor(ground:(x:number,z:number)=>number,cover:(x:number,z:number,y:number)=>number,west:number,east:number){
  const band=32,bands=42,rows=band*bands;
  const left=Math.floor(west/groveCell)-2,width=Math.ceil(east/groveCell)-left+2;
  const pixels=new Uint8Array(width*rows);
  const texture=new T.DataTexture(pixels,width,rows,T.RedFormat);
  texture.minFilter=texture.magFilter=T.LinearFilter;texture.wrapT=T.RepeatWrapping;
  const layout=new T.Vector4(left*groveCell,width*groveCell,rows*groveCell,0);
  const loaded=new Map<number,number>(),gardens=new Set<{x:number;z:number;size:number}[]>();
  let lastBand=Infinity;
  function clear(){loaded.clear();lastBand=Infinity;}
  function invalidateGarden(crowns:{z:number;size:number}[]){
    for(const crown of crowns){
      const first=Math.floor((crown.z-crown.size)/(band*groveCell));
      const last=Math.floor((crown.z+crown.size)/(band*groveCell));
      for(let section=first;section<=last;section++){
        const slot=T.MathUtils.euclideanModulo(section,bands);
        if(loaded.get(slot)===section)loaded.delete(slot);
      }
    }
    lastBand=Infinity;
  }
  function addGarden(group:T.Group,trees:WoodlandTree[]){
    if(!trees.length)return;
    const crowns=trees.map(t=>{
      const p=inValley(new T.Vector3(t.x,t.y,t.z));
      return {x:p.x,z:p.z,size:t.size};
    });
    gardens.add(crowns);invalidateGarden(crowns);
    group.addEventListener('removed',()=>{gardens.delete(crowns);invalidateGarden(crowns);});
  }
  function fill(section:number,slot:number){
    const first=section*band,offset=slot*band*width;
    pixels.fill(0,offset,offset+width*band);
    function shade(t:{x:number;z:number;size:number}){
      const cx=t.x/groveCell-left-.5,cz=t.z/groveCell-first-.5,r=.62*t.size/groveCell+.42;
      for(let z=Math.max(0,Math.ceil(cz-r));z<=Math.min(band-1,cz+r);z++){
        for(let x=Math.max(0,Math.ceil(cx-r));x<=Math.min(width-1,cx+r);x++){
          const d=((x-cx)**2+(z-cz)**2)/(r*r);
          if(d>=1)continue;
          const k=offset+z*width+x;
          pixels[k]+=Math.round((255-pixels[k]!)*.88*(1-d)*(1-d));
        }
      }
    }
    for(let i=Math.floor(left/band);i<=Math.floor((left+width)/band);i++){
      for(const tree of forestTrees(i,section,band,ground,cover,west,east,3)){
        if(Math.floor(tree.ix/band)===i)shade(tree);
      }
    }
    for(const garden of gardens)for(const tree of garden){
      if(tree.z+tree.size>=first*groveCell && tree.z-tree.size<=(first+band)*groveCell)shade(tree);
    }
  }
  function view(z:number){
    const center=Math.floor(z/(band*groveCell));
    if(center===lastBand)return;
    lastBand=center;
    const start=center-bands/2;
    layout.w=(start+bands*.5)*band*groveCell;
    for(let j=start;j<start+bands;j++){
      const slot=T.MathUtils.euclideanModulo(j,bands);
      if(loaded.get(slot)===j)continue;
      fill(j,slot);loaded.set(slot,j);
    }
    texture.needsUpdate=true;
  }
  return {texture,layout,clear,addGarden,view,dispose(){gardens.clear();texture.dispose();}};
}
