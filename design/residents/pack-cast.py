import json
import struct

def document(file):
    raw=file.read_bytes()
    size=struct.unpack_from("<I",raw,12)[0]
    return json.loads(raw[20:20+size]),memoryview(raw)[28+size:]

def bundle_family(folder, destination, builds):
    destination.mkdir(parents=True,exist_ok=True)
    sources={key:document(folder/(key+".glb")) for key in builds}
    def views(doc,data):
        for view in doc["bufferViews"]:
            offset=view.get("byteOffset",0)
            yield data[offset:offset+view["byteLength"]].tobytes()
    common=set.intersection(*(set(views(doc,data)) for doc,data in sources.values()))
    library=bytearray()
    shared={}
    for block in sorted(common):
        shared[block]=len(library)
        library.extend(block)
        library.extend(bytes((-len(library))%4))
    (destination/"wardrobe.bin").write_bytes(library)
    for key,(doc,data) in sources.items():
        fitted=bytearray()
        for view,block in zip(doc["bufferViews"],views(doc,data)):
            if block in shared:
                view["buffer"]=0
                view["byteOffset"]=shared[block]
            else:
                view["buffer"]=1
                view["byteOffset"]=len(fitted)
                fitted.extend(block)
                fitted.extend(bytes((-len(fitted))%4))
        doc["buffers"]=[{"byteLength":len(library),"uri":"wardrobe.bin"},{"byteLength":len(fitted),"uri":key+".bin"}]
        (destination/(key+".bin")).write_bytes(fitted)
        (destination/(key+".gltf")).write_text(json.dumps(doc,separators=(",",":")),encoding="utf-8")
