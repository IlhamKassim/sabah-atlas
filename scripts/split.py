"""Split a tall screenshot into half-scale parts for review."""
import sys

from PIL import Image

src = sys.argv[1]
im = Image.open(src)
w, h = im.size
step = int(sys.argv[2]) if len(sys.argv) > 2 else 1800
for i, top in enumerate(range(0, h, step)):
    bottom = min(h, top + step)
    im.crop((0, top, w, bottom)).resize((w // 2, (bottom - top) // 2)).save(src.replace(".png", f"_p{i}.png"))
    print(src.replace(".png", f"_p{i}.png"))
