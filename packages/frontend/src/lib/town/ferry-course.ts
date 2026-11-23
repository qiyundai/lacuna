import { Curve, MathUtils, Vector3 } from 'three';
import { hiddenStation, sailingLine, type Berth } from './river-passage.js';

export class FerryCourse extends Curve<Vector3> {
  readonly duration:number;
  readonly cruise=2.45;
  private readonly before:number;
  private readonly dwell:number;
  private readonly distance:number;

  readonly end:number;
  readonly side:number;
  readonly berth?:Berth;
  readonly crossing?:number;

  constructor(end:number,side:number,berth?:Berth,crossing?:number){
    super();
    this.end=end;this.side=side;this.berth=berth;this.crossing=crossing;
    this.arcLengthDivisions=Math.ceil((end-hiddenStation)/1.5);
    this.distance=this.getLength();
    this.before=berth?this.timeAt(berth.station)*this.cruise:this.distance;
    this.dwell=berth?14:0;
    this.duration=this.distance/this.cruise+this.dwell+(berth?6:0);
  }

  getPoint(t:number,point=new Vector3()){
    const x=MathUtils.lerp(hiddenStation,this.end,t);
    return point.set(x,.09,sailingLine(x,this.side,this.berth,this.crossing));
  }

  sample(time:number){
    const leg=this.duration+38,elapsed=MathUtils.euclideanModulo(time,leg*2);
    const reverse=elapsed>=leg,phase=elapsed%leg;
    const t=reverse?this.duration-phase:phase;
    let distance=t*this.cruise, speed=1;
    if(this.berth){
      const brakeStart=this.before/this.cruise-3;
      const leave=brakeStart+6+this.dwell;
      if(t>=brakeStart&&t<leave){
        const remaining=1-MathUtils.clamp((t-brakeStart)/6,0,1);
        speed=remaining;
        distance=this.before-3*this.cruise*remaining*remaining;
      }else if(t>=leave){
        const seconds=t-leave;
        speed=Math.min(1,seconds/6);
        distance=this.before+this.cruise*(seconds<6?seconds*seconds/12:seconds-3);
      }
    }
    return {progress:MathUtils.clamp(distance/this.distance,0,1),direction:reverse?-1:1,visible:phase<this.duration,speed};
  }

  clockAt(station:number,reverse:boolean){
    let elapsed=this.timeAt(station);
    if(this.berth){
      const distance=(elapsed-this.before/this.cruise)*this.cruise;
      if(Math.abs(distance)<3*this.cruise){
        const brake=Math.sqrt(12*Math.abs(distance)/this.cruise);
        elapsed=this.before/this.cruise+3+(distance<=0?-brake:this.dwell+brake);
      }else if(distance>0)elapsed+=this.dwell+6;
    }
    return reverse?2*this.duration+38-elapsed:elapsed;
  }

  timeAt(station:number){
    const lengths=this.getLengths();
    const offset=MathUtils.clamp((station-hiddenStation)/(this.end-hiddenStation),0,1)*this.arcLengthDivisions;
    const i=Math.floor(offset);
    return MathUtils.lerp(lengths[i]!,lengths[Math.min(i+1,this.arcLengthDivisions)]!,offset-i)/this.cruise;
  }
}
