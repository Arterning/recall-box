package main

import (
	"errors"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"recall-box/internal/api"
	"recall-box/internal/store"
)

func main() {
	dbPath, err := databasePath()
	if err != nil {
		log.Fatal(err)
	}
	db, err := store.Open(dbPath)
	if err != nil {
		log.Fatal(err)
	}

	listener, err := net.Listen("tcp", "127.0.0.1:34115")
	if err != nil {
		log.Fatalf("listen on 127.0.0.1:34115: %v", err)
	}
	log.Printf("Recall Box API listening at http://%s (database: %s)", listener.Addr(), dbPath)
	server := &http.Server{Handler: api.New(db), ReadHeaderTimeout: 5 * time.Second}
	if err := server.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}

func databasePath() (string, error) {
	if override := os.Getenv("RECALL_BOX_DATA_DIR"); override != "" {
		return filepath.Join(override, "recall-box.db"), nil
	}
	base, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(base, "RecallBox", "recall-box.db"), nil
}
