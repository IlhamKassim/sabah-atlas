# SabahKu: web app

Next.js (App Router), exported as static files (`out/`). Pages are rendered at build time from the atlas API (`ATLAS_API_URL`, default http://localhost:8000); in the browser, pages read the static JSON that `python -m atlas_api.snapshot` writes to `public/api`, or the live API when `NEXT_PUBLIC_ATLAS_API_URL` is set (development). See the repository README.
