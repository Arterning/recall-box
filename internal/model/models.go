package model

import (
	"time"

	"gorm.io/gorm"
)

// Note stores the original editable text. Markdown and plain text are both
// kept as-is; rendering and editing are responsibilities of the frontend.
type Note struct {
	ID        uint           `json:"id" gorm:"primaryKey"`
	Title     string         `json:"title" gorm:"size:300;not null;default:''"`
	Content   string         `json:"content" gorm:"type:text;not null;default:''"`
	Format    string         `json:"format" gorm:"size:20;not null;default:markdown"`
	Tags      string         `json:"tags" gorm:"type:text;not null;default:''"`
	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
	DeletedAt gorm.DeletedAt `json:"-" gorm:"index"`
}

// Card represents a highlighted passage in a note. Offsets use UTF-16 code
// units, matching textarea.selectionStart/selectionEnd in browser editors.
type Card struct {
	ID          uint           `json:"id" gorm:"primaryKey"`
	NoteID      uint           `json:"noteId" gorm:"not null;index"`
	Note        Note           `json:"-"`
	Excerpt     string         `json:"excerpt" gorm:"type:text;not null"`
	StartOffset int            `json:"startOffset" gorm:"not null;default:0"`
	EndOffset   int            `json:"endOffset" gorm:"not null;default:0"`
	Prompt      string         `json:"prompt" gorm:"type:text;not null;default:''"`
	Answer      string         `json:"answer" gorm:"type:text;not null;default:''"`
	DueAt       *time.Time     `json:"dueAt" gorm:"index"`
	FSRSState   string         `json:"fsrsState,omitempty" gorm:"type:text"`
	CreatedAt   time.Time      `json:"createdAt"`
	UpdatedAt   time.Time      `json:"updatedAt"`
	DeletedAt   gorm.DeletedAt `json:"-" gorm:"index"`
}

type ReviewLog struct {
	ID         uint       `json:"id" gorm:"primaryKey"`
	CardID     uint       `json:"cardId" gorm:"not null;index"`
	Rating     int        `json:"rating" gorm:"not null"` // FSRS: 1 Again, 2 Hard, 3 Good, 4 Easy
	ReviewedAt time.Time  `json:"reviewedAt" gorm:"index"`
	DueBefore  *time.Time `json:"dueBefore,omitempty"`
	DueAfter   *time.Time `json:"dueAfter,omitempty"`
	CreatedAt  time.Time  `json:"createdAt"`
}
