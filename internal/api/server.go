package api

import (
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf16"

	fsrs "github.com/open-spaced-repetition/go-fsrs/v4"
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
	s.mux.HandleFunc("POST /api/cards", s.createStandaloneCard)
	s.mux.HandleFunc("GET /api/notes/{id}/annotations", s.listAnnotations)
	s.mux.HandleFunc("POST /api/notes/{id}/annotations", s.createAnnotation)
	s.mux.HandleFunc("DELETE /api/annotations/{id}", s.deleteAnnotation)
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

func (s *Server) listCards(w http.ResponseWriter, r *http.Request) {
	var note model.Note
	if err := s.db.First(&note, r.PathValue("id")).Error; err != nil {
		notFoundOrError(w, err)
		return
	}
	var cards []model.Card
	if err := s.db.Where("note_id = ?", r.PathValue("id")).Order("created_at desc").Find(&cards).Error; err != nil {
		writeError(w, 500, err)
		return
	}
	for i := range cards {
		cards[i] = normalizeCard(cards[i])
		cards[i].Excerpt = resolveCardContext(cards[i], note.Content)
	}
	writeJSON(w, 200, cards)
}

func (s *Server) createCard(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Excerpt     string `json:"excerpt"`
		SourceText  string `json:"sourceText"`
		StartOffset int    `json:"startOffset"`
		EndOffset   int    `json:"endOffset"`
		Question    string `json:"question"`
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
	if input.SourceText == "" {
		input.SourceText = input.Excerpt
	}
	if input.EndOffset == input.StartOffset || len(utf16.Encode([]rune(input.SourceText))) != input.EndOffset-input.StartOffset || sliceUTF16(note.Content, input.StartOffset, input.EndOffset) != input.SourceText {
		writeError(w, 400, errors.New("selection text and offsets do not match"))
		return
	}
	question := strings.TrimSpace(input.Question)
	if question == "" {
		question = strings.TrimSpace(input.Prompt)
	}
	if question == "" {
		writeError(w, 400, errors.New("question is required"))
		return
	}
	answer := strings.TrimSpace(input.Answer)
	if answer == "" {
		answer = input.SourceText
	}
	card := model.Card{NoteID: &note.ID, Excerpt: clozeExcerpt(note.Content, input.StartOffset, input.EndOffset), SourceText: input.SourceText, StartOffset: input.StartOffset, EndOffset: input.EndOffset, AnchorValid: true, Question: question, Prompt: input.Prompt, Answer: answer}
	now := time.Now()
	state, err := json.Marshal(fsrs.NewCard(now))
	if err != nil {
		writeError(w, 500, err)
		return
	}
	card.FSRSState = string(state)
	card.DueAt = &now
	if err := s.db.Create(&card).Error; err != nil {
		writeError(w, 500, err)
		return
	}
	writeJSON(w, 201, card)
}

func (s *Server) createStandaloneCard(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Question string `json:"question"`
		Answer   string `json:"answer"`
		Context  string `json:"context"`
		Excerpt  string `json:"excerpt"`
	}
	if !decode(w, r, &input) {
		return
	}
	question := strings.TrimSpace(input.Question)
	answer := strings.TrimSpace(input.Answer)
	context := strings.TrimSpace(input.Context)
	if context == "" {
		context = strings.TrimSpace(input.Excerpt)
	}
	if question == "" || answer == "" {
		writeError(w, 400, errors.New("question and answer are required"))
		return
	}
	card := model.Card{Question: question, Answer: answer, Excerpt: context, AnchorValid: false}
	now := time.Now()
	state, err := json.Marshal(fsrs.NewCard(now))
	if err != nil {
		writeError(w, 500, err)
		return
	}
	card.FSRSState = string(state)
	card.DueAt = &now
	if err := s.db.Create(&card).Error; err != nil {
		writeError(w, 500, err)
		return
	}
	type cardItem struct {
		model.Card
		NoteTitle  string `json:"noteTitle"`
		NoteFormat string `json:"noteFormat"`
	}
	writeJSON(w, 201, cardItem{Card: card, NoteTitle: "独立卡片", NoteFormat: "markdown"})
}

func (s *Server) updateCard(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Question *string `json:"question"`
		Answer   *string `json:"answer"`
		Context  *string `json:"context"`
	}
	if !decode(w, r, &input) {
		return
	}
	var card model.Card
	if err := s.db.First(&card, r.PathValue("id")).Error; err != nil {
		notFoundOrError(w, err)
		return
	}
	updates := map[string]any{}
	if input.Question != nil {
		question := strings.TrimSpace(*input.Question)
		if question == "" {
			writeError(w, 400, errors.New("question is required"))
			return
		}
		updates["question"] = question
	}
	if input.Answer != nil {
		answer := strings.TrimSpace(*input.Answer)
		if answer == "" {
			writeError(w, 400, errors.New("answer is required"))
			return
		}
		updates["answer"] = answer
	}
	if input.Context != nil {
		contextText := strings.TrimSpace(*input.Context)
		if card.NoteID == nil {
			updates["excerpt"] = contextText
		} else {
			updates["context_override"] = contextText
		}
	}
	if len(updates) > 0 {
		if err := s.db.Model(&card).Updates(updates).Error; err != nil {
			writeError(w, 500, err)
			return
		}
	}
	if err := s.db.Preload("Note").First(&card, card.ID).Error; err != nil {
		writeError(w, 500, err)
		return
	}
	card = normalizeCard(card)
	card.Excerpt = resolveCardContext(card, card.Note.Content)
	noteTitle, noteFormat := card.Note.Title, card.Note.Format
	if card.NoteID == nil {
		noteTitle, noteFormat = "独立卡片", "markdown"
	}
	type cardItem struct {
		model.Card
		NoteTitle  string `json:"noteTitle"`
		NoteFormat string `json:"noteFormat"`
	}
	writeJSON(w, 200, cardItem{Card: card, NoteTitle: noteTitle, NoteFormat: noteFormat})
}

