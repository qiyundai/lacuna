export const meadowPigment = `
  vec3 meadowPigment(vec2 ground,float canopy,float elevation){
    float variation=.50+.27*sin(dot(ground,vec2(.079,.051))+.83*sin(ground.y*.101))
                   +.23*cos(dot(ground,vec2(.042,-.086)));
    float dry=clamp(.82*variation+.18*smoothstep(48.,140.,elevation),0.,1.);
    vec3 field=mix(vec3(.045,.100,.061),vec3(.108,.182,.092),dry);
    vec3 understory=mix(vec3(.023,.061,.040),vec3(.057,.102,.060),variation);
    return mix(field,understory,smoothstep(.12,.88,canopy));
  }`;
