package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"
	"unicode/utf16"

	"recall-box/internal/model"

	"gorm.io/gorm"
)

type Server struct {
	db  *gorm.DB
	mux *http.ServeMux
}

func New(db *gorm.DB) *Server {
	s := &Server{db: db, mux: http.NewServeMux()}
	s.routes()
	return s
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) { s.mux.ServeHTTP(w, r) }

func (s *Server) routes() {
	s.mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "time": time.Now().UTC()})
	})
	s.mux.HandleFunc("GET /api/notes", s.listNotes)
	s.mux.HandleFunc("POST /api/notes", s.createNote)
	s.mux.HandleFunc("GET /api/notes/{id}", s.getNote)
	s.mux.HandleFunc("PUT /api/notes/{id}", s.updateNote)
	s.mux.HandleFunc("DELETE /api/notes/{id}", s.deleteNote)
	s.mux.HandleFunc("GET /api/notes/{id}/cards", s.listCards)
	s.mux.HandleFunc("POST /api/notes/{id}/cards", s.createCard)
	s.mux.HandleFunc("GET /api/cards/due", s.dueCards)
	s.mux.HandleFunc("DELETE /api/cards/{id}", s.deleteCard)
}

func (s *Server) listNotes(w http.ResponseWriter, r *http.Request) {
	var notes []model.Note
	q := s.db.Order("updated_at desc")
	if search := strings.TrimSpace(r.URL.Query().Get("q")); search != "" {
		like := "%" + strings.ReplaceAll(search, "%", "\\%") + "%"
		q = q.Where("title LIKE ? OR content LIKE ?", like, like)
	}
	if err := q.Find(&notes).Error; err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, notes)
}

func (s *Server) createNote(w http.ResponseWriter, r *http.Request) {
	var note model.Note
	if !decode(w, r, &note) {
		return
	}
	note.Format = normalizeFormat(note.Format)
	if err := s.db.Create(&note).Error; err != nil {
		writeError(w, 500, err)
		return
	}
	writeJSON(w, http.StatusCreated, note)
}

func (s *Server) getNote(w http.ResponseWriter, r *http.Request) {
	var note model.Note
	if err := s.db.First(&note, r.PathValue("id")).Error; err != nil {
		notFoundOrError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, note)
}

func (s *Server) updateNote(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Title   *string `json:"title"`
		Content *string `json:"content"`
		Format  *string `json:"format"`
		Tags    *string `json:"tags"`
	}
	if !decode(w, r, &input) {
		return
	}
	var note model.Note
	if err := s.db.First(&note, r.PathValue("id")).Error; err != nil {
		notFoundOrError(w, err)
		return
	}
	updates := map[string]any{}
	if input.Title != nil {
		updates["title"] = *input.Title
	}
	if input.Content != nil {
		updates["content"] = *input.Content
	}
	if input.Format != nil {
		updates["format"] = normalizeFormat(*input.Format)
	}
	if input.Tags != nil {
		updates["tags"] = *input.Tags
	}
	if err := s.db.Model(&note).Updates(updates).Error; err != nil {
		writeError(w, 500, err)
		return
	}
	s.db.First(&note, note.ID)
	writeJSON(w, http.StatusOK, note)
}

func (s *Server) deleteNote(w http.ResponseWriter, r *http.Request) {
	result := s.db.Delete(&model.Note{}, r.PathValue("id"))
	if result.Error != nil {
		writeError(w, 500, result.Error)
		return
	}
	if result.RowsAffected == 0 {
		writeError(w, 404, errors.New("note not found"))
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) listCards(w http.ResponseWriter, r *http.Request) {
	var cards []model.Card
	if err := s.db.Where("note_id = ?", r.PathValue("id")).Order("created_at desc").Find(&cards).Error; err != nil {
		writeError(w, 500, err)
		return
	}
	writeJSON(w, 200, cards)
}

func (s *Server) createCard(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Excerpt     string `json:"excerpt"`
		StartOffset int    `json:"startOffset"`
		EndOffset   int    `json:"endOffset"`
		Prompt      string `json:"prompt"`
		Answer      string `json:"answer"`
	}
	if !decode(w, r, &input) {
		return
	}
	if strings.TrimSpace(input.Excerpt) == "" || input.StartOffset < 0 || input.EndOffset < input.StartOffset {
		writeError(w, 400, errors.New("excerpt and valid offsets are required"))
		return
	}
	var note model.Note
	if err := s.db.First(&note, r.PathValue("id")).Error; err != nil {
		notFoundOrError(w, err)
		return
	}
	if input.EndOffset > len(utf16.Encode([]rune(note.Content))) {
		writeError(w, 400, errors.New("selection offsets exceed note content"))
		return
	}
	card := model.Card{NoteID: note.ID, Excerpt: input.Excerpt, StartOffset: input.StartOffset, EndOffset: input.EndOffset, Prompt: input.Prompt, Answer: input.Answer}
	if err := s.db.Create(&card).Error; err != nil {
		writeError(w, 500, err)
		return
	}
	writeJSON(w, 201, card)
}

func (s *Server) dueCards(w http.ResponseWriter, r *http.Request) {
	now := time.Now()
	var cards []model.Card
	if err := s.db.Preload("Note").Where("due_at IS NULL OR due_at <= ?", now).Order("due_at asc").Find(&cards).Error; err != nil {
		writeError(w, 500, err)
		return
	}
	writeJSON(w, 200, cards)
}

func (s *Server) deleteCard(w http.ResponseWriter, r *http.Request) {
	result := s.db.Delete(&model.Card{}, r.PathValue("id"))
	if result.Error != nil {
		writeError(w, 500, result.Error)
		return
	}
	if result.RowsAffected == 0 {
		writeError(w, 404, errors.New("card not found"))
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func decode(w http.ResponseWriter, r *http.Request, dst any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 8<<20)
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(dst); err != nil {
		writeError(w, 400, err)
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func writeError(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]string{"error": err.Error()})
}
func notFoundOrError(w http.ResponseWriter, err error) {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		writeError(w, 404, errors.New("record not found"))
	} else {
		writeError(w, 500, err)
	}
}
func normalizeFormat(format string) string {
	if strings.EqualFold(strings.TrimSpace(format), "txt") || strings.EqualFold(strings.TrimSpace(format), "text") {
		return "text"
	}
	return "markdown"
}
