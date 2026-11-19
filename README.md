# Recall Box

Local Go desktop application with a React/Vite frontend and SQLite storage.
Data is stored in the current user's config directory
(`%AppData%/RecallBox/recall-box.db` on Windows). Set `RECALL_BOX_DATA_DIR` to
use another directory.

## Development

```powershell
go run ./cmd/server
```

This starts the HTTP backend on an available loopback port and opens the app in
the browser. The root `dev.bat` pins the backend to `127.0.0.1:34115` to match
the Vite proxy in `web/vite.config.ts`. Set `RECALL_BOX_NO_BROWSER=1` to
suppress automatic browser launch.

## Desktop build

Run `./build.ps1` to embed the React frontend and build `dist/recall-box.exe`
from `cmd/desktop`. The executable starts the HTTP backend on an available
local port and opens a Wails window; frontend and backend continue to
communicate over HTTP. Windows requires the WebView2 runtime.

GORM `AutoMigrate` creates and adds columns/tables at startup; it does not
remove columns when models change.

## API

- `GET /api/health`
- `GET /api/notes?q=search`
- `POST /api/notes` — `{ "title": "...", "content": "...", "format": "markdown", "tags": "..." }`
- `GET /api/notes/{id}`
- `PUT /api/notes/{id}` — partial fields: `title`, `content`, `format`, `tags`
- `DELETE /api/notes/{id}` — soft delete
- `GET /api/notes/{id}/cards`
- `POST /api/notes/{id}/cards` — `{ "excerpt": "...", "sourceText": "...", "startOffset": 0, "endOffset": 10, "question": "...", "answer": "..." }`
- `GET /api/notes/{id}/annotations`
- `POST /api/notes/{id}/annotations` — selected text, source offsets, and comment
- `DELETE /api/annotations/{id}`
- `DELETE /api/cards/{id}`
- `GET /api/cards/due`
- `POST /api/cards/{id}/review` — `{ "rating": 1 }`, rating 1–4 maps to Again/Hard/Good/Easy; FSRS updates due date and card state
- `GET /api/reviews/stats` — note/card totals, due count, reviews today

Card and annotation offsets are UTF-16 code-unit offsets into the Markdown
source, compatible with browser selection APIs. `excerpt` stores the visible
selection while `sourceText` stores the Markdown source range. On edits, the
backend attempts to re-anchor both cards and annotations. Notes are rendered as
Markdown. The Go `go-fsrs/v4` scheduler uses FSRS-6 defaults with 90%
desired retention, saves the complete card state and review log, and sets new
cards due immediately.
