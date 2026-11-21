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
	ID              uint   `json:"id" gorm:"primaryKey"`
	NoteID          *uint  `json:"noteId,omitempty" gorm:"index"`
	Note            Note   `json:"-"`
	Excerpt         string `json:"excerpt" gorm:"type:text;not null"`
	ContextOverride string `json:"-" gorm:"type:text;not null;default:''"`
	SourceText      string `json:"-" gorm:"type:text;not null;default:''"`
	StartOffset     int    `json:"startOffset" gorm:"not null;default:0"`
	EndOffset       int    `json:"endOffset" gorm:"not null;default:0"`
	AnchorValid     bool   `json:"anchorValid" gorm:"not null;default:true"`
	Question        string `json:"question" gorm:"type:text;not null;default:''"`
	// Prompt remains for cards created before the question field was introduced.
	Prompt    string         `json:"prompt" gorm:"type:text;not null;default:''"`
	Answer    string         `json:"answer" gorm:"type:text;not null;default:''"`
	DueAt     *time.Time     `json:"dueAt" gorm:"index"`
	FSRSState string         `json:"fsrsState,omitempty" gorm:"type:text"`
	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
	DeletedAt gorm.DeletedAt `json:"-" gorm:"index"`
}

type Annotation struct {
	ID          uint           `json:"id" gorm:"primaryKey"`
	NoteID      *uint          `json:"noteId,omitempty" gorm:"index"`
	CardID      *uint          `json:"cardId,omitempty" gorm:"index"`
	Field       string         `json:"field,omitempty" gorm:"size:20;not null;default:''"`
	Excerpt     string         `json:"excerpt" gorm:"type:text;not null"`
	SourceText  string         `json:"-" gorm:"type:text;not null;default:''"`
	StartOffset int            `json:"startOffset" gorm:"not null;default:0"`
	EndOffset   int            `json:"endOffset" gorm:"not null;default:0"`
	Comment     string         `json:"comment" gorm:"type:text;not null;default:''"`
	AnchorValid bool           `json:"anchorValid" gorm:"not null;default:true"`
	CreatedAt   time.Time      `json:"createdAt"`
	UpdatedAt   time.Time      `json:"updatedAt"`
	DeletedAt   gorm.DeletedAt `json:"-" gorm:"index"`
}

type ReviewLog struct {
	ID         uint       `json:"id" gorm:"primaryKey"`
	CardID     uint       `json:"cardId" gorm:"not null;index"`
	Rating     int        `json:"rating" gorm:"not null"` // FSRS: 1 Again, 2 Hard, 3 Good, 4 Easy
	Response   string     `json:"response" gorm:"type:text;not null;default:''"`
	ReviewedAt time.Time  `json:"reviewedAt" gorm:"index"`
	DueBefore  *time.Time `json:"dueBefore,omitempty"`
	DueAfter   *time.Time `json:"dueAfter,omitempty"`
	FSRSLog    string     `json:"fsrsLog,omitempty" gorm:"type:text"`
	CreatedAt  time.Time  `json:"createdAt"`
}

type AppSetting struct {
	Key       string    `json:"key" gorm:"primaryKey;size:100"`
	Value     string    `json:"value" gorm:"type:text;not null"`
	UpdatedAt time.Time `json:"updatedAt"`
}
