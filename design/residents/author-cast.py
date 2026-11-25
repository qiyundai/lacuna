import bpy
import math
from pathlib import Path
from runpy import run_path
from tempfile import TemporaryDirectory
from mathutils import Vector

root = Path(__file__).resolve().parents[2]
fit=run_path(str(Path(__file__).with_name("body-fit.py")))
bundle_family=run_path(str(Path(__file__).with_name("pack-cast.py")))["bundle_family"]
foot_contacts={}
source = root / "design/residents/market-shopper.blend"
output = root / "packages/frontend/static/city/residents"
wardrobes = [
    ("seeds", "Garden smock", "82733d", "d19b70", .90, .16, .95, .09),
    ("atlas", "Surveyor cape", "537b93", "bfa976", 1.11, .045, 1.25, .035),
    ("mending", "Bench apron", "996741", "424953", 1.04, .18, .84, .09),
    ("table", "Kitchen wrap", "a4584b", "e2c59b", 1.12, .10, 1.0, .16),
    ("archive", "Archivist waistcoat", "6d617b", "aa8b64", .89, .04, .82, .11),
    ("lights", "Oilskin cape", "af873b", "41504a", 1.17, .17, 1.16, .13),
    ("kite", "Wind jacket", "487e80", "a04d3c", .88, .03, .91, .13),
    ("bells", "Band tunic", "485a7b", "b88f41", 1.04, .08, 1.02, .16),
    ("cloth", "Patchwork mantle", "856375", "a99b64", 1.19, .19, 1.12, .05),
    ("tides", "Watch coat", "48616c", "78684e", .95, .22, .93, .12),
    ("toys", "Carver overalls", "71836b", "915b42", 1.07, .07, .93, .07),
    ("type", "Pressman's vest", "685c52", "829199", .92, .02, 1.10, .06),
]

def pigment(name, rgb):
    color = [int(rgb[i:i+2],16)/255 for i in (0,2,4)]
    linear = tuple(((c+.055)/1.055)**2.4 for c in color)+(1,)
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = linear
    shader.inputs["Roughness"].default_value = .88
    material.diffuse_color = linear
    return material

def bind(obj, name, mat, joint):
    obj.name = name
    obj.data.materials.append(mat)
    group = obj.vertex_groups.new(name=joint)
    group.add(range(len(obj.data.vertices)), 1, "REPLACE")
    obj.parent = rig
    deform = obj.modifiers.new("Tailoring", "ARMATURE")
    deform.object = rig
    return obj

def shape(name, center, radii, mat, joint="Tote", kind="box", tilt=0):
    if kind=="round":
        bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10)
    elif kind=="cone":
        bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=1, radius2=.47, depth=2)
    elif kind=="tube":
        bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=1, depth=2)
    else:
        bpy.ops.mesh.primitive_cube_add(size=2)
    obj=bpy.context.object
    for vertex in obj.data.vertices:
        x,y,z=vertex.co
        x,y,z=x*radii[0],y*radii[1],z*radii[2]
        vertex.co=(center[0]+x*math.cos(tilt)-z*math.sin(tilt),center[1]+y,center[2]+z*math.cos(tilt)+x*math.sin(tilt))
    if kind=="box":
        bevel=obj.modifiers.new("Bound edges","BEVEL")
        bevel.width=min(.008,min(radii)*.4)
        bevel.segments=2
        bpy.ops.object.modifier_apply(modifier=bevel.name)
    else:
        for face in obj.data.polygons: face.use_smooth=len(face.vertices)<=4
    return bind(obj,name,mat,joint)

def dye_brushwork(material, color):
    import numpy as np
    image=bpy.data.materials[material].node_tree.nodes.get("Image Texture").image
    pixels=np.empty(len(image.pixels),dtype=np.float32)
    image.pixels.foreach_get(pixels)
    rgba=pixels.reshape(-1,4)
    light=rgba[:,:3] @ np.array([.2126,.7152,.0722])
    luminance=np.clip(light/max(.001,np.mean(light)),.62,1.35)
    srgb=[12.92*c if c<=.0031308 else 1.055*c**(1/2.4)-.055 for c in color.diffuse_color[:3]]
    rgba[:,:3]=np.clip(np.outer(luminance,srgb),0,1)
    image.pixels.foreach_set(pixels)
    image.update()
    image.pack()

def tailored(name, rows, mat, bone, front=False, center=0):
    n=24
    vertices=[]
    for z,rx,ry in rows:
        for i in range(n+1):
            a=(-.82+1.64*i/n) if front else 2*math.pi*i/n
            vertices.append((center+rx*math.sin(a),-ry*math.cos(a),z))
    faces=[(j*(n+1)+i,j*(n+1)+i+1,(j+1)*(n+1)+i+1,(j+1)*(n+1)+i) for j in range(len(rows)-1) for i in range(n)]
    if not front:faces.append(tuple(range((len(rows)-1)*(n+1),len(vertices)-1)))
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(vertices,[],faces)
    mesh.update()
    obj=bpy.data.objects.new(name,mesh)
    bpy.context.collection.objects.link(obj)
    for poly in mesh.polygons:poly.use_smooth=len(poly.vertices)==4
    return bind(obj,name,mat,bone)

