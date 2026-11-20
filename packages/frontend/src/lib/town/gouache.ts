import * as T from 'three';

export async function loadGouache() {
  try {
    const loader = new T.TextureLoader();
    const strokes = await loader.loadAsync('/city/materials/gouache.webp');
    const relief = await loader.loadAsync('/city/materials/coast-relief.webp').catch(() => undefined);
    strokes.wrapS = strokes.wrapT = T.RepeatWrapping;
    strokes.anisotropy = 4;
    if (relief) {
      relief.wrapS = relief.wrapT = T.RepeatWrapping;
      relief.anisotropy = 4;
    }
    return {strokes, relief, coverage: {value: 1}, dispose() {strokes.dispose(); relief?.dispose();}};
  } catch {
    return undefined;
  }
}

export type Gouache = NonNullable<Awaited<ReturnType<typeof loadGouache>>>;

export const brushSampler = `
      uniform sampler2D gouacheMap;
      uniform float gouacheCoverage;
      vec3 brushSample(vec2 uv) {
        vec2 edge = smoothstep(vec2(.43), vec2(.495), abs(fract(uv) - .5));
        return mix(texture2D(gouacheMap, uv).rgb, texture2D(gouacheMap, uv + vec2(.37,.29)).rgb, max(edge.x, edge.y));
      }
`;

type PaintSurface = 'architecture' | 'roof' | 'facade' | 'canopy' | 'terrain' | 'rock';

const surfaceScale: Record<PaintSurface, string> = {
  architecture: 'vec3(mix(.29,.185,copper))',
  roof: 'vec3(.18,.30,.24)',
  facade: 'vec3(.22,.26,.19)',
  canopy: 'vec3(.65,.80,.64)',
  terrain: 'vec3(.065,.122,.081)',
  rock: 'vec3(.10,.25,.14)'
};

const rockPigment = `
  float stratum = .5 + .5 * sin(paintPoint.y * 1.4 + .18 * paintPoint.x + swatch.g * 4.);
  float limestone = clamp(.34 + .28 * stratum + .48 * stroke + .36 * dot(base, vec3(.25,.6,.15)), 0., 1.);
  vec3 chalk = mix(vec3(.115,.118,.161), vec3(.54,.429,.333), limestone);
`;

const surfacePigment: Record<PaintSurface, string> = {
  architecture: '',
  roof: `
    float patina = clamp(ochre + .25 * stroke, 0., 1.);
    pigment = base * (.74 + .49 * stroke) + vec3(.054,.034,.051)
            + patina * vec3(.091,.058,.026);
  `,
  facade: `
    pigment = base * vec3(.95,.89,.86) * (1. + .36 * stroke)
            + vec3(.035,.028,.036) + max(stroke,0.) * vec3(.063,.046,.031);
  `,
  canopy: `
    float dab = clamp(.43 + .27 * normalize(paintNormal).y + .48 * stroke, 0., 1.);
    pigment = base * mix(vec3(.59,.76,.77),vec3(1.70,1.42,.96),dab) + vec3(.011,.017,.009);
  `,
  rock: rockPigment + 'pigment = chalk;',
  terrain: rockPigment + `
    float hummock = .5 + .5 * sin(.108 * paintPoint.x + .095 * paintPoint.z + 1.1 * sin(.10 * paintPoint.z));
    float meadow = clamp(.24 + .34 * hummock + .59 * stroke + .17 * normalize(paintNormal).y, 0., 1.);
    float dry=smoothstep(.50,.91,hummock+.12*stroke);
    vec3 turfPaint = mix(vec3(.076,.134,.068),mix(vec3(.26,.35,.145),vec3(.36,.365,.151),dry),meadow);
    turfPaint=mix(turfPaint,vec3(.102,.191,.111),thicket*.57)*(.69+2.16*grassBladeTone)*(.94+.12*grain.x);
    pigment = mix(mix(chalk,turfPaint,grass),beachPaint,gravel);
  `
};

