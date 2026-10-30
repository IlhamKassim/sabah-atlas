"""Write the read API's GET responses as static files for the static site.

    uv run python -m atlas_api.snapshot apps/web/public/api

The site on Cloudflare has no server, so the browser reads these files instead of the live API.
Paths mirror the API, with query strings folded into the path (see the data page's list):
/v1/indicators/{code}?period=2019 becomes /v1/indicators/{code}/2019.json.
"""

from __future__ import annotations

import shutil
import sys
from pathlib import Path

from fastapi.testclient import TestClient

from atlas_api.main import app

ANALYTICS = ["forecast", "scorecard", "typology", "shift_share", "drivers"]


def run(out: Path) -> int:
    if out.exists():
        shutil.rmtree(out)
    client = TestClient(app)
    written = 0

    def save(url: str, rel: str, optional: bool = False):
        nonlocal written
        r = client.get(url)
        if r.status_code == 404 and optional:
            return None
        r.raise_for_status()
        dest = out / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(r.content)
        written += 1
        return r.json() if r.headers.get("content-type", "").startswith("application/json") else None

    meta = save("/v1/meta", "v1/meta.json")
    districts = save("/v1/districts?scope=sabah", "v1/districts.json")
    save("/v1/districts?scope=national", "v1/national/districts.json")
    for d in districts:
        slug = d["slug"]
        save(f"/v1/districts/{slug}", f"v1/districts/{slug}.json")
        save(f"/v1/compare?ids={slug}", f"v1/compare/{slug}.json")
        save(f"/v1/export/{slug}.csv", f"v1/export/{slug}.csv")

    for ind in meta["indicators"]:
        code = ind["code"]
        latest = save(f"/v1/indicators/{code}", f"v1/indicators/{code}.json", optional=True)
        if latest is None:
            continue
        save(f"/v1/indicators/{code}?scope=national", f"v1/national/indicators/{code}.json")
        for p in latest["periods"]:
            save(f"/v1/indicators/{code}?period={p}", f"v1/indicators/{code}/{p}.json")

    for kind in ANALYTICS:
        save(f"/v1/analytics/{kind}", f"v1/analytics/{kind}.json")
    save("/v1/model-cards", "v1/model-cards.json")
    save("/v1/data/releases", "v1/data/releases.json", optional=True)

    lights = save("/v1/lights", "v1/lights.json", optional=True)
    for year in (lights or {}).get("years", []):
        save(f"/v1/lights/{year}.png", f"v1/lights/{year}.png")

    briefs = save("/v1/briefs", "v1/briefs.json", optional=True)
    for b in briefs or []:
        save(f"/v1/briefs/{b['slug']}", f"v1/briefs/{b['slug']}.json", optional=True)
    save("/v1/analyst/eval", "v1/analyst/eval.json", optional=True)
    return written


def main() -> None:
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "apps/web/public/api")
    print(f"Wrote {run(out)} files to {out}")


if __name__ == "__main__":
    main()