for index,(key,garment,cloth_color,trim_color,width,drop,brim,crown) in enumerate(wardrobes):
    bpy.ops.wm.open_mainfile(filepath=str(source))
    rig=bpy.data.objects["Market shopper"]
    for name in ("Bag handle","Canvas market bag","Small loaf","Market greens","Soft crown","Peak"):
        bpy.data.objects.remove(bpy.data.objects[name],do_unlink=True)
    cloth=pigment(garment,cloth_color)
    trim=pigment("Woven binding",trim_color)
    paper=pigment("Warm paper","dfc79d")
    metal=pigment("Antique brass","ba9558")
    dark=pigment("Dark grain","554b44")
    coat=bpy.data.objects["Bell jacket"]
    for v in coat.data.vertices:
        lower=max(0,min(1,(1.22-v.co.z)/.48))
        v.co.x*=1+(width-1)*lower
        v.co.y*=1+drop*.94*lower
        v.co.z-=drop*lower
    for v in bpy.data.objects["Folded hem"].data.vertices:
        v.co.x*=width
        v.co.y*=1+drop*.94
        v.co.z-=drop
    dye_brushwork("Sea glass",cloth)
    dye_brushwork("Deep harbor",trim)
    apron=index in (0,2,3,7,10,11)
    if apron:
        tailored("Cut linen apron",[(.68-drop,.275*width,.223+drop*.18),(.8,.277*width,.218+drop*.14),(1.03,.261,.193),(1.17,.147,.178)],trim,"Coat",True)
        shape("Apron tape",(.068,-.149,1.193),(.011,.014,.073),trim,"Coat",tilt=-.1)
        shape("Apron tape",(-.068,-.149,1.193),(.011,.014,.073),trim,"Coat",tilt=.1)
    elif index in (1,5,8):
        tailored("Shoulder mantle",[(.91,.323,.216),(1.04,.303,.211),(1.19,.285,.188),(1.27,.138,.132)],trim,"Coat")
    else:
        tailored("Welted waist",[(.82,.262*width,.191),(.858,.261*width,.190)],trim,"Coat")
    if key=="cloth":
        for j,color in enumerate((metal,cloth,paper)):
            shape("Darned swatch",((j-1)*.078,-.184,.991),(.035,.008,.028),color,"Coat",tilt=(j-1)*.13)
    if key=="lights" or key=="atlas":
        shape("Shoulder clasp",(0,-.18,1.17),(.025,.009,.024),metal,"Coat","round")
    shape("Bound breast pocket",(.076,-.175,1.075),(.047,.012,.049),trim,"Coat")
    for j in range(3):
        shape("Horn button",(-.067,-.186,1.105-.074*j),(.009,.006,.010),metal,"Coat","round")
    if key in ("archive","cloth","toys"):
        shape("Swept hair",(0,.021,1.49),(.129,.117,.092),dark,"Head","round")
        shape("Gathered knot",(-.021,.128,1.49),(.069,.082,.069),dark,"Head","round")
        if key=="cloth":tailored("Head wrap",[(1.49,.135,.13),(1.536,.138,.133),(1.56,.131,.132)],trim,"Head")
    elif key in ("bells","lights","type"):
        tailored("Blocked crown",[(1.49,.139,.132),(1.51,.143,.136),(1.55+crown*.55,.133,.126),(1.55+crown*.60,.112,.103)],trim,"Head")
        tailored("Crown ribbon",[(1.50,.144,.138),(1.523,.143,.138)],cloth,"Head")
    else:
        shape("Crown",(0,.002,1.51+crown*.54),(.137*brim,.127,crown),trim,"Head","round")
        shape("Hat band",(0,0,1.51),(.14*brim,.134,.018),cloth,"Head","tube")
    if index in (0,1,5,11):
        shape("Rolled brim",(0,-.018,1.49),(.159*brim,.164,.015),trim,"Head","round")
    if key=="seeds":
        shape("Sun brim",(0,-.012,1.49),(.208,.188,.017),trim,"Head","round")
        for j in range(2):
            shape("Hat flower",(.114+j*.017,-.076,1.531),(.026,.018,.017),[paper,metal][j],"Head","round")
    if key=="atlas":
        shape("Map case",(-.135,-.132,.85),(.063,.031,.095),dark,"Coat",tilt=.15)
        shape("Case strap",(-.02,-.18,1.03),(.012,.014,.223),dark,"Coat",tilt=-.48)
    if key=="cloth":
        for j in range(3):
            shape("Braided loop",(-.091,.081,1.445-j*.041),(.037,.048,.034),dark,"Head","round")
    if key=="tides":
        shape("Folded scarf",(0,-.086,1.24),(.135,.071,.048),trim,"Coat","round")
        shape("Scarf end",(-.112,-.157,1.124),(.036,.016,.102),trim,"Coat",tilt=-.15)
    if key=="archive":
        shape("Pencil over ear",(.118,-.009,1.452),(.007,.012,.055),metal,"Head",tilt=.18)
    if index in (2,6,9):
        shape("Hat knot",(-.065,.061,1.54+crown*.72),(.043,.040,.042),cloth,"Head","round")
    def prop(name,x,y,z,a,b,c,material=trim,kind="box",tilt=0):
        return shape(name,(.30+x,-.06+y,.73+z),(a,b,c),material,"Cuff.L",kind,tilt)
    if key in ("seeds","archive","atlas","type"):
        for j in range(3):
            prop(("Seed envelope","Photograph","Map fold","Type proof")[("seeds","archive","atlas","type").index(key)],j*.004,-j*.012,-.058,.084+j*.005,.009,.080,paper,tilt=(j-1)*.10)
        if key=="seeds":
            for j in range(5):prop("Seed stamp",.03*math.cos(j),-.035,-.055+.025*math.sin(j),.014,.004,.012,cloth,"round")
        elif key=="archive":
            prop("Silver print",0,-.037,-.05,.057,.005,.045,dark)
            prop("Portrait silhouette",0,-.045,-.044,.022,.005,.026,paper,"round")
        elif key=="atlas":
            for j in range(4):prop("Blue map contour",-.054+.032*j,-.040,-.055,.003,.004,.052,cloth,tilt=.24*j-.3)
        else:
            for j in range(5):prop("Type block",-.055+j*.025,-.036,-.05,.009,.008,.019,dark)
    elif key=="mending":
        prop("Tin",0,0,-.055,.087,.055,.041,metal)
        prop("Hinged lid",0,.047,-.005,.088,.007,.048,trim)
        for j in range(3):prop("Spool",-.045+j*.04,-.005,-.005,.016,.015,.018,dark,"tube")
    elif key=="table":
        prop("Serving bowl",0,0,-.058,.115,.1,.058,cloth,"round")
        prop("Glazed rim",0,0,-.022,.112,.097,.013,paper,"round")
        prop("Interior",0,0,-.016,.094,.082,.009,trim,"round")
    elif key=="lights":
        prop("Lantern glass",0,0,-.088,.048,.043,.080,paper,"tube")
        for j in (-1,1):prop("Wire guard",j*.05,0,-.065,.005,.006,.090,metal)
        prop("Lamp hood",0,0,-.005,.068,.065,.023,dark,"cone")
        prop("Oil well",0,0,-.161,.060,.055,.026,metal,"tube")
    elif key=="kite":
        prop("Diamond sail",.015,0,-.08,.121,.01,.121,cloth,tilt=.785)
        prop("Bamboo spar",.015,-.016,-.08,.004,.006,.17,metal)
        for j in (-1,1):prop("Twin ribbon",.015+j*.035,-.008,-.27,.009,.006,.074,trim,tilt=j*.28)
    elif key=="bells":
        prop("Handbell",0,0,-.079,.081,.075,.064,metal,"cone")
        prop("Turned handle",0,0,.008,.018,.017,.047,dark,"tube")
        prop("Clapper",0,0,-.145,.021,.020,.022,dark,"round")
    elif key=="cloth":
        prop("Cloth roll",0,0,-.082,.071,.061,.123,trim,"tube")
        for j in range(3):prop("Patch",0,-.054,-.14+j*.059,.042,.009,.025,[cloth,paper,dark][j],tilt=.08*j)
    elif key=="tides":
        prop("Graduated rule",0,0,-.074,.031,.012,.153,metal)
        for j in range(8):prop("Incised mark",-.010,-.014,-.20+j*.033,.015,.003,.002,dark)
    elif key=="toys":
        prop("Carved hull",.012,0,-.078,.136,.046,.037,trim,"round")
        prop("Toy mast",.017,0,.004,.005,.007,.083,dark)
        prop("Linen sail",.079,-.022,.019,.043,.008,.055,paper,tilt=-.16)
    prop("Keepsake tag",.071,-.022,-.095,.016,.005,.027,paper,tilt=.21).name="Keepsake tag"
    prop("Chapter two",.063,-.03,-.095,.003,.003,.017,dark,tilt=.34)
    prop("Chapter three",.081,-.03,-.094,.002,.003,.012,dark,tilt=-.44)
    with TemporaryDirectory() as temp:
        folder=Path(temp)
        assembled=folder/"outfit.blend"
        bpy.ops.wm.save_as_mainfile(filepath=str(assembled),copy=True)
        for build_name,build in fit["builds"].items():
            bpy.ops.wm.open_mainfile(filepath=str(assembled))
            rig=bpy.data.objects["Market shopper"]
            fit["fit_model"](bpy,rig,build)
            fit["plant_feet"](bpy,rig,build_name,foot_contacts)
            bpy.ops.export_scene.gltf(filepath=str(folder/(build_name+".glb")),export_format="GLB",export_animation_mode="ACTIONS",export_anim_slide_to_zero=True,export_force_sampling=True,export_frame_range=False,export_cameras=False,export_lights=False)
        bundle_family(folder,output/key,fit["builds"])
