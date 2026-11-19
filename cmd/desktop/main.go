package main

import (
	"context"
	"log"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	"recall-box/internal/appserver"
)

func main() {
	backend, err := appserver.Start()
	if err != nil {
		log.Fatal(err)
	}
	defer shutdownBackend(backend)

	app := application.New(application.Options{
		Name:        "Recall Box",
		Description: "本地知识管理与间隔复习",
		OnShutdown:  func() { shutdownBackend(backend) },
	})
	window := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:      "main-window",
		Title:     "Recall Box",
		URL:       backend.URL,
		Width:     1440,
		Height:    920,
		MinWidth:  1024,
		MinHeight: 680,
	})
	window.Center()
	window.Show()
	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}

func shutdownBackend(backend *appserver.Server) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := backend.Close(ctx); err != nil {
		log.Printf("shutdown local API: %v", err)
	}
}
