import { Curve, MathUtils, Vector3 } from 'three';
import { riverWidth, shoreline } from './valley-river.js';
import { ferryBerthOffset } from './ferry-hall.js';
import type { Bank } from './painted-coast.js';

export class FerryCourse extends Curve<Vector3> {
  readonly station:number;
  readonly bank:Bank;
  readonly destination?:number;
  private readonly outbound:number;
  private readonly inbound:number;
  private readonly length:number;

  constructor(station:number,bank:Bank,destination?:number) {
    super();
    this.station=station;
    this.bank=bank;
    this.destination=destination;
    this.arcLengthDivisions=256;
    const lengths=this.getLengths();
    this.length=lengths[this.arcLengthDivisions]!;
    this.outbound=lengths[this.arcLengthDivisions/2]!/1.8;
    this.inbound=this.length/1.8-this.outbound;
  }

  getPoint(t:number,point=new Vector3()) {
    const angle=t*Math.PI*2;
    const crossing=(1-Math.cos(angle))*.5;
    const x=MathUtils.lerp(this.station,this.destination??this.station+15,crossing)+10*Math.sin(angle);
    const width=riverWidth(x);
    const dockDistance=this.destination===undefined?crossing:Math.min(crossing,1-crossing);
    const margin=Math.min(ferryBerthOffset+2.2+1.2*MathUtils.smoothstep(dockDistance,0,.22),width*.44);
    const span=this.destination===undefined ? .60 : 1;
    const fromBank=margin+(width-2*margin)*crossing*span;
    return point.set(x,.09,shoreline(x)+(this.bank===0?fromBank:width-fromBank));
  }

  progress(time:number) {
    const layover=6,turnaround=this.destination===undefined?0:layover;
    const elapsed=time%(layover+this.outbound+turnaround+this.inbound)-layover;
    const dock=this.outbound*1.8/this.length;
    const sail=(t:number,duration:number)=>{
      const u=MathUtils.clamp(t/duration,0,1);
      return u*u*(3-2*u);
    };
    if(this.destination===undefined)return sail(elapsed,this.outbound+this.inbound);
    if(elapsed<=this.outbound)return dock*sail(elapsed,this.outbound);
    return dock+(1-dock)*sail(elapsed-this.outbound-turnaround,this.inbound);
  }
}
