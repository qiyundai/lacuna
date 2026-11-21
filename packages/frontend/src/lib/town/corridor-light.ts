export const corridorLightField=`
  float canopyLightField(vec3 p,float driftTime){
    float k=p.z+.115*p.y+.11*(p.x-76.)+driftTime*1.7;
    float folded=sign(k)*log(1.+abs(k)*.000115)/.000115;
    float phase=folded*.012+.78*sin(folded*.0041)+.28*sin(folded*.0023+p.x*.002);
    phase+=.09*sin(p.y*.017+folded*.009)+.07*sin(p.y*.034+p.x*.012);
    return sin(phase)+.18*sin(phase*1.81+.7)+.08*sin(folded*.027+p.x*.008);
  }`;
export const corridorShadow=`
  uniform float driftTime;
  ${corridorLightField}
  float canopySunlight(vec3 p){
    float cloud=canopyLightField(p,driftTime);
    float softness=.34+min(.45,fwidth(cloud));
    return smoothstep(-.04-softness,.04+softness,cloud);
  }`;
