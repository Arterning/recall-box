package api

import (
	"encoding/json"
	"errors"
	fsrs "github.com/open-spaced-repetition/go-fsrs/v4"
	"gorm.io/gorm"
	"net/http"
	"recall-box/internal/model"
	"strconv"
	"time"
)

func (s *Server) reviewCard(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Rating   int    `json:"rating"`
		Response string `json:"response"`
	}
	if !decode(w, r, &input) {
		return
	}
	if input.Rating < int(fsrs.Again) || input.Rating > int(fsrs.Easy) {
		writeError(w, 400, errors.New("rating must be between 1 (Again) and 4 (Easy)"))
		return
	}
	id, err := strconv.ParseUint(r.PathValue("id"), 10, 32)
	if err != nil {
		writeError(w, 400, errors.New("invalid card id"))
		return
	}
	var card model.Card
	if err := s.db.First(&card, uint(id)).Error; err != nil {
		notFoundOrError(w, err)
		return
	}
	var state fsrs.Card
	if card.FSRSState == "" {
		state = fsrs.NewCard(card.CreatedAt)
	} else if err := json.Unmarshal([]byte(card.FSRSState), &state); err != nil {
		writeError(w, 500, errors.New("could not read card scheduling state"))
		return
	}
	now := time.Now()
	retention, err := s.desiredRetention()
	if err != nil {
		writeError(w, 500, err)
		return
	}
	params := fsrs.DefaultParam()
	params.RequestRetention = retention
	scheduled, err := fsrs.NewFSRS(params).Next(state, now, fsrs.Rating(input.Rating))
	if err != nil {
		writeError(w, 400, err)
		return
	}
	stateJSON, err := json.Marshal(scheduled.Card)
	if err != nil {
		writeError(w, 500, err)
		return
	}
	fsrsLogJSON, err := json.Marshal(scheduled.ReviewLog)
	if err != nil {
		writeError(w, 500, err)
		return
	}
	dueBefore := card.DueAt
	dueAfter := scheduled.Card.Due
	logEntry := model.ReviewLog{CardID: card.ID, Rating: input.Rating, Response: input.Response, ReviewedAt: now, DueBefore: dueBefore, DueAfter: &dueAfter, FSRSLog: string(fsrsLogJSON)}
	err = s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&card).Updates(map[string]any{"fsrs_state": string(stateJSON), "due_at": dueAfter}).Error; err != nil {
			return err
		}
		return tx.Create(&logEntry).Error
	})
	if err != nil {
		writeError(w, 500, err)
		return
	}
	card.FSRSState = string(stateJSON)
	card.DueAt = &dueAfter
	card = normalizeCard(card)
	writeJSON(w, 200, map[string]any{"card": card, "review": logEntry, "dueAt": dueAfter})
}

func (s *Server) reviewHistory(w http.ResponseWriter, r *http.Request) {
	type historyItem struct {
		ID              uint      `json:"id"`
		CardID          uint      `json:"cardId"`
		Rating          int       `json:"rating"`
		Response        string    `json:"response"`
		ReviewedAt      time.Time `json:"reviewedAt"`
		Question        string    `json:"question"`
		Excerpt         string    `json:"excerpt"`
		NoteTitle       string    `json:"noteTitle"`
		NoteID          *uint     `json:"-"`
		ContextOverride string    `json:"-"`
		NoteText        string    `json:"-"`
		StartOffset     int       `json:"-"`
		EndOffset       int       `json:"-"`
	}
	var history []historyItem
	err := s.db.Table("review_logs").
		Select("review_logs.id, review_logs.card_id, review_logs.rating, review_logs.response, review_logs.reviewed_at, cards.question, cards.excerpt, cards.note_id, cards.context_override, cards.start_offset, cards.end_offset, notes.content AS note_text, notes.title AS note_title").
		Joins("LEFT JOIN cards ON cards.id = review_logs.card_id").
		Joins("LEFT JOIN notes ON notes.id = cards.note_id").
		Order("review_logs.reviewed_at desc").
		Limit(500).
		Scan(&history).Error
	if err != nil {
		writeError(w, 500, err)
		return
	}
	if history == nil {
		history = []historyItem{}
	}
	for i := range history {
		if history[i].ContextOverride != "" {
			history[i].Excerpt = history[i].ContextOverride
		} else if history[i].NoteID != nil {
			history[i].Excerpt = clozeExcerpt(history[i].NoteText, history[i].StartOffset, history[i].EndOffset)
		} else {
			history[i].NoteTitle = "鐙珛鍗＄墖"
		}
	}
	writeJSON(w, 200, history)
}

