package api

import (
	"encoding/json"
	"gorm.io/gorm"
	"net/http"
	"recall-box/internal/model"
	"strconv"
	"strings"
	"time"

	fsrs "github.com/open-spaced-repetition/go-fsrs/v4"
)

func (s *Server) listNotes(w http.ResponseWriter, r *http.Request) {
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}
	pageSize, _ := strconv.Atoi(r.URL.Query().Get("pageSize"))
	if pageSize < 1 {
		pageSize = 30
	}
	if pageSize > 100 {
		pageSize = 100
	}
	var notes []model.Note
	q := s.db.Model(&model.Note{}).Order("updated_at desc").Order("id desc")
	if search := strings.TrimSpace(r.URL.Query().Get("q")); search != "" {
		like := "%" + strings.ReplaceAll(search, "%", "\\%") + "%"
		q = q.Where("title LIKE ? OR content LIKE ?", like, like)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	if err := q.Offset((page - 1) * pageSize).Limit(pageSize).Find(&notes).Error; err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	for i := range notes {
		if notes[i].ReviewEnabled {
			priority := noteReviewPriority(notes[i], time.Now())
			notes[i].ReviewPriority = &priority
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": notes, "total": total, "page": page, "pageSize": pageSize})
}

// noteReviewPriority combines FSRS difficulty, review experience, and due date
// into a 0-4 visual priority. It is derived for API responses, never persisted.
func noteReviewPriority(note model.Note, now time.Time) int {
	priority := 0
	var state fsrs.Card
	if note.FSRSState != "" && json.Unmarshal([]byte(note.FSRSState), &state) == nil {
		switch {
		case state.Difficulty >= 8:
			priority += 2
		case state.Difficulty >= 6:
			priority++
		}
		if state.Reps < 2 {
			priority += 2
		} else if state.Reps < 5 {
			priority++
		}
	} else {
		// An enrolled note without readable FSRS state is treated as new.
		priority += 2
	}
	if note.ReviewDueAt == nil || !note.ReviewDueAt.After(now) {
		overdueDays := 0
		if note.ReviewDueAt != nil {
			overdueDays = int(now.Sub(*note.ReviewDueAt).Hours() / 24)
		}
		if overdueDays >= 7 {
			priority += 2
		} else if overdueDays >= 3 {
			priority++
		}
	}
	if priority > 4 {
		return 4
	}
	return priority
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
	err := s.db.Transaction(func(tx *gorm.DB) error {
		if input.Content != nil && *input.Content != note.Content {
			var cards []model.Card
			if err := tx.Where("note_id = ?", note.ID).Find(&cards).Error; err != nil {
				return err
			}
			for _, card := range cards {
				anchor := card.SourceText
				if anchor == "" {
					anchor = card.Excerpt
				}
				start, end, found := findAnchor(*input.Content, anchor, card.StartOffset)
				if err := tx.Model(&card).Updates(map[string]any{"start_offset": start, "end_offset": end, "anchor_valid": found}).Error; err != nil {
					return err
				}
			}
			var annotations []model.Annotation
			if err := tx.Where("note_id = ?", note.ID).Find(&annotations).Error; err != nil {
				return err
			}
			for _, annotation := range annotations {
				anchor := annotation.SourceText
				if anchor == "" {
					anchor = annotation.Excerpt
				}
				start, end, found := findAnchor(*input.Content, anchor, annotation.StartOffset)
				if err := tx.Model(&annotation).Updates(map[string]any{"start_offset": start, "end_offset": end, "anchor_valid": found}).Error; err != nil {
					return err
				}
			}
		}
		return tx.Model(&note).Updates(updates).Error
	})
	if err != nil {
		writeError(w, 500, err)
		return
	}
	s.db.First(&note, note.ID)
	writeJSON(w, http.StatusOK, note)
}

func (s *Server) deleteNote(w http.ResponseWriter, r *http.Request) {
	var note model.Note
	if err := s.db.First(&note, r.PathValue("id")).Error; err != nil {
		notFoundOrError(w, err)
		return
	}
	err := s.db.Transaction(func(tx *gorm.DB) error {
		cardIDs := tx.Model(&model.Card{}).Select("id").Where("note_id = ?", note.ID)
		if err := tx.Where("card_id IN (?)", cardIDs).Delete(&model.Annotation{}).Error; err != nil {
			return err
		}
		if err := tx.Where("note_id = ?", note.ID).Delete(&model.Card{}).Error; err != nil {
			return err
		}
		if err := tx.Where("note_id = ?", note.ID).Delete(&model.Annotation{}).Error; err != nil {
			return err
		}
		return tx.Delete(&note).Error
	})
	if err != nil {
		writeError(w, 500, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
