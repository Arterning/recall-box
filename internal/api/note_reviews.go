package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	fsrs "github.com/open-spaced-repetition/go-fsrs/v4"
	"gorm.io/gorm"
	"recall-box/internal/model"
)

func (s *Server) enrollNoteReview(w http.ResponseWriter, r *http.Request) {
	var note model.Note
	if err := s.db.First(&note, r.PathValue("id")).Error; err != nil {
		notFoundOrError(w, err)
		return
	}
	if !note.ReviewEnabled {
		now := time.Now()
		state := fsrs.NewCard(now)
		if note.FSRSState != "" {
			if err := json.Unmarshal([]byte(note.FSRSState), &state); err != nil {
				writeError(w, http.StatusInternalServerError, errors.New("could not read note scheduling state"))
				return
			}
		}
		state.Due = now
		stateJSON, err := json.Marshal(state)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		if err := s.db.Model(&note).Updates(map[string]any{
			"review_enabled": true,
			"review_due_at":  now,
			"fsrs_state":     string(stateJSON),
		}).Error; err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
	}
	if err := s.db.First(&note, note.ID).Error; err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, note)
}

func (s *Server) unenrollNoteReview(w http.ResponseWriter, r *http.Request) {
	var note model.Note
	if err := s.db.First(&note, r.PathValue("id")).Error; err != nil {
		notFoundOrError(w, err)
		return
	}
	if err := s.db.Model(&note).Updates(map[string]any{
		"review_enabled": false,
		"review_due_at":  nil,
	}).Error; err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	if err := s.db.First(&note, note.ID).Error; err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, note)
}

func (s *Server) dueNotes(w http.ResponseWriter, r *http.Request) {
	now := time.Now()
	var notes []model.Note
	if err := s.db.Where("review_enabled = ? AND (review_due_at IS NULL OR review_due_at <= ?)", true, now).
		Order("review_due_at asc").Order("id asc").Find(&notes).Error; err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	if rawID := r.URL.Query().Get("noteId"); rawID != "" {
		id, err := strconv.ParseUint(rawID, 10, 32)
		if err != nil {
			writeError(w, http.StatusBadRequest, errors.New("invalid note id"))
			return
		}
		var requested model.Note
		if err := s.db.Where("id = ? AND review_enabled = ?", uint(id), true).First(&requested).Error; err == nil {
			found := false
			for _, note := range notes {
				if note.ID == requested.ID {
					found = true
					break
				}
			}
			if !found {
				notes = append([]model.Note{requested}, notes...)
			}
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
	}
	if notes == nil {
		notes = []model.Note{}
	}
	writeJSON(w, http.StatusOK, notes)
}

func (s *Server) reviewNote(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Rating *int `json:"rating"`
	}
	if !decode(w, r, &input) {
		return
	}
	if input.Rating != nil && (*input.Rating < int(fsrs.Again) || *input.Rating > int(fsrs.Easy)) {
		writeError(w, http.StatusBadRequest, errors.New("rating must be between 1 (Again) and 4 (Easy)"))
		return
	}
	var note model.Note
	if err := s.db.First(&note, r.PathValue("id")).Error; err != nil {
		notFoundOrError(w, err)
		return
	}
	if !note.ReviewEnabled {
		writeError(w, http.StatusBadRequest, errors.New("note is not enrolled in review"))
		return
	}
	now := time.Now()
	logEntry := model.NoteReviewLog{NoteID: note.ID, Rating: input.Rating, ReviewedAt: now, DueBefore: note.ReviewDueAt, DueAfter: note.ReviewDueAt}
	updates := map[string]any{}
	if input.Rating != nil {
		var state fsrs.Card
		if note.FSRSState == "" {
			state = fsrs.NewCard(note.CreatedAt)
		} else if err := json.Unmarshal([]byte(note.FSRSState), &state); err != nil {
			writeError(w, http.StatusInternalServerError, errors.New("could not read note scheduling state"))
			return
		}
		retention, err := s.desiredRetention()
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		params := fsrs.DefaultParam()
		params.RequestRetention = retention
		scheduled, err := fsrs.NewFSRS(params).Next(state, now, fsrs.Rating(*input.Rating))
		if err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		stateJSON, err := json.Marshal(scheduled.Card)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		fsrsLog, err := json.Marshal(scheduled.ReviewLog)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		dueAfter := scheduled.Card.Due
		logEntry.DueAfter = &dueAfter
		logEntry.FSRSLog = string(fsrsLog)
		updates["fsrs_state"] = string(stateJSON)
		updates["review_due_at"] = dueAfter
	}
	if err := s.db.Transaction(func(tx *gorm.DB) error {
		if len(updates) > 0 {
			if err := tx.Model(&note).Updates(updates).Error; err != nil {
				return err
			}
		}
		return tx.Create(&logEntry).Error
	}); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	if err := s.db.First(&note, note.ID).Error; err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"note": note, "review": logEntry})
}
