package api

import (
	"encoding/json"
	"errors"
	"gorm.io/gorm"
	"net/http"
	"recall-box/internal/model"
	"strings"
	"unicode/utf16"
)

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
		return "[选中内容]"
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
	context := strings.TrimSpace(before + " […] " + after)
	if context == "[…]" || context == "" {
		return "[选中内容]"
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
