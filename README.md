# Recall Box backend

Local-only Go API for the React/Vite frontend. Data is stored in SQLite under
the current user's config directory (`%AppData%/RecallBox/recall-box.db` on
Windows). Set `RECALL_BOX_DATA_DIR` to use another directory.

## Run

```powershell
go run ./cmd/recall-box
```

The API listens on `127.0.0.1:34115`. GORM `AutoMigrate` creates and adds
columns/tables at startup; it does not remove columns when models change.

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

Card offsets are UTF-16 code-unit offsets into the source text, compatible with
browser textarea selection APIs. `excerpt` preserves the selected passage even
if the note is later edited. Both Markdown and plain text remain raw text in
SQLite; rendering/editing belongs to the frontend.

FSRS scheduling and the review submission endpoint are the next backend step;
the review history model is already part of the initial schema.
