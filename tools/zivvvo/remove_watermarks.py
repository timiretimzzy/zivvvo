"""
Remove primaEd watermarks from Zivvvo images.
Pure Pillow only.

V3: Fixed dark artifacts — limit reversal amount, heavier median blend.
"""

from pathlib import Path
from PIL import Image, ImageFilter
import math

IMAGES_DIR = Path(__file__).parent.parent.parent / "apps" / "web" / "public" / "images"
OUT_DIR = IMAGES_DIR / "clean"


def in_watermark_large(x, y, w, h):
    nx, ny = x / w, y / h
    cx, cy = 0.25, 0.45
    dist = math.sqrt((nx - cx) ** 2 + (ny - cy) ** 2)
    return dist < 0.42


def in_watermark_small(x, y, w, h):
    nx, ny = x / w, y / h
    cx, cy = 0.93, 0.91
    dist = math.sqrt((nx - cx) ** 2 + (ny - cy) ** 2)
    return dist < 0.12


def estimate_alpha(x, y, w, h):
    nx, ny = x / w, y / h
    alpha = 0.0

    cx1, cy1, s1 = 0.25, 0.45, 0.42
    d1 = math.sqrt((nx - cx1) ** 2 + (ny - cy1) ** 2)
    if d1 < s1:
        alpha = max(alpha, (1.0 - d1 / s1) ** 1.2 * 0.45)

    cx2, cy2, s2 = 0.93, 0.91, 0.11
    d2 = math.sqrt((nx - cx2) ** 2 + (ny - cy2) ** 2)
    if d2 < s2:
        alpha = max(alpha, (1.0 - d2 / s2) ** 1.5 * 0.50)

    return min(alpha, 0.50)


def process_image(input_path, output_path):
    img = Image.open(input_path).convert("RGBA")
    w, h = img.size

    # Strong median filter for local color estimation
    median_img = img.filter(ImageFilter.MedianFilter(11))
    med_pixels = median_img.load()

    # Also a lighter blur for smoother reference
    blur_img = img.filter(ImageFilter.GaussianBlur(radius=6))
    blur_pixels = blur_img.load()

    orig_pixels = img.load()
    result = img.copy()
    result_pixels = result.load()

    for y in range(h):
        for x in range(w):
            in_lg = in_watermark_large(x, y, w, h)
            in_sm = in_watermark_small(x, y, w, h)

            if not in_lg and not in_sm:
                continue

            alpha = estimate_alpha(x, y, w, h)
            if alpha < 0.03:
                continue

            r0, g0, b0, a0 = orig_pixels[x, y]

            # Reverse overlay with clamping — never darken below median
            inv = max(1.0 - alpha, 0.01)
            rev_r = (r0 - 255 * alpha) / inv
            rev_g = (g0 - 255 * alpha) / inv
            rev_b = (b0 - 255 * alpha) / inv

            # Local median
            mr, mg, mb, _ = med_pixels[x, y]

            # Local blur
            br, bg, bb, _ = blur_pixels[x, y]

            # Reference = blend of median and blur
            ref_r = (mr * 0.6 + br * 0.4)
            ref_g = (mg * 0.6 + bg * 0.4)
            ref_b = (mb * 0.6 + bb * 0.4)

            # Key fix: never let reversed value go below reference by more than 15
            rev_r = max(rev_r, ref_r - 15)
            rev_g = max(rev_g, ref_g - 15)
            rev_b = max(rev_b, ref_b - 15)

            # Final blend: 55% reversed + 45% reference
            fr = int(max(0, min(255, rev_r * 0.55 + ref_r * 0.45)))
            fg = int(max(0, min(255, rev_g * 0.55 + ref_g * 0.45)))
            fb = int(max(0, min(255, rev_b * 0.55 + ref_b * 0.45)))

            result_pixels[x, y] = (fr, fg, fb, a0)

    result.save(output_path, "PNG")


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    files = sorted(
        f for f in IMAGES_DIR.iterdir()
        if f.suffix.lower() in {".jpg", ".jpeg", ".webp", ".png"}
    )
    print(f"Found {len(files)} images to de-watermark")

    ok = fail = 0
    for i, f in enumerate(files):
        out_name = f.stem + ".png"
        out_path = OUT_DIR / out_name
        try:
            process_image(f, out_path)
            ok += 1
        except Exception as e:
            fail += 1
            print(f"  FAIL: {f.name} — {e}")

        if (i + 1) % 10 == 0:
            print(f"  {i+1}/{len(files)} done")

    print(f"\nComplete: {ok} cleaned, {fail} failed")
    print(f"Output: {OUT_DIR}")


if __name__ == "__main__":
    main()
