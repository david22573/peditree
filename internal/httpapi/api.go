package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	"dog-pedigree/internal/application"
	"dog-pedigree/internal/domain"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

type API struct {
	wsService       *application.WorkspaceService
	dogService      *application.DogService
	pedigreeService *application.PedigreeService
	backupDir       string
}

func NewRouter(
	wsService *application.WorkspaceService,
	dogService *application.DogService,
	pedigreeService *application.PedigreeService,
	backupDir string,
	staticFS http.FileSystem,
) http.Handler {
	api := &API{
		wsService:       wsService,
		dogService:      dogService,
		pedigreeService: pedigreeService,
		backupDir:       backupDir,
	}

	r := chi.NewRouter()

	// Global Middlewares
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(securityHeadersMiddleware)
	r.Use(maxBytesMiddleware(10 << 20)) // 10MB limit

	// Health Check
	r.Get("/api/v1/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	// API Routes
	r.Route("/api/v1", func(r chi.Router) {
		// Workspaces
		r.Get("/workspaces", api.handleListWorkspaces)
		r.Post("/workspaces", api.handleCreateWorkspace)
		r.Get("/workspaces/{workspaceId}/snapshot", api.handleGetSnapshot)
		r.Get("/workspaces/{workspaceId}/export", api.handleExportWorkspace)
		r.Post("/workspaces/{workspaceId}/import", api.handleImportWorkspace)
		r.Post("/workspaces/{workspaceId}/backup", api.handleBackupWorkspace)

		// Dogs
		r.Post("/workspaces/{workspaceId}/dogs", api.handleCreateDog)
		r.Get("/dogs/{dogId}", api.handleGetDog)
		r.Patch("/dogs/{dogId}", api.handleUpdateDog)
		r.Delete("/dogs/{dogId}", api.handleSoftDeleteDog)
		r.Post("/dogs/{dogId}/restore", api.handleRestoreDog)

		// Parentage
		r.Post("/workspaces/{workspaceId}/parentage", api.handleCreateParentage)
		r.Patch("/parentage/{relationshipId}", api.handleUpdateParentage)
		r.Delete("/parentage/{relationshipId}", api.handleDeleteParentage)
	})

	// Serve Static Frontend
	if staticFS != nil {
		fileServer := http.FileServer(staticFS)
		r.Get("/*", func(w http.ResponseWriter, r *http.Request) {
			if strings.HasPrefix(r.URL.Path, "/api/") {
				writeError(w, http.StatusNotFound, "endpoint not found")
				return
			}
			fileServer.ServeHTTP(w, r)
		})
	}

	return r
}

func securityHeadersMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("X-XSS-Protection", "1; mode=block")
		w.Header().Set("Referrer-Policy", "no-referrer")
		next.ServeHTTP(w, r)
	})
}

func maxBytesMiddleware(limit int64) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			r.Body = http.MaxBytesReader(w, r.Body, limit)
			next.ServeHTTP(w, r)
		})
	}
}

// Response helpers
type ErrorResponse struct {
	Error string `json:"error"`
	Code  string `json:"code,omitempty"`
}

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, ErrorResponse{Error: msg})
}

func handleError(w http.ResponseWriter, err error) {
	if errors.Is(err, domain.ErrNotFound) {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	if errors.Is(err, domain.ErrConflict) {
		writeError(w, http.StatusConflict, err.Error())
		return
	}
	if errors.Is(err, domain.ErrSelfParenting) ||
		errors.Is(err, domain.ErrAncestryCycle) ||
		errors.Is(err, domain.ErrCrossWorkspace) ||
		errors.Is(err, domain.ErrDuplicateRelationship) ||
		errors.Is(err, domain.ErrMultipleConfirmedSire) ||
		errors.Is(err, domain.ErrMultipleConfirmedDam) ||
		errors.Is(err, domain.ErrSameSireAndDam) ||
		errors.Is(err, domain.ErrUnsupportedEnum) ||
		errors.Is(err, domain.ErrInvalidInput) ||
		errors.Is(err, domain.ErrDeletedDogReferenced) {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	// Fallback internal error without exposing DB/SQL details
	writeError(w, http.StatusInternalServerError, "an internal server error occurred")
}

// Handlers
func (api *API) handleListWorkspaces(w http.ResponseWriter, r *http.Request) {
	list, err := api.wsService.ListWorkspaces(r.Context())
	if err != nil {
		handleError(w, err)
		return
	}
	if list == nil {
		list = []domain.Workspace{}
	}
	writeJSON(w, http.StatusOK, list)
}

func (api *API) handleCreateWorkspace(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil && err != io.EOF {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	ws, err := api.wsService.CreateWorkspace(r.Context(), body.Name)
	if err != nil {
		handleError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, ws)
}

func (api *API) handleGetSnapshot(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "workspaceId")
	snap, err := api.wsService.GetSnapshot(r.Context(), wsID)
	if err != nil {
		handleError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, snap)
}

func (api *API) handleExportWorkspace(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "workspaceId")
	data, err := api.wsService.ExportWorkspace(r.Context(), wsID)
	if err != nil {
		handleError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, data)
}

func (api *API) handleImportWorkspace(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "workspaceId")
	var data application.ExportData
	if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON import body")
		return
	}
	ws, err := api.wsService.ImportWorkspace(r.Context(), &data, wsID)
	if err != nil {
		handleError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, ws)
}

