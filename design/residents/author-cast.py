from pathlib import Path
import sys

import bpy

source = Path(__file__).resolve().parent
output = source.parents[1] / "packages/frontend/static/city/residents"
models = {
    "seeds": "seed-gardener",
    "atlas": "cartographer",
    "mending": "bench-repairer",
    "table": "supper-host",
    "archive": "photo-archivist",
    "lights": "lamplighter",
    "kite": "kite-maker",
    "bells": "bell-ringer",
    "cloth": "quilt-mender",
    "tides": "tide-watcher",
    "toys": "boat-carver",
    "type": "letterpress-printer",
    "glaze": "kiln-potter",
    "letters": "letter-carrier",
    "minutes": "clock-restorer",
    "rushes": "reed-weaver",
    "stars": "night-astronomer",
    "crust": "bread-baker",
    "rain": "rain-recorder",
    "strings": "violin-maker",
    "tiles": "tile-setter",
    "floats": "swim-steward",
}

families = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else list(models)
unknown = set(families) - models.keys()
if unknown:
    raise ValueError(f"Unknown resident families: {sorted(unknown)}")

for family in families:
    name = models[family]
    bpy.ops.wm.open_mainfile(filepath=str(source / (name + ".blend")))
    bpy.ops.export_scene.gltf(
        filepath=str(output / (name + ".glb")),
        export_format="GLB",
        export_animation_mode="ACTIONS",
        export_force_sampling=False,
    )
