package api

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

const maxImageSize = 10 << 20

func (s *Server) getDataDir(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"path":                s.dataDir,
		"database":            filepath.Join(s.dataDir, "recall-box.db"),
		"attachments":         filepath.Join(s.dataDir, "attachments"),
		"openFolderSupported": runtime.GOOS == "windows" || runtime.GOOS == "darwin" || runtime.GOOS == "linux",
	})
}

func (s *Server) openDataDir(w http.ResponseWriter, r *http.Request) {
	var command *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		command = exec.Command("explorer.exe", s.dataDir)
	case "darwin":
		command = exec.Command("open", s.dataDir)
	case "linux":
		command = exec.Command("xdg-open", s.dataDir)
	default:
		writeError(w, http.StatusNotImplemented, errors.New("opening the data folder is not supported on this platform"))
		return
	}
	if err := command.Start(); err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Errorf("open data folder: %w", err))
		return
	}
	go func() { _ = command.Wait() }()
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) uploadAsset(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxImageSize+1024)
	if err := r.ParseMultipartForm(maxImageSize); err != nil {
		writeError(w, http.StatusBadRequest, errors.New("image must be 10 MB or smaller"))
		return
	}
	file, _, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, errors.New("image file is required"))
		return
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, maxImageSize+1))
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if len(data) == 0 || len(data) > maxImageSize {
		writeError(w, http.StatusBadRequest, errors.New("image must be between 1 byte and 10 MB"))
		return
	}
	contentType := http.DetectContentType(data)
	if len(data) >= 12 && string(data[:4]) == "RIFF" && string(data[8:12]) == "WEBP" {
		contentType = "image/webp"
	}
	extensions := map[string]string{
		"image/png":  ".png",
		"image/jpeg": ".jpg",
		"image/gif":  ".gif",
		"image/webp": ".webp",
	}
	extension, ok := extensions[strings.Split(contentType, ";")[0]]
	if !ok {
		writeError(w, http.StatusBadRequest, errors.New("supported image formats are PNG, JPEG, GIF, and WebP"))
		return
	}
	if err := os.MkdirAll(filepath.Join(s.dataDir, "attachments"), 0700); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	var id [16]byte
	if _, err := rand.Read(id[:]); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	name := hex.EncodeToString(id[:]) + extension
	path := filepath.Join(s.dataDir, "attachments", name)
	if err := os.WriteFile(path, data, 0600); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"name": name, "url": "/api/assets/" + name})
}

func (s *Server) getAsset(w http.ResponseWriter, r *http.Request) {
	name := filepath.Base(r.PathValue("name"))
	if name != r.PathValue("name") || len(name) < 36 || len(name) > 37 {
		http.NotFound(w, r)
		return
	}
	extension := strings.ToLower(filepath.Ext(name))
	if extension != ".png" && extension != ".jpg" && extension != ".gif" && extension != ".webp" {
		http.NotFound(w, r)
		return
	}
	id := strings.TrimSuffix(name, extension)
	if len(id) != 32 {
		http.NotFound(w, r)
		return
	}
	if _, err := hex.DecodeString(id); err != nil {
		http.NotFound(w, r)
		return
	}
	file, err := os.Open(filepath.Join(s.dataDir, "attachments", name))
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	contentTypes := map[string]string{".png": "image/png", ".jpg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp"}
	w.Header().Set("Content-Type", contentTypes[extension])
	http.ServeContent(w, r, name, info.ModTime(), file)
}
