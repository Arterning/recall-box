package store

import (
	"fmt"
	"os"
	"path/filepath"

	"recall-box/internal/model"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func Open(databasePath string) (*gorm.DB, error) {
	if err := os.MkdirAll(filepath.Dir(databasePath), 0700); err != nil {
		return nil, fmt.Errorf("create database directory: %w", err)
	}
	db, err := gorm.Open(sqlite.Open(databasePath+"?_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)"), &gorm.Config{})
	if err != nil {
		return nil, fmt.Errorf("open sqlite database: %w", err)
	}
	if err := db.AutoMigrate(&model.Note{}, &model.Card{}, &model.ReviewLog{}); err != nil {
		return nil, fmt.Errorf("auto migrate database: %w", err)
	}
	return db, nil
}
