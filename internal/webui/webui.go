package webui

import (
	"embed"
	"io/fs"
	"net/http"
)

//go:embed dist
var embedded embed.FS

func Handler() http.Handler {
	content, err := fs.Sub(embedded, "dist")
	if err != nil {
		panic(err)
	}
	return http.FileServer(http.FS(content))
}
