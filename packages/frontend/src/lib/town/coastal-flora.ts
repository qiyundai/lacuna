import * as T from 'three';
import { stirCanopy, treeFlex } from './coastal-breeze.js';
import { leafBrushCoordinates, leafBrushPigment, type Gouache } from './gouache.js';
import forms from './moss-trees.json';

const crowns=[0x61845c,0x597e59,0x486b55].map(hex=>new T.Color(hex));
const bark=new T.Color(0x514a38);

export function coastalTreeGeometry(species:number,level:number){
  const form:{vertices:number[];faces:number[];uv?:number[]}=forms[species]![level]!;
  const {vertices,faces}=form;
  const positions=Float32Array.from(vertices,component=>component/2048);
  const colors=new Float32Array(positions.length);
  const leafMask=new Uint8Array(positions.length/3);
  const indices:number[]=[];
  for(let i=0;i<faces.length;i+=4){
    const pigment=faces[i+3]!;
    const tint=pigment ? crowns[species]! : bark;
    for(let corner=0;corner<3;corner++){
      const index=faces[i+corner]!;
      leafMask[index]=Number(pigment!==0);
      indices.push(index);
      const offset=index*3;
      const x=positions[offset]!,y=positions[offset+1]!,z=positions[offset+2]!;
      const tone=pigment ? (pigment/128)*(.75+.36*y+.09*x-.06*z) : .86+.14*y;
      colors[offset]=tint.r*tone;
      colors[offset+1]=tint.g*tone;
      colors[offset+2]=tint.b*tone;
    }
  }
  const geometry=new T.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute('position',new T.BufferAttribute(positions,3));
  geometry.setAttribute('color',new T.BufferAttribute(colors,3));
  geometry.setAttribute('leafMask',new T.BufferAttribute(leafMask,1));
  if(form.uv)geometry.setAttribute('sprayUv',new T.Float32BufferAttribute(form.uv.map(n=>n/2048),2));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.boundingSphere!.radius+=1.25*treeFlex;
  return geometry;
}

export function coastalTrees(clock:T.IUniform<number>,paint?:Gouache){
  const material=new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide});
  stirCanopy(material,clock,treeFlex);
  if(paint){
    const wind=material.onBeforeCompile.bind(material);
    material.onBeforeCompile=(shader,renderer)=>{
      wind(shader,renderer);
      shader.uniforms.gouacheMap={value:paint.strokes};
      shader.uniforms.gouacheCoverage=paint.coverage;
      shader.vertexShader='attribute float leafMask; varying vec3 leafBrush;\n'+leafBrushCoordinates+'\n'+shader.vertexShader
        .replace('#include <project_vertex>','leafBrush=leafBrushCoordinates(rest,leafMask);\n#include <project_vertex>');
      shader.fragmentShader='varying vec3 leafBrush;\n'+leafBrushPigment+'\n'+shader.fragmentShader
        .replace('#include <color_fragment>','#include <color_fragment>\n diffuseColor.rgb*=leafBrushPigment(leafBrush);');
    };
  }
  const shapes=forms.map((_,species)=>coastalTreeGeometry(species,0));
  const trees=shapes.map(shape=>{
    const model=new T.Group();model.add(new T.Mesh(shape,material));return model;
  });
  return {trees,dispose(){for(const shape of shapes)shape.dispose();material.dispose();}};
}