func (api *API) handleBackupWorkspace(w http.ResponseWriter, r *http.Request) {
	backupPath, err := api.wsService.CreateBackup(r.Context(), api.backupDir)
	if err != nil {
		handleError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"backup_path": backupPath, "status": "success"})
}

func (api *API) handleCreateDog(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "workspaceId")
	var dog domain.Dog
	if err := json.NewDecoder(r.Body).Decode(&dog); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	dog.WorkspaceID = wsID
	created, err := api.dogService.CreateDog(r.Context(), &dog)
	if err != nil {
		handleError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (api *API) handleGetDog(w http.ResponseWriter, r *http.Request) {
	dogID := chi.URLParam(r, "dogId")
	dog, err := api.dogService.GetDog(r.Context(), dogID)
	if err != nil {
		handleError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, dog)
}

func (api *API) handleUpdateDog(w http.ResponseWriter, r *http.Request) {
	dogID := chi.URLParam(r, "dogId")
	existing, err := api.dogService.GetDog(r.Context(), dogID)
	if err != nil {
		handleError(w, err)
		return
	}

	var req map[string]any
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON payload")
		return
	}

	// Apply patches
	if name, ok := req["name"].(string); ok {
		existing.Name = name
	}
	if regName, ok := req["registered_name"].(string); ok {
		existing.RegisteredName = regName
	}
	if sexStr, ok := req["sex"].(string); ok {
		existing.Sex = domain.Sex(sexStr)
	}
	if breed, ok := req["breed"].(string); ok {
		existing.Breed = breed
	}
	if birthDate, ok := req["birth_date"].(string); ok {
		if birthDate == "" {
			existing.BirthDate = nil
		} else {
			existing.BirthDate = &birthDate
		}
	}
	if deathDate, ok := req["death_date"].(string); ok {
		if deathDate == "" {
			existing.DeathDate = nil
		} else {
			existing.DeathDate = &deathDate
		}
	}
	if regNum, ok := req["registration_number"].(string); ok {
		existing.RegistrationNumber = regNum
	}
	if chipNum, ok := req["microchip_number"].(string); ok {
		existing.MicrochipNumber = chipNum
	}
	if color, ok := req["color"].(string); ok {
		existing.Color = color
	}
	if notes, ok := req["notes"].(string); ok {
		existing.Notes = notes
	}
	if v, ok := req["version"].(float64); ok {
		existing.Version = int(v)
	}

	updated, err := api.dogService.UpdateDog(r.Context(), existing)
	if err != nil {
		handleError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (api *API) handleSoftDeleteDog(w http.ResponseWriter, r *http.Request) {
	dogID := chi.URLParam(r, "dogId")
	existing, err := api.dogService.GetDog(r.Context(), dogID)
	if err != nil {
		handleError(w, err)
		return
	}

	var req struct {
		Version int `json:"version"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)
	expVersion := req.Version
	if expVersion == 0 {
		expVersion = existing.Version
	}

	res, err := api.dogService.SoftDeleteDog(r.Context(), dogID, expVersion)
	if err != nil {
		handleError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func (api *API) handleRestoreDog(w http.ResponseWriter, r *http.Request) {
	dogID := chi.URLParam(r, "dogId")
	restored, err := api.dogService.RestoreDog(r.Context(), dogID)
	if err != nil {
		handleError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, restored)
}

func (api *API) handleCreateParentage(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "workspaceId")
	var p domain.Parentage
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	p.WorkspaceID = wsID
	created, err := api.pedigreeService.CreateParentage(r.Context(), &p)
	if err != nil {
		handleError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (api *API) handleUpdateParentage(w http.ResponseWriter, r *http.Request) {
	relID := chi.URLParam(r, "relationshipId")
	var p domain.Parentage
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	p.ID = relID
	updated, err := api.pedigreeService.UpdateParentage(r.Context(), &p)
	if err != nil {
		handleError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (api *API) handleDeleteParentage(w http.ResponseWriter, r *http.Request) {
	relID := chi.URLParam(r, "relationshipId")
	if err := api.pedigreeService.DeleteParentage(r.Context(), relID); err != nil {
		handleError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}
