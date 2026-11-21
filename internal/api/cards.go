package api

import (
	"encoding/json"
	"errors"
	fsrs "github.com/open-spaced-repetition/go-fsrs/v4"
	"gorm.io/gorm"
	"net/http"
	"recall-box/internal/model"
	"strconv"
	"strings"
	"time"
	"unicode/utf16"
)

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
	writeJSON(w, 201, cardItem{Card: card, NoteTitle: "鐙珛鍗＄墖", NoteFormat: "markdown"})
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
	contentByField := map[string]string{}
	if input.Question != nil {
		question := strings.TrimSpace(*input.Question)
		if question == "" {
			writeError(w, 400, errors.New("question is required"))
			return
		}
		updates["question"] = question
		contentByField["question"] = question
	}
	if input.Answer != nil {
		answer := strings.TrimSpace(*input.Answer)
		if answer == "" {
			writeError(w, 400, errors.New("answer is required"))
			return
		}
		updates["answer"] = answer
		contentByField["answer"] = answer
	}
	if input.Context != nil {
		contextText := strings.TrimSpace(*input.Context)
		if card.NoteID == nil {
			updates["excerpt"] = contextText
		} else {
			updates["context_override"] = contextText
		}
		contentByField["context"] = contextText
	}
	if len(updates) > 0 {
		if err := s.db.Transaction(func(tx *gorm.DB) error {
			if err := tx.Model(&card).Updates(updates).Error; err != nil {
				return err
			}
			for field, content := range contentByField {
				var annotations []model.Annotation
				if err := tx.Where("card_id = ? AND field = ?", card.ID, field).Find(&annotations).Error; err != nil {
					return err
				}
				for _, annotation := range annotations {
					anchor := annotation.SourceText
					if anchor == "" {
						anchor = annotation.Excerpt
					}
					start, end, found := findAnchor(content, anchor, annotation.StartOffset)
					if err := tx.Model(&annotation).Updates(map[string]any{"start_offset": start, "end_offset": end, "anchor_valid": found}).Error; err != nil {
						return err
					}
				}
			}
			return nil
		}); err != nil {
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
		noteTitle, noteFormat = "鐙珛鍗＄墖", "markdown"
	}
	type cardItem struct {
		model.Card
		NoteTitle  string `json:"noteTitle"`
		NoteFormat string `json:"noteFormat"`
	}
	writeJSON(w, 200, cardItem{Card: card, NoteTitle: noteTitle, NoteFormat: noteFormat})
}

func (s *Server) listAllCards(w http.ResponseWriter, r *http.Request) {
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
	sortBy := r.URL.Query().Get("sort")
	var cards []model.Card
	query := s.db.Model(&model.Card{}).Joins("LEFT JOIN notes ON notes.id = cards.note_id AND notes.deleted_at IS NULL").Preload("Note")
	if search := strings.TrimSpace(r.URL.Query().Get("q")); search != "" {
		like := "%" + strings.ReplaceAll(strings.ReplaceAll(search, "%", "\\%"), "_", "\\_") + "%"
		query = query.Where("cards.question LIKE ? OR cards.answer LIKE ? OR cards.excerpt LIKE ? OR cards.context_override LIKE ? OR notes.title LIKE ?", like, like, like, like, like)
	}
	var total, dueCount int64
	if err := query.Count(&total).Error; err != nil {
		writeError(w, 500, err)
		return
	}
	if err := query.Session(&gorm.Session{}).Where("cards.due_at IS NULL OR cards.due_at <= ?", time.Now()).Count(&dueCount).Error; err != nil {
		writeError(w, 500, err)
		return
	}
	switch sortBy {
	case "created_desc":
		query = query.Order("cards.created_at desc").Order("cards.id desc")
	default:
		query = query.Order("cards.due_at asc").Order("cards.id asc")
	}
	if err := query.Offset((page - 1) * pageSize).Limit(pageSize).Find(&cards).Error; err != nil {
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
	writeJSON(w, 200, map[string]any{"items": result, "total": total, "dueCount": dueCount, "page": page, "pageSize": pageSize})
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
			noteTitle, noteFormat = "鐙珛鍗＄墖", "markdown"
		}
		result = append(result, dueCard{Card: card, NoteTitle: noteTitle, NoteFormat: noteFormat})
	}
	writeJSON(w, 200, result)
}

func (s *Server) deleteCard(w http.ResponseWriter, r *http.Request) {
	var card model.Card
	if err := s.db.First(&card, r.PathValue("id")).Error; err != nil {
		notFoundOrError(w, err)
		return
	}
	if err := s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("card_id = ?", card.ID).Delete(&model.Annotation{}).Error; err != nil {
			return err
		}
		return tx.Delete(&card).Error
	}); err != nil {
		writeError(w, 500, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
