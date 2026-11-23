"""Real texture images for the carousel 3D kit, made with numpy inside Blender's Python (no other packages needed).

    blender-run -b -P scripts/carousel/blender/textures.py -- <out folder> [wood paper cloth grain ...]

Writes (sRGB colour images and Non-Color height maps, all tileable by repeating):
  wood.png + wood-h.png   planks with grain lines, pores, seams (2048 x 1366; the kit repeats it every 6 x 4 units)
  paper.png               warm paper: clouds, fibres, specks (1024; use as a multiplied colour and as a bump)
  cloth.png + cloth-h.png a plain weave with slubs (512; repeat it small)
  grain-h.png             a leather / pebble height map (1024) for plastic, cases, tiles
Judge a texture at 100% in a crop of the final render: if it is too fine to see there, make it coarser, not stronger.
"""
import bpy, os, sys
import numpy as np

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = args[0] if args else os.path.join(os.getcwd(), "tex")
WANT = set(args[1:]) or {"wood", "paper", "cloth", "grain"}
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(7)


def gauss(shape, sx, sy=None):
    sy = sx if sy is None else sy
    a = rng.standard_normal(shape); F = np.fft.fft2(a)
    fy = np.fft.fftfreq(shape[0])[:, None]; fx = np.fft.fftfreq(shape[1])[None, :]
    G = np.exp(-2 * (np.pi ** 2) * ((fx * sx) ** 2 + (fy * sy) ** 2)); r = np.real(np.fft.ifft2(F * G))
    return (r - r.mean()) / r.std()


def save(name, arr, srgb=True):
    """arr: float 0..1, shape (H, W) or (H, W, 3). Colour images are stored sRGB-encoded (gamma 1/2.2); height maps are saved as they are."""
    if arr.ndim == 2: arr = np.stack([arr] * 3, -1)
    arr = np.clip(arr, 0, 1)
    if srgb: arr = arr ** (1 / 2.2)
    h, w = arr.shape[:2]
    rgba = np.dstack([arr, np.ones((h, w))])[::-1].astype(np.float32)  # Blender images start at the bottom row
    img = bpy.data.images.new(name, w, h, alpha=False)
    img.colorspace_settings.name = "sRGB" if srgb else "Non-Color"
    img.pixels.foreach_set(rgba.ravel()); img.filepath_raw = os.path.join(OUT, name); img.file_format = "PNG"; img.save()
    print("WROTE", img.filepath_raw)


def wood():
    W, H = 2048, 1366
    D = gauss((H, W), 130, 22); S = gauss((H, W), 50, 0.9); S2 = gauss((H, W), 18, 0.7); P = gauss((H, W), 1.2, 1.2); BL = gauss((H, W), 260, 60)
    img = np.zeros((H, W, 3), np.float32); planks = 5; ph = H // planks
    pal = [(0.62, 0.42, 0.26), (0.72, 0.50, 0.32), (0.56, 0.37, 0.23), (0.78, 0.57, 0.38), (0.66, 0.45, 0.28), (0.70, 0.49, 0.31)]
    Y = np.mgrid[0:H, 0:W][0].astype(np.float32)
    for r in range(planks):
        y0 = r * ph; y1 = H if r == planks - 1 else (r + 1) * ph; x = -int(rng.integers(0, 900))
        while x < W:
            L = int(rng.integers(780, 1500)); x0 = max(0, x); x1 = min(W, x + L)
            if x1 > x0:
                base = np.array(pal[int(rng.integers(0, len(pal)))]) * (0.92 + 0.16 * rng.random())
                yy = Y[y0:y1, x0:x1] - y0; ring = (np.sin(yy * 0.075 + D[y0:y1, x0:x1] * 5.5 + rng.random() * 6) + 1) / 2
                tone = 0.80 + 0.30 * np.clip(0.55 + 0.45 * ring, 0, 1) + 0.10 * S[y0:y1, x0:x1] + 0.05 * S2[y0:y1, x0:x1] + 0.04 * BL[y0:y1, x0:x1]
                pores = (P[y0:y1, x0:x1] > 1.9).astype(np.float32) * 0.18
                img[y0:y1, x0:x1] = base[None, None, :] * np.clip(tone - pores, 0.3, 1.4)[:, :, None]
                img[y0:y1, x0:min(W, x0 + 3)] *= 0.55
            x += L
        img[y0:y0 + 3] *= 0.55
    save("wood.png", img)
    save("wood-h.png", np.clip(0.5 + 0.18 * S + 0.1 * S2 - 0.25 * (P > 1.9), 0, 1), srgb=False)


def paper():
    N = 1024
    base = 0.93 + 0.035 * gauss((N, N), 18) + 0.03 * gauss((N, N), 5)
    fib = np.zeros((N, N), np.float32)
    for _ in range(2600):
        x = rng.integers(0, N); y = rng.integers(0, N); a = rng.random() * np.pi; L = int(rng.integers(8, 30)); v = (rng.random() - 0.5) * 0.11
        t = np.arange(L); fib[(y + np.sin(a) * t).astype(int) % N, (x + np.cos(a) * t).astype(int) % N] += v
    sp = (gauss((N, N), 0.7) > 2.35).astype(np.float32) * -0.07
    img = np.clip(base + fib + sp, 0.6, 1.0)
    save("paper.png", np.stack([img, img * 0.985, img * 0.95], -1))


def cloth():
    N = 512; y, x = np.mgrid[0:N, 0:N].astype(np.float32)
    warp = np.sin(x * 2 * np.pi / 6.0) * 0.5 + 0.5; weft = np.sin(y * 2 * np.pi / 6.0) * 0.5 + 0.5
    h = np.where((x // 6 + y // 6) % 2 == 0, 0.55 + 0.45 * warp, 0.55 + 0.45 * weft)
    slub = np.zeros((N, N), np.float32)
    for _ in range(220):
        yy = rng.integers(0, N); L = rng.integers(40, 200); x0 = rng.integers(0, N); slub[yy, (x0 + np.arange(L)) % N] += (rng.random() - 0.5) * 0.35
        xx = rng.integers(0, N); y0 = rng.integers(0, N); slub[(y0 + np.arange(L)) % N, xx] += (rng.random() - 0.5) * 0.35
    h = np.clip(h + slub * 0.25, 0, 1)
    save("cloth.png", 0.80 + 0.20 * h); save("cloth-h.png", h, srgb=False)


def grain():
    N = 1024; f = gauss((N, N), 4.5); ridge = 1 - np.abs(f - gauss((N, N), 9.0) * 0.8)
    save("grain-h.png", np.clip((ridge - ridge.min()) / (ridge.max() - ridge.min()), 0, 1) ** 1.6, srgb=False)


for name, fn in (("wood", wood), ("paper", paper), ("cloth", cloth), ("grain", grain)):
    if name in WANT: fn()