func (s *Server) reviewOverview(w http.ResponseWriter, r *http.Request) {
	type daySummary struct {
		Date  string `json:"date"`
		Count int    `json:"count"`
		Good  int    `json:"good"`
	}
	type ratingSummary struct {
		Rating int `json:"rating"`
		Count  int `json:"count"`
	}
	type recentItem struct {
		ID              uint      `json:"id"`
		CardID          uint      `json:"cardId"`
		Rating          int       `json:"rating"`
		Response        string    `json:"response"`
		ReviewedAt      time.Time `json:"reviewedAt"`
		Question        string    `json:"question"`
		Excerpt         string    `json:"excerpt"`
		NoteTitle       string    `json:"noteTitle"`
		NoteID          *uint     `json:"-"`
		ContextOverride string    `json:"-"`
		NoteText        string    `json:"-"`
		StartOffset     int       `json:"-"`
		EndOffset       int       `json:"-"`
	}
	now := time.Now()
	location := now.Location()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, location)
	firstDay := today.AddDate(0, 0, -29)
	var totalReviews int64
	if err := s.db.Model(&model.ReviewLog{}).Count(&totalReviews).Error; err != nil {
		writeError(w, 500, err)
		return
	}
	var reviewedToday int64
	if err := s.db.Model(&model.ReviewLog{}).Where("reviewed_at >= ?", today).Count(&reviewedToday).Error; err != nil {
		writeError(w, 500, err)
		return
	}
	var notes, cards, due int64
	if err := s.db.Model(&model.Note{}).Count(&notes).Error; err != nil {
		writeError(w, 500, err)
		return
	}
	if err := s.db.Model(&model.Card{}).Count(&cards).Error; err != nil {
		writeError(w, 500, err)
		return
	}
	if err := s.db.Model(&model.Card{}).Where("due_at IS NULL OR due_at <= ?", now).Count(&due).Error; err != nil {
		writeError(w, 500, err)
		return
	}
	type noteDaySummary struct {
		Date  string `json:"date"`
		Count int    `json:"count"`
	}
	noteDays := make([]noteDaySummary, 365)
	noteDayIndexes := make(map[string]int, len(noteDays))
	noteStart := today.AddDate(0, 0, -364)
	for i := range noteDays {
		date := noteStart.AddDate(0, 0, i).Format("2006-01-02")
		noteDays[i] = noteDaySummary{Date: date}
		noteDayIndexes[date] = i
	}
	var noteCreatedRows []struct {
		CreatedAt time.Time
	}
	if err := s.db.Model(&model.Note{}).Select("created_at").Where("created_at >= ?", noteStart).Find(&noteCreatedRows).Error; err != nil {
		writeError(w, 500, err)
		return
	}
	for _, row := range noteCreatedRows {
		if index, ok := noteDayIndexes[row.CreatedAt.In(location).Format("2006-01-02")]; ok {
			noteDays[index].Count++
		}
	}
	var average float64
	if totalReviews > 0 {
		if err := s.db.Model(&model.ReviewLog{}).Select("AVG(rating)").Scan(&average).Error; err != nil {
			writeError(w, 500, err)
			return
		}
	}
	days := make([]daySummary, 30)
	dayIndexes := make(map[string]int, 30)
	for i := range days {
		date := firstDay.AddDate(0, 0, i).Format("2006-01-02")
		days[i] = daySummary{Date: date}
		dayIndexes[date] = i
	}
	var recentLogs []model.ReviewLog
	if err := s.db.Select("rating, reviewed_at").Where("reviewed_at >= ?", firstDay).Find(&recentLogs).Error; err != nil {
		writeError(w, 500, err)
		return
	}
	for _, log := range recentLogs {
		index, ok := dayIndexes[log.ReviewedAt.In(location).Format("2006-01-02")]
		if !ok {
			continue
		}
		days[index].Count++
		if log.Rating >= 3 {
			days[index].Good++
		}
	}
	var ratingRows []ratingSummary
	if err := s.db.Table("review_logs").Select("rating, COUNT(*) AS count").Group("rating").Scan(&ratingRows).Error; err != nil {
		writeError(w, 500, err)
		return
	}
	ratings := map[string]int64{"1": 0, "2": 0, "3": 0, "4": 0}
	for _, row := range ratingRows {
		ratings[strconv.Itoa(row.Rating)] = int64(row.Count)
	}
	var recent []recentItem
	if err := s.db.Table("review_logs").
		Select("review_logs.id, review_logs.card_id, review_logs.rating, review_logs.response, review_logs.reviewed_at, cards.question, cards.excerpt, cards.note_id, cards.context_override, cards.start_offset, cards.end_offset, notes.content AS note_text, notes.title AS note_title").
		Joins("LEFT JOIN cards ON cards.id = review_logs.card_id").
		Joins("LEFT JOIN notes ON notes.id = cards.note_id").
		Order("review_logs.reviewed_at desc").Limit(8).Scan(&recent).Error; err != nil {
		writeError(w, 500, err)
		return
	}
	for i := range recent {
		if recent[i].ContextOverride != "" {
			recent[i].Excerpt = recent[i].ContextOverride
		} else if recent[i].NoteID != nil {
			recent[i].Excerpt = clozeExcerpt(recent[i].NoteText, recent[i].StartOffset, recent[i].EndOffset)
		} else {
			recent[i].NoteTitle = "鐙珛鍗＄墖"
		}
	}
	writeJSON(w, 200, map[string]any{
		"summary": map[string]any{"notes": notes, "cards": cards, "due": due, "totalReviews": totalReviews, "reviewedToday": reviewedToday, "reviewsLast30Days": len(recentLogs), "averageRating": average},
		"days":    days, "noteDays": noteDays, "ratings": ratings, "recent": recent,
	})
}

func (s *Server) reviewStats(w http.ResponseWriter, r *http.Request) {
	now := time.Now()
	var notes, cards, due, reviewed int64
	if err := s.db.Model(&model.Note{}).Count(&notes).Error; err != nil {
		writeError(w, 500, err)
		return
	}
	if err := s.db.Model(&model.Card{}).Count(&cards).Error; err != nil {
		writeError(w, 500, err)
		return
	}
	if err := s.db.Model(&model.Card{}).Where("due_at IS NULL OR due_at <= ?", now).Count(&due).Error; err != nil {
		writeError(w, 500, err)
		return
	}
	start := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	if err := s.db.Model(&model.ReviewLog{}).Where("reviewed_at >= ?", start).Count(&reviewed).Error; err != nil {
		writeError(w, 500, err)
		return
	}
	writeJSON(w, 200, map[string]int64{"notes": notes, "cards": cards, "due": due, "reviewedToday": reviewed})
}
