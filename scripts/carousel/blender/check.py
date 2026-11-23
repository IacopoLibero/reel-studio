"""Look at one object of the carousel 3D kit before you use it: four views in one grid, close-ups of its details, and numbers.

    CAROUSEL_TEX=<tex folder> CAROUSEL_OUT=<out folder> blender-run -b -P scripts/carousel/blender/check.py -- <object> [detail]

<object>: phone, tablet, tent, cloche, tumbler, cup, cutlery, pepper_mill, napkin, plate_set, bottle, tile, cross, menu_card, pen.
Writes CAROUSEL_OUT/check-<object>.png (front, three-quarter, back, top) or detail-<object>.png (four close-ups) and prints METRICS and WARN lines
(floating or sunk objects, faces of zero area). Pass your own screen / print images with --tex name=file.png (e.g. screen=menu.png) for phone, tablet, tent, menu_card.
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
name = argv[0] if argv else "phone"
detail = "detail" in argv
imgs = dict(a.split("=", 1) for a in argv if "=" in a and not a.startswith("-"))
screen = imgs.get("screen", "screen.png")
B = {
    "phone": lambda M: kit.phone(M, screen), "tablet": lambda M: kit.tablet(M, screen), "tent": lambda M: kit.tent(M, screen), "cloche": lambda M: kit.cloche(M),
    "tumbler": lambda M: kit.tumbler(M), "cup": lambda M: (kit.cup(M), kit.spoon(M, (-0.3, -0.58, 0.085), (0, 0, -4))), "cutlery": lambda M: kit.cutlery(M),
    "pepper_mill": lambda M: kit.pepper_mill(M), "napkin": lambda M: kit.napkin(M), "plate_set": lambda M: kit.plate_set(M), "bottle": lambda M: kit.oil_bottle(M),
    "tile": lambda M: kit.tile(M), "cross": lambda M: kit.cross(M, (0, 0, 1.0)), "menu_card": lambda M: kit.menu_card(M, screen), "pen": lambda M: kit.pen(M),
}
if name not in B: raise SystemExit(f"unknown object {name}: choose one of {', '.join(B)}")
CZ = {"phone": 0.85, "tablet": 0.8, "tent": 0.9, "cloche": 0.6, "tumbler": 0.5, "cup": 0.35, "cutlery": 0.1, "pepper_mill": 0.6, "napkin": 0.15, "plate_set": 0.2, "bottle": 0.8, "tile": 0.6, "cross": 1.0, "menu_card": 1.0, "pen": 0.1}
DIST = {"phone": 4.4, "tablet": 6.2, "tent": 5.6, "cloche": 5.6, "tumbler": 3.6, "cup": 3.4, "cutlery": 3.2, "pepper_mill": 4.0, "napkin": 4.0, "plate_set": 5.0, "bottle": 4.5, "tile": 5.0, "cross": 4.2, "menu_card": 6.0, "pen": 3.0}
os.makedirs(kit.OUT, exist_ok=True)
if detail:
    # close-ups on the object's top, middle and base, from two sides: the small details are what shows a defect
    cz = CZ[name]
    kit.detail_views(B[name], os.path.join(kit.OUT, f"detail-{name}.png"), cz, DIST[name], [("top", 0, 0, cz * 1.6, 20, 15, 1.6), ("middle", 0, 0, cz, 60, 12, 1.8), ("base", 0, 0, 0.1, 30, 20, 1.6), ("side", 0, 0, cz, 130, 10, 2.0)])
else:
    kit.four_views(B[name], os.path.join(kit.OUT, f"check-{name}.png"), center_z=CZ[name], dist=DIST[name])
