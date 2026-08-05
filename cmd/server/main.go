package main

import (
	"context"
	"embed"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"dog-pedigree/internal/application"
	"dog-pedigree/internal/httpapi"
	"dog-pedigree/internal/storage/sqlite"
	"dog-pedigree/migrations"

	"github.com/go-chi/chi/v5"
)

//go:embed all:dist
var webFS embed.FS

func main() {
	port := flag.Int("port", 8080, "Server port")
	host := flag.String("host", "127.0.0.1", "Server host binding")
	dbPath := flag.String("db", "./data/pedigree.db", "Path to SQLite database file")
	backupDir := flag.String("backups", "./backups", "Path to backup directory")
	flag.Parse()

	_ = chi.NewRouter

	log.Printf("Starting Dog Pedigree Server...")
	log.Printf("Database path: %s", *dbPath)

	repo, err := sqlite.New(*dbPath)
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}

	log.Printf("Running database migrations...")
	if err := repo.RunMigrations(migrations.FS); err != nil {
		log.Fatalf("Failed to run database migrations: %v", err)
	}

	wsService := application.NewWorkspaceService(repo)
	dogService := application.NewDogService(repo)
	pedigreeService := application.NewPedigreeService(repo)

	// Ensure default workspace exists
	ctx := context.Background()
	workspaces, err := wsService.ListWorkspaces(ctx)
	if err != nil {
		log.Fatalf("Failed to list workspaces: %v", err)
	}
	if len(workspaces) == 0 {
		defaultWs, err := wsService.CreateWorkspace(ctx, "Default Workspace")
		if err != nil {
			log.Fatalf("Failed to create default workspace: %v", err)
		}
		log.Printf("Created initial workspace: %s (%s)", defaultWs.Name, defaultWs.ID)
	}

	// Prepare embedded web assets or fallback
	var staticFS http.FileSystem
	distSub, err := fs.Sub(webFS, "dist")
	if err == nil {
		staticFS = http.FS(distSub)
	} else {
		log.Printf("Notice: Embedded web/dist not available yet; frontend will serve fallback API root.")
	}

	router := httpapi.NewRouter(wsService, dogService, pedigreeService, *backupDir, staticFS)

	addr := net.JoinHostPort(*host, fmt.Sprintf("%d", *port))
	server := &http.Server{
		Addr:         addr,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	go func() {
		log.Printf("Server listening on http://%s", addr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("HTTP server error: %v", err)
		}
	}()

	<-stop
	log.Printf("Shutting down server gracefully...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("Server forced shutdown: %v", err)
	}

	log.Printf("Server stopped.")
}
