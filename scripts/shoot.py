"""Full-page screenshots for visual review: uv run python scripts/shoot.py /path [/path ...]"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(sys.argv[1]) if sys.argv[1].startswith("/private") or sys.argv[1].startswith("/tmp") else None
paths = sys.argv[2:] if OUT else sys.argv[1:]
OUT = OUT or Path("/tmp")
width = 1440
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": width, "height": 900}, device_scale_factor=1)
    for path in paths:
        w = width
        if "@" in path:
            path, w = path.split("@")
            pg.set_viewport_size({"width": int(w), "height": 900})
        pg.goto(f"http://localhost:3000{path}", wait_until="networkidle")
        pg.wait_for_timeout(600)
        name = (path.strip("/").replace("/", "_").replace("?", "_") or "home") + f"_{w}.png"
        pg.screenshot(path=str(OUT / name), full_page=True)
        print(OUT / name)
        pg.set_viewport_size({"width": width, "height": 900})
    b.close()
