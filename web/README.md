# web/ (Vite app, owned by PW Product & UX)
Place the Vite project here (`web/package.json` with a `build` script that outputs `web/dist`).
The Express server serves `web/dist` and the Dockerfile builds it automatically.
Call the API with same-origin `fetch('/api/...')`; see REPO.md / README.md for contracts.
