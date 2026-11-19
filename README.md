# Recall Box backend

Local-only Go API for the React/Vite frontend. Data is stored in SQLite under
the current user's config directory (`%AppData%/RecallBox/recall-box.db` on
Windows). Set `RECALL_BOX_DATA_DIR` to use another directory.

## Run

```powershell
go run ./cmd/recall-box
```

The app listens on `127.0.0.1:34115`, opens in the browser, and serves the
embedded React app and API from the same address. To package an exe after
changing the frontend, run `./build.ps1`. The SQLite driver is pure Go, so the
build does not need a C compiler. Set `RECALL_BOX_NO_BROWSER=1` to suppress
automatic browser launch.

GORM `AutoMigrate` creates and adds columns/tables at startup; it does not
remove columns when models change.

## API

- `GET /api/health`
- `GET /api/notes?q=search`
- `POST /api/notes` — `{ "title": "...", "content": "...", "format": "markdown|text", "tags": "..." }`
- `GET /api/notes/{id}`
- `PUT /api/notes/{id}` — partial fields: `title`, `content`, `format`, `tags`
- `DELETE /api/notes/{id}` — soft delete
- `GET /api/notes/{id}/cards`
- `POST /api/notes/{id}/cards` — `{ "excerpt": "...", "startOffset": 0, "endOffset": 10, "prompt": "", "answer": "" }`
- `DELETE /api/cards/{id}`
- `GET /api/cards/due`
- `POST /api/cards/{id}/review` — `{ "rating": 1 }`, rating 1–4 maps to Again/Hard/Good/Easy; FSRS updates due date and card state
- `GET /api/reviews/stats` — note/card totals, due count, reviews today

Card offsets are UTF-16 code-unit offsets into the source text, compatible with
browser textarea selection APIs. `excerpt` preserves the selected passage even
if the note is later edited; the backend tries to re-anchor it when the note
changes and marks anchors it cannot find. Both Markdown and plain text remain
raw text in SQLite. The Go `go-fsrs/v4` scheduler uses FSRS-6 defaults with 90%
desired retention, saves the complete card state and review log, and sets new
cards due immediately.
