from dataclasses import dataclass
from mathutils import Vector

@dataclass(frozen=True)
class Build:
    legs: float
    trunk: float
    neck: float
    shoulder: float
    chest: float
    waist: float
    hip: float
    depth: float
    arm: float
    muscle: float
    stance: float
    head: float
    lean: float
    slope: float

builds = {
    "compact": Build(.77,.90,.84,1.22,1.29,1.22,1.14,1.25,.82,1.19,1.16,1.00,.018,-.09),
    "willow": Build(1.23,1.04,1.18,.84,.78,.74,.88,.81,1.17,.72,.84,.94,-.008,-.03),
    "round": Build(.91,.94,.82,1.02,1.32,1.56,1.39,1.58,.96,1.23,1.34,1.07,.031,-.14),
    "wedge": Build(1.07,1.09,.91,1.54,1.42,.94,.85,1.18,1.14,1.40,.98,.96,-.024,.05),
    "bell": Build(.96,1.02,1.06,.86,.86,1.04,1.53,1.20,.95,.94,1.39,.95,.019,-.09),
    "rangy": Build(1.15,.97,1.16,1.16,1.02,.79,.85,.88,1.34,.86,.93,.98,.046,-.12),
    "square": Build(.92,1.12,.80,1.35,1.35,1.35,1.30,1.27,.99,1.27,1.22,1.02,-.014,-.02),
    "bowed": Build(.94,.94,.91,.98,.93,.91,.97,.98,1.13,.87,1.05,.99,.157,-.21),
}

def blend(z, stops):
    for (a,v),(b,w) in zip(stops,stops[1:]):
        if z<=b:
            t=max(0,min(1,(z-a)/(b-a)))
            return v+(w-v)*t
    return stops[-1][1]

def fitted(point, joint, b, rigid=False):
    x,y,z=point
    hip=.09+(.72-.09)*b.legs
    shoulder=hip+(1.235-.72)*b.trunk
    neck=shoulder+.065*b.neck
    height=blend(z,[(0,0),(.09,.09),(.72,hip),(1.235,shoulder),(1.30,neck),(2,neck+.70*b.head)])
    if z>2:height+=(z-2)*b.head
    bend=blend(z,[(0,0),(.72,0),(1.07,b.lean*.27),(1.235,b.lean*.72),(1.30,b.lean)])
    if joint=="Head":
        return Vector((x*b.head,y*b.head-b.lean,neck+(z-1.30)*b.head))
    if joint.startswith(("Sleeve","Cuff")) or joint=="Tote":
        side=-1 if ".R" in joint else 1
        if rigid or joint=="Tote":
            wrist=Vector((side*.289,-.045,.803))
            return fitted(wrist,"Cuff.R" if side<0 else "Cuff.L",b)+(Vector(point)-wrist)
        base=blend(z,[(.60,.299),(.803,.289),(.99,.262),(1.235,.193),(1.4,.17)])
        spread=max(.289*b.hip+.026*(b.muscle-1),.193*b.shoulder+.085*b.muscle)
        out=blend(z,[(.60,spread+.008),(.803,spread),(.99,(spread+.193*b.shoulder)*.52),(1.235,.193*b.shoulder),(1.4,.17*b.shoulder)])
        arm_y=shoulder+(z-1.235)*b.arm+b.slope*.19
        return Vector((side*out+(x-side*base)*b.muscle,y*b.muscle-b.lean*.72,arm_y))
    if joint.startswith(("Thigh","Shin","Shoe")):
        side=-1 if ".R" in joint else 1
        spacing=blend(z,[(0,b.stance),(.40,(b.stance+b.hip)*.51),(.72,b.hip)])
        girth=blend(z,[(0,1),(.12,1),(.32,(b.hip+b.muscle)*.5),(.72,b.hip)])
        return Vector((side*.106*spacing+(x-side*.106)*girth,y*girth,height))
    width=blend(z,[(0,b.hip),(.73,b.hip),(.88,b.waist),(1.0,(b.waist+b.chest)*.5),(1.12,b.chest),(1.235,b.shoulder),(1.30,b.head),(1.40,b.head)])
    depth=blend(z,[(0,b.depth),(.88,b.depth),(1.12,(b.depth+b.chest)*.5),(1.235,b.chest),(1.30,b.head),(1.40,b.head)])
    drop=b.slope*abs(x)*blend(z,[(0,0),(1.04,0),(1.235,1),(1.32,0)])
    belly=max(0,b.waist-1)*blend(z,[(0,0),(.68,0),(.88,.12),(1.12,.03),(1.235,0)])
    return Vector((x*width,y*depth-bend-belly,height+drop))

def fit_model(bpy,rig,build):
    for obj in list(rig.children):
        if obj.type!="MESH": continue
        for vertex in obj.data.vertices:
            groups=[(obj.vertex_groups[g.group].name,g.weight) for g in vertex.groups if g.weight>0]
            if not groups:continue
            rest=vertex.co.copy()
            vertex.co=sum((fitted(rest,name,build,name.startswith("Cuff") and not obj.name.startswith(("Hand","Knit cuff","Sleeve")))*weight for name,weight in groups),Vector())/sum(w for _,w in groups)
        obj.data.update()
    bpy.context.view_layer.objects.active=rig
    bpy.ops.object.mode_set(mode="EDIT")
    for bone in rig.data.edit_bones:
        head,tail=bone.head.copy(),bone.tail.copy()
        bone.head=fitted(head,bone.name,build)
        bone.tail=fitted(tail,bone.name,build)
    bpy.ops.object.mode_set(mode="OBJECT")

def plant_feet(bpy,rig,key,cache):
    scene=bpy.context.scene
    pelvis=rig.pose.bones["Pelvis"]
    soles=[bpy.data.objects[name] for name in ("Sole L","Sole R")]
    walk=rig.animation_data.action
    for action in list(bpy.data.actions):
        if action.name not in ("Market walk","Market turnaround"):continue
        rig.animation_data.action=action
        cache_key=(key,action.name)
        if cache_key not in cache:
            positions=[]
            for frame in range(1,int(action.frame_range[1])+1):
                scene.frame_set(frame)
                deps=bpy.context.evaluated_depsgraph_get()
                low=min((obj.matrix_world @ v.co).z for sole in soles for obj in [sole.evaluated_get(deps)] for v in obj.data.vertices)
                correction=pelvis.bone.matrix_local.to_quaternion().inverted() @ Vector((0,0,.002-low))
                positions.append(pelvis.location.copy()+correction)
            cache[cache_key]=positions
        for frame,position in enumerate(cache[cache_key],1):
            pelvis.location=position
            pelvis.keyframe_insert(data_path="location",frame=frame,group=pelvis.name)
    rig.animation_data.action=walk
    scene.frame_set(1)