func (s *Server) listAnnotations(w http.ResponseWriter, r *http.Request) {
	var annotations []model.Annotation
	if err := s.db.Where("note_id = ?", r.PathValue("id")).Order("created_at desc").Find(&annotations).Error; err != nil {
		writeError(w, 500, err)
		return
	}
	writeJSON(w, 200, annotations)
}

func (s *Server) listAllCards(w http.ResponseWriter, r *http.Request) {
	var cards []model.Card
	query := s.db.Joins("LEFT JOIN notes ON notes.id = cards.note_id AND notes.deleted_at IS NULL").Preload("Note")
	if search := strings.TrimSpace(r.URL.Query().Get("q")); search != "" {
		like := "%" + strings.ReplaceAll(strings.ReplaceAll(search, "%", "\\%"), "_", "\\_") + "%"
		query = query.Where("cards.question LIKE ? OR cards.answer LIKE ? OR cards.excerpt LIKE ? OR cards.context_override LIKE ? OR notes.title LIKE ?", like, like, like, like, like)
	}
	if err := query.Order("cards.due_at asc").Find(&cards).Error; err != nil {
		writeError(w, 500, err)
		return
	}
	type cardItem struct {
		model.Card
		NoteTitle  string `json:"noteTitle"`
		NoteFormat string `json:"noteFormat"`
	}
	result := make([]cardItem, 0, len(cards))
	for _, card := range cards {
		card = normalizeCard(card)
		card.Excerpt = resolveCardContext(card, card.Note.Content)
		result = append(result, cardItem{Card: card, NoteTitle: card.Note.Title, NoteFormat: card.Note.Format})
	}
	writeJSON(w, 200, result)
}

func (s *Server) createAnnotation(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Excerpt     string `json:"excerpt"`
		SourceText  string `json:"sourceText"`
		StartOffset int    `json:"startOffset"`
		EndOffset   int    `json:"endOffset"`
		Comment     string `json:"comment"`
	}
	if !decode(w, r, &input) {
		return
	}
	if strings.TrimSpace(input.Excerpt) == "" || input.StartOffset < 0 || input.EndOffset <= input.StartOffset {
		writeError(w, 400, errors.New("selected text and valid offsets are required"))
		return
	}
	if input.SourceText == "" {
		input.SourceText = input.Excerpt
	}
	if len(utf16.Encode([]rune(input.SourceText))) != input.EndOffset-input.StartOffset {
		writeError(w, 400, errors.New("source text and offsets do not match"))
		return
	}
	var note model.Note
	if err := s.db.First(&note, r.PathValue("id")).Error; err != nil {
		notFoundOrError(w, err)
		return
	}
	if sliceUTF16(note.Content, input.StartOffset, input.EndOffset) != input.SourceText {
		writeError(w, 400, errors.New("source text does not match the note"))
		return
	}
	annotation := model.Annotation{NoteID: note.ID, Excerpt: input.Excerpt, SourceText: input.SourceText, StartOffset: input.StartOffset, EndOffset: input.EndOffset, Comment: strings.TrimSpace(input.Comment), AnchorValid: true}
	if err := s.db.Create(&annotation).Error; err != nil {
		writeError(w, 500, err)
		return
	}
	writeJSON(w, 201, annotation)
}

