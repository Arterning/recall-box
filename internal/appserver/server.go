package appserver

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"recall-box/internal/api"
	"recall-box/internal/store"
	"recall-box/internal/webui"
)

// Server owns the local HTTP API and embedded web application.
type Server struct {
	URL       string
	Database  string
	HTTP      *http.Server
	listener  net.Listener
	dbCloser  interface{ Close() error }
	Done      chan error
	closeOnce sync.Once
	closeErr  error
}

// Start opens the local database and binds an ephemeral loopback port.
func Start() (*Server, error) {
	dbPath, err := databasePath()
	if err != nil {
		return nil, err
	}
	db, err := store.Open(dbPath)
	if err != nil {
		return nil, err
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		sqlDB, _ := db.DB()
		if sqlDB != nil {
			_ = sqlDB.Close()
		}
		return nil, fmt.Errorf("listen on local port: %w", err)
	}
	mux := http.NewServeMux()
	mux.Handle("/api/", api.New(db))
	mux.Handle("/", webui.Handler())
	httpServer := &http.Server{Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	sqlDB, err := db.DB()
	if err != nil {
		_ = listener.Close()
		return nil, err
	}
	instance := &Server{
		URL:      "http://" + listener.Addr().String(),
		Database: dbPath,
		HTTP:     httpServer,
		listener: listener,
		dbCloser: sqlDB,
		Done:     make(chan error, 1),
	}
	go func() {
		err := httpServer.Serve(listener)
		if errors.Is(err, http.ErrServerClosed) {
			err = nil
		}
		instance.Done <- err
	}()
	return instance, nil
}

func (s *Server) Close(ctx context.Context) error {
	s.closeOnce.Do(func() {
		serverErr := s.HTTP.Shutdown(ctx)
		dbErr := s.dbCloser.Close()
		if serverErr != nil {
			s.closeErr = serverErr
		} else {
			s.closeErr = dbErr
		}
	})
	return s.closeErr
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
