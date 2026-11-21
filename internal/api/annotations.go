package api

import (
	"errors"
	"net/http"
	"recall-box/internal/model"
	"strings"
	"unicode/utf16"
)

func (s *Server) listAnnotations(w http.ResponseWriter, r *http.Request) {
	var annotations []model.Annotation
	if err := s.db.Where("note_id = ?", r.PathValue("id")).Order("created_at desc").Find(&annotations).Error; err != nil {
		writeError(w, 500, err)
		return
	}
	writeJSON(w, 200, annotations)
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
	annotation := model.Annotation{NoteID: &note.ID, Excerpt: input.Excerpt, SourceText: input.SourceText, StartOffset: input.StartOffset, EndOffset: input.EndOffset, Comment: strings.TrimSpace(input.Comment), AnchorValid: true}
	if err := s.db.Create(&annotation).Error; err != nil {
		writeError(w, 500, err)
		return
	}
	writeJSON(w, 201, annotation)
}

func (s *Server) listCardAnnotations(w http.ResponseWriter, r *http.Request) {
	var card model.Card
	if err := s.db.First(&card, r.PathValue("id")).Error; err != nil {
		notFoundOrError(w, err)
		return
	}
	var annotations []model.Annotation
	if err := s.db.Where("card_id = ?", card.ID).Order("created_at desc").Find(&annotations).Error; err != nil {
		writeError(w, 500, err)
		return
	}
	writeJSON(w, 200, annotations)
}

func (s *Server) createCardAnnotation(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Field       string `json:"field"`
		Excerpt     string `json:"excerpt"`
		SourceText  string `json:"sourceText"`
		StartOffset int    `json:"startOffset"`
		EndOffset   int    `json:"endOffset"`
		Comment     string `json:"comment"`
	}
	if !decode(w, r, &input) {
		return
	}
	input.Field = strings.TrimSpace(input.Field)
	if input.Field != "question" && input.Field != "answer" && input.Field != "context" {
		writeError(w, 400, errors.New("field must be question, answer, or context"))
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
	var card model.Card
	if err := s.db.Preload("Note").First(&card, r.PathValue("id")).Error; err != nil {
		notFoundOrError(w, err)
		return
	}
	content := card.Question
	switch input.Field {
	case "answer":
		content = card.Answer
	case "context":
		content = resolveCardContext(card, card.Note.Content)
	}
	if sliceUTF16(content, input.StartOffset, input.EndOffset) != input.SourceText {
		writeError(w, 400, errors.New("source text does not match card content"))
		return
	}
	annotation := model.Annotation{CardID: &card.ID, Field: input.Field, Excerpt: input.Excerpt, SourceText: input.SourceText, StartOffset: input.StartOffset, EndOffset: input.EndOffset, Comment: strings.TrimSpace(input.Comment), AnchorValid: true}
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

func (s *Server) updateAnnotation(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Comment string `json:"comment"`
	}
	if !decode(w, r, &input) {
		return
	}
	var annotation model.Annotation
	if err := s.db.First(&annotation, r.PathValue("id")).Error; err != nil {
		notFoundOrError(w, err)
		return
	}
	if err := s.db.Model(&annotation).Update("comment", strings.TrimSpace(input.Comment)).Error; err != nil {
		writeError(w, 500, err)
		return
	}
	s.db.First(&annotation, annotation.ID)
	writeJSON(w, 200, annotation)
}