export function paintMaterial(material: T.MeshStandardMaterial, paint: Gouache, surface: PaintSurface = 'architecture', partSpace = false) {
  const prepare = material.onBeforeCompile.bind(material);
  const cacheKey = material.customProgramCacheKey();
  material.customProgramCacheKey = () => cacheKey + '/gouache/' + surface + (partSpace ? '/part' : '');
  material.onBeforeCompile = (shader, renderer) => {
    prepare(shader, renderer);
    shader.uniforms.gouacheMap = {value: paint.strokes};
    shader.uniforms.gouacheCoverage = paint.coverage;
    shader.vertexShader = `
      varying vec3 paintPoint;
      varying vec3 paintNormal;
    ` + shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      mat4 surfaceMatrix = modelMatrix;
      #ifdef USE_INSTANCING
        surfaceMatrix *= instanceMatrix;
      #endif
      paintPoint = (surfaceMatrix * vec4(position, 1.0)).xyz;
      mat3 basis = mat3(surfaceMatrix);
      vec3 scaleSquared = vec3(dot(basis[0],basis[0]),dot(basis[1],basis[1]),dot(basis[2],basis[2]));
      vec3 localNormal = normal;
      paintNormal = basis * (localNormal / max(scaleSquared,vec3(.000001)));
      ${partSpace ? `
      #ifndef USE_INSTANCING
        vec3 partScale = sqrt(max(scaleSquared, vec3(.000001)));
        paintPoint = position * partScale;
        paintNormal = normal / partScale;
      #endif` : ''}
    `);
    shader.fragmentShader = `
      varying vec3 paintPoint;
      varying vec3 paintNormal;
      ${brushSampler}
    ` + shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      float gouacheStroke;
      {
      vec3 axis = pow(abs(normalize(paintNormal)), vec3(6.));
      axis /= max(.001, axis.x + axis.y + axis.z);
      vec3 base = diffuseColor.rgb;
      float copper = smoothstep(.01,.075, base.g - base.r) * smoothstep(.1,.32,metalness);
      float timber = (1. - smoothstep(.15,.23,base.r)) * smoothstep(.035,.09,base.r - base.b) * (1. - smoothstep(.05,.23,metalness));
      vec3 p = paintPoint * ${surfaceScale[surface]};
      ${surface === 'architecture' ? 'p *= mix(vec3(1.), vec3(.58,1.62,.88), timber);' : ''}
      p += .056 * sin(p.yzx * 2.4 + p.zxy * 1.6);
      vec3 swatch = brushSample(p.zy + vec2(.18,.64)) * axis.x
                  + brushSample(p.xz + vec2(.39,.13)) * axis.y
                  + brushSample(p.xy + vec2(.61,.32)) * axis.z;
      float value = dot(swatch, vec3(.24,.64,.12));
      float stroke = clamp((value - .586) * 5.6, -.88, 1.);
      float ochre = smoothstep(.08,.20, swatch.r - swatch.b);
      vec3 ground = base * vec3(.57,.66,.85) + vec3(.019,.009,.021);
      vec3 loaded = base * vec3(1.35,1.29,1.18) + vec3(.044,.033,.012);
      loaded += copper * vec3(.055,.12,.09);
      vec3 pigment = mix(base, ground, max(-stroke, 0.));
      pigment = mix(pigment, loaded, max(stroke, 0.));
      pigment += ochre * (vec3(.048,.019,-.012) + copper * vec3(.033,.009,-.018));
      ${surfacePigment[surface]}
      diffuseColor.rgb = mix(base, pigment, gouacheCoverage * ${surface === 'architecture' ? 'mix(.82,1.,max(copper,timber))' : '1.'});
      gouacheStroke = stroke;
      }
    `).replace('#include <roughnessmap_fragment>', `
      #include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, clamp(roughnessFactor + .11 + .09 * gouacheStroke, .0, .98), gouacheCoverage);
    `);
    if (surface === 'facade') {
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_fragment>', `
        totalEmissiveRadiance *= mix(1., .47, gouacheCoverage);
        #include <lights_physical_fragment>
      `);
    }
    if (surface === 'facade' || surface === 'roof' || surface === 'canopy') {
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
        #ifdef USE_MAP
          diffuseColor *= texture2D(map, vMapUv, gouacheCoverage * 1.35);
        #endif
      `);
    }
  };
}
