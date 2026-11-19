package main

import (
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"

	"recall-box/internal/api"
	"recall-box/internal/store"
	"recall-box/internal/webui"
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
	address := "http://" + listener.Addr().String()
	mux := http.NewServeMux()
	mux.Handle("/api/", api.New(db))
	mux.Handle("/", webui.Handler())
	log.Printf("Recall Box listening at %s (database: %s)", address, dbPath)
	if os.Getenv("RECALL_BOX_NO_BROWSER") == "" {
		go func() {
			time.Sleep(500 * time.Millisecond)
			var command *exec.Cmd
			switch runtime.GOOS {
			case "windows":
				command = exec.Command("rundll32", "url.dll,FileProtocolHandler", address)
			case "darwin":
				command = exec.Command("open", address)
			default:
				command = exec.Command("xdg-open", address)
			}
			if err := command.Start(); err != nil {
				log.Printf("open browser: %v", err)
			}
		}()
	}
	server := &http.Server{Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	if err := server.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(fmt.Errorf("serve local app: %w", err))
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
