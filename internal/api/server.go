package api

import (
	"gorm.io/gorm"
	"net/http"
	"time"
)

type Server struct {
	db      *gorm.DB
	mux     *http.ServeMux
	dataDir string
}

func New(db *gorm.DB, dataDir string) *Server {
	s := &Server{db: db, mux: http.NewServeMux(), dataDir: dataDir}
	s.routes()
	return s
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) { s.mux.ServeHTTP(w, r) }

func (s *Server) routes() {
	s.mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "time": time.Now().UTC()})
	})
	s.mux.HandleFunc("GET /api/system/data-dir", s.getDataDir)
	s.mux.HandleFunc("POST /api/system/open-data-dir", s.openDataDir)
	s.mux.HandleFunc("POST /api/assets", s.uploadAsset)
	s.mux.HandleFunc("GET /api/assets/{name}", s.getAsset)
	s.mux.HandleFunc("GET /api/notes", s.listNotes)
	s.mux.HandleFunc("POST /api/notes", s.createNote)
	s.mux.HandleFunc("GET /api/notes/{id}", s.getNote)
	s.mux.HandleFunc("PUT /api/notes/{id}", s.updateNote)
	s.mux.HandleFunc("DELETE /api/notes/{id}", s.deleteNote)
	s.mux.HandleFunc("GET /api/diaries", s.listDiaries)
	s.mux.HandleFunc("GET /api/diaries/{date}", s.getDiary)
	s.mux.HandleFunc("PUT /api/diaries/{date}", s.saveDiary)
	s.mux.HandleFunc("DELETE /api/diaries/{date}", s.deleteDiary)
	s.mux.HandleFunc("GET /api/notes/{id}/cards", s.listCards)
	s.mux.HandleFunc("POST /api/notes/{id}/cards", s.createCard)
	s.mux.HandleFunc("POST /api/cards", s.createStandaloneCard)
	s.mux.HandleFunc("GET /api/notes/{id}/annotations", s.listAnnotations)
	s.mux.HandleFunc("POST /api/notes/{id}/annotations", s.createAnnotation)
	s.mux.HandleFunc("GET /api/cards/{id}/annotations", s.listCardAnnotations)
	s.mux.HandleFunc("POST /api/cards/{id}/annotations", s.createCardAnnotation)
	s.mux.HandleFunc("DELETE /api/annotations/{id}", s.deleteAnnotation)
	s.mux.HandleFunc("PUT /api/annotations/{id}", s.updateAnnotation)
	s.mux.HandleFunc("GET /api/cards", s.listAllCards)
	s.mux.HandleFunc("GET /api/cards/due", s.dueCards)
	s.mux.HandleFunc("PUT /api/cards/{id}", s.updateCard)
	s.mux.HandleFunc("DELETE /api/cards/{id}", s.deleteCard)
	s.mux.HandleFunc("POST /api/cards/{id}/review", s.reviewCard)
	s.mux.HandleFunc("GET /api/reviews/history", s.reviewHistory)
	s.mux.HandleFunc("GET /api/reviews/overview", s.reviewOverview)
	s.mux.HandleFunc("GET /api/reviews/stats", s.reviewStats)
	s.mux.HandleFunc("GET /api/settings", s.getSettings)
	s.mux.HandleFunc("PUT /api/settings", s.updateSettings)
}