func (s *Server) deleteAnnotation(w http.ResponseWriter, r *http.Request) {
	result := s.db.Delete(&model.Annotation{}, r.PathValue("id"))
	if result.Error != nil {
		writeError(w, 500, result.Error)
		return
	}
	if result.RowsAffected == 0 {
		writeError(w, 404, errors.New("annotation not found"))
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) dueCards(w http.ResponseWriter, r *http.Request) {
	now := time.Now()
	var cards []model.Card
	if err := s.db.Joins("LEFT JOIN notes ON notes.id = cards.note_id AND notes.deleted_at IS NULL").Preload("Note").Where("cards.due_at IS NULL OR cards.due_at <= ?", now).Order("cards.due_at asc").Find(&cards).Error; err != nil {
		writeError(w, 500, err)
		return
	}
	type dueCard struct {
		model.Card
		NoteTitle  string `json:"noteTitle"`
		NoteFormat string `json:"noteFormat"`
	}
	result := make([]dueCard, 0, len(cards))
	for _, card := range cards {
		card = normalizeCard(card)
		card.Excerpt = resolveCardContext(card, card.Note.Content)
		noteTitle, noteFormat := card.Note.Title, card.Note.Format
		if card.NoteID == nil {
			noteTitle, noteFormat = "独立卡片", "markdown"
		}
		result = append(result, dueCard{Card: card, NoteTitle: noteTitle, NoteFormat: noteFormat})
	}
	writeJSON(w, 200, result)
}

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

func (s *Server) desiredRetention() (float64, error) {
	var setting model.AppSetting
	if err := s.db.First(&setting, "key = ?", "desiredRetention").Error; err != nil {
		return 0, err
	}
	value, err := strconv.ParseFloat(setting.Value, 64)
	if err != nil {
		return 0, err
	}
	return value, nil
}

func (s *Server) getSettings(w http.ResponseWriter, r *http.Request) {
	retention, err := s.desiredRetention()
	if err != nil {
		writeError(w, 500, err)
		return
	}
	writeJSON(w, 200, map[string]float64{"desiredRetention": retention})
}

func (s *Server) updateSettings(w http.ResponseWriter, r *http.Request) {
	var input struct {
		DesiredRetention float64 `json:"desiredRetention"`
	}
	if !decode(w, r, &input) {
		return
	}
	if math.IsNaN(input.DesiredRetention) || math.IsInf(input.DesiredRetention, 0) || input.DesiredRetention < 0.70 || input.DesiredRetention > 0.97 {
		writeError(w, 400, errors.New("desiredRetention must be between 0.70 and 0.97"))
		return
	}
	var setting model.AppSetting
	if err := s.db.First(&setting, "key = ?", "desiredRetention").Error; err != nil {
		notFoundOrError(w, err)
		return
	}
	setting.Value = strconv.FormatFloat(input.DesiredRetention, 'f', 2, 64)
	if err := s.db.Save(&setting).Error; err != nil {
		writeError(w, 500, err)
		return
	}
	writeJSON(w, 200, map[string]float64{"desiredRetention": input.DesiredRetention})
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
			history[i].NoteTitle = "独立卡片"
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
			recent[i].NoteTitle = "独立卡片"
		}
	}
	writeJSON(w, 200, map[string]any{
		"summary": map[string]any{"notes": notes, "cards": cards, "due": due, "totalReviews": totalReviews, "reviewedToday": reviewedToday, "reviewsLast30Days": len(recentLogs), "averageRating": average},
		"days":    days, "ratings": ratings, "recent": recent,
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
	_ = format
	return "markdown"
}

func findAnchor(content, excerpt string, near int) (int, int, bool) {
	contentUnits := utf16.Encode([]rune(content))
	excerptUnits := utf16.Encode([]rune(excerpt))
	if len(excerptUnits) == 0 || len(excerptUnits) > len(contentUnits) {
		return 0, 0, false
	}
	best, bestDistance := -1, int(^uint(0)>>1)
	for i := 0; i+len(excerptUnits) <= len(contentUnits); i++ {
		match := true
		for j := range excerptUnits {
			if contentUnits[i+j] != excerptUnits[j] {
				match = false
				break
			}
		}
		if match {
			distance := i - near
			if distance < 0 {
				distance = -distance
			}
			if distance < bestDistance {
				best, bestDistance = i, distance
			}
		}
	}
	if best < 0 {
		return 0, 0, false
	}
	return best, best + len(excerptUnits), true
}

func sliceUTF16(content string, start, end int) string {
	units := utf16.Encode([]rune(content))
	if start < 0 || end < start || end > len(units) {
		return ""
	}
	return string(utf16.Decode(units[start:end]))
}

func clozeExcerpt(content string, start, end int) string {
	units := utf16.Encode([]rune(content))
	if start < 0 || end <= start || end > len(units) {
		return "［选中内容］"
	}
	paragraphStart, paragraphEnd := 0, len(units)
	for i := start - 1; i >= 1; i-- {
		if units[i-1] == '\n' && units[i] == '\n' {
			paragraphStart = i + 1
			break
		}
	}
	for i := end; i < len(units)-1; i++ {
		if units[i] == '\n' && units[i+1] == '\n' {
			paragraphEnd = i
			break
		}
	}
	before := strings.TrimSpace(string(utf16.Decode(units[paragraphStart:start])))
	after := strings.TrimSpace(string(utf16.Decode(units[end:paragraphEnd])))
	context := strings.TrimSpace(before + " ［　］ " + after)
	if context == "［　］" || context == "" {
		return "［选中内容］"
	}
	return context
}

func resolveCardContext(card model.Card, noteContent string) string {
	if card.NoteID == nil {
		return card.Excerpt
	}
	if card.ContextOverride != "" {
		return card.ContextOverride
	}
	return clozeExcerpt(noteContent, card.StartOffset, card.EndOffset)
}

func normalizeCard(card model.Card) model.Card {
	if card.Question == "" {
		card.Question = card.Prompt
	}
	return card
}
