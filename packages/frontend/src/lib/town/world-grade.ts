import { ShaderMaterial } from 'three';

const dreamcoreDaylight = `
  vec3 dreamcoreDaylight(vec3 rgb){
    vec4 order = rgb.g < rgb.b ? vec4(rgb.bg, -1., 2./3.) : vec4(rgb.gb, 0., -1./3.);
    vec4 channels = rgb.r < order.x ? vec4(order.xyw, rgb.r) : vec4(rgb.r, order.yzx);
    float value = channels.x;
    float chroma = value - min(channels.w, channels.y);
    float hue = abs(channels.z + (channels.w - channels.y) / (6.*chroma + .00001));
    float saturation = chroma / max(value, .00001);
    float pigment = smoothstep(.025, .20, saturation);
    float leaf = pigment * smoothstep(.096, .151, hue) * (1.-smoothstep(.34, .47, hue));
    float blue = pigment * smoothstep(.44, .52, hue) * (1.-smoothstep(.65, .73, hue));
    float daylight = smoothstep(.14, .65, value);
    hue += leaf * .60 * (mix(.36, .205, daylight) - hue) + blue * .54 * (.545 - hue);
    saturation += (1.-saturation) * (leaf*(.11+.20*daylight) + blue*.24 + pigment*.029);
    value += (1.-value) * (leaf*(.025+.23*daylight) + blue*.11 + .055*sin(value*3.14159));
    vec3 wheel = clamp(abs(fract(hue + vec3(0., 2./3., 1./3.))*6.-3.)-1., 0., 1.);
    vec3 graded = value * mix(vec3(1.), wheel, saturation);
    float pearl = smoothstep(.71, .98, value) * (1.-smoothstep(.05, .32, saturation));
    return mix(graded, graded*vec3(.997, .980, 1.), pearl);
  }`;

export function worldGradeMaterial(displayInput = false){
  return new ShaderMaterial({
    name: 'Dreamcore daylight',
    uniforms: { tDiffuse: { value: null } },
    depthTest: false,
    depthWrite: false,
    vertexShader: `
      varying vec2 screenUv;
      void main(){screenUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      varying vec2 screenUv;
      ${dreamcoreDaylight}
      void main(){
        gl_FragColor=texture2D(tDiffuse,screenUv);
        ${displayInput ? '' : `
        #include <tonemapping_fragment>
        #include <colorspace_fragment>`}
        gl_FragColor.rgb=dreamcoreDaylight(gl_FragColor.rgb);
      }`
  });
}
