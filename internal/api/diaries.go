package api

import (
	"errors"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"net/http"
	"recall-box/internal/model"
	"strings"
	"time"
)

func (s *Server) listDiaries(w http.ResponseWriter, r *http.Request) {
	month := r.URL.Query().Get("month")
	if month == "" {
		month = time.Now().Format("2006-01")
	}
	start, err := time.Parse("2006-01", month)
	if err != nil {
		writeError(w, 400, errors.New("month must use YYYY-MM format"))
		return
	}
	end := start.AddDate(0, 1, 0)
	var entries []model.DiaryEntry
	if err := s.db.Where("entry_date >= ? AND entry_date < ?", start.Format("2006-01-02"), end.Format("2006-01-02")).Order("entry_date desc").Find(&entries).Error; err != nil {
		writeError(w, 500, err)
		return
	}
	type diarySummary struct {
		ID        uint      `json:"id"`
		Date      string    `json:"date"`
		Excerpt   string    `json:"excerpt"`
		UpdatedAt time.Time `json:"updatedAt"`
	}
	result := make([]diarySummary, 0, len(entries))
	for _, entry := range entries {
		excerpt := strings.TrimSpace(strings.ReplaceAll(entry.Content, "\n", " "))
		runes := []rune(excerpt)
		if len(runes) > 90 {
			excerpt = string(runes[:90]) + "…"
		}
		result = append(result, diarySummary{ID: entry.ID, Date: entry.EntryDate, Excerpt: excerpt, UpdatedAt: entry.UpdatedAt})
	}
	writeJSON(w, 200, result)
}

func (s *Server) getDiary(w http.ResponseWriter, r *http.Request) {
	date := r.PathValue("date")
	if _, err := time.Parse("2006-01-02", date); err != nil {
		writeError(w, 400, errors.New("date must use YYYY-MM-DD format"))
		return
	}
	var entry model.DiaryEntry
	err := s.db.Where("entry_date = ?", date).First(&entry).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		writeJSON(w, 200, model.DiaryEntry{EntryDate: date})
		return
	}
	if err != nil {
		writeError(w, 500, err)
		return
	}
	writeJSON(w, 200, entry)
}

func (s *Server) saveDiary(w http.ResponseWriter, r *http.Request) {
	date := r.PathValue("date")
	if _, err := time.Parse("2006-01-02", date); err != nil {
		writeError(w, 400, errors.New("date must use YYYY-MM-DD format"))
		return
	}
	var input struct {
		Content string `json:"content"`
	}
	if !decode(w, r, &input) {
		return
	}
	entry := model.DiaryEntry{EntryDate: date, Content: input.Content}
	if err := s.db.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "entry_date"}}, DoUpdates: clause.AssignmentColumns([]string{"content", "updated_at"})}).Create(&entry).Error; err != nil {
		writeError(w, 500, err)
		return
	}
	if err := s.db.Where("entry_date = ?", date).First(&entry).Error; err != nil {
		writeError(w, 500, err)
		return
	}
	writeJSON(w, 200, entry)
}

func (s *Server) deleteDiary(w http.ResponseWriter, r *http.Request) {
	date := r.PathValue("date")
	result := s.db.Where("entry_date = ?", date).Delete(&model.DiaryEntry{})
	if result.Error != nil {
		writeError(w, 500, result.Error)
		return
	}
	if result.RowsAffected == 0 {
		writeError(w, 404, errors.New("diary entry not found"))
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
