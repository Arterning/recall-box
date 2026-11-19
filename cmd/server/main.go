package main

import (
	"log"
	"os"
	"os/exec"
	"runtime"
	"time"

	"recall-box/internal/appserver"
)

func main() {
	server, err := appserver.Start()
	if err != nil {
		log.Fatal(err)
	}
	log.Printf("Recall Box development server listening at %s (database: %s)", server.URL, server.Database)
	if os.Getenv("RECALL_BOX_NO_BROWSER") == "" {
		go openBrowser(server.URL)
	}
	if err := <-server.Done; err != nil {
		log.Fatal(err)
	}
}

func openBrowser(address string) {
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
}
