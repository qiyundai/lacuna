import {valleyOrigin} from './valley-river.js';

export const sunbreak=`
  float sunbreakAt(vec3 p,float seconds,vec3 toSun){
    vec2 footprint=p.xz-p.y*toSun.xz/toSun.y;
    float station=${valleyOrigin.z}.-footprint.y;
    float bank=${valleyOrigin.x}.+8.+19.*sin(station*.012+.65)+8.*sin(station*.029)-2.4*cos(station*.056);
    float phase=fract(.32+seconds*.023/6.2831853+station*.0011+.068*sin(station*.009));
    float passage=smoothstep(.65,.94,phase);
    float opening=smoothstep(.60,.71,phase)*(1.-smoothstep(.91,.989,phase));
    float crease=footprint.x-bank-31.+81.*passage+9.*sin(station*.018)+3.*sin(station*.051);
    float edge=crease-15.-3.*sin(station*.071);
    float gap=exp(-crease*crease/38.)+.48*exp(-edge*edge/10.);
    float wisps=.56+.44*cos(station*.043+passage*1.6+sin(station*.021));
    return opening*gap*wisps;
  }`;
