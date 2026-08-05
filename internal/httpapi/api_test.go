package httpapi_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"dog-pedigree/internal/application"
	"dog-pedigree/internal/domain"
	"dog-pedigree/internal/httpapi"
	"dog-pedigree/internal/storage/sqlite"
	"dog-pedigree/migrations"
)

func setupTestServer(t *testing.T) (http.Handler, string) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "api_test.db")
	backupDir := filepath.Join(tmpDir, "backups")

	repo, err := sqlite.New(dbPath)
	if err != nil {
		t.Fatalf("failed to init db: %v", err)
	}
	if err := repo.RunMigrations(migrations.FS); err != nil {
		t.Fatalf("failed to run migrations: %v", err)
	}

	wsService := application.NewWorkspaceService(repo)
	dogService := application.NewDogService(repo)
	pedigreeService := application.NewPedigreeService(repo)

	router := httpapi.NewRouter(wsService, dogService, pedigreeService, backupDir, nil)
	return router, tmpDir
}

func TestHealthCheck(t *testing.T) {
	router, _ := setupTestServer(t)

	req := httptest.NewRequest("GET", "/api/v1/health", nil)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", rec.Code)
	}
}

func TestWorkspaceAndDogEndpoints(t *testing.T) {
	router, _ := setupTestServer(t)

	// 1. Create Workspace
	wsBody, _ := json.Marshal(map[string]string{"name": "API Test WS"})
	req := httptest.NewRequest("POST", "/api/v1/workspaces", bytes.NewBuffer(wsBody))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created, got %d", rec.Code)
	}

	var ws domain.Workspace
	_ = json.NewDecoder(rec.Body).Decode(&ws)

	// 2. Create Dog 1 (Parent)
	dog1Body, _ := json.Marshal(domain.Dog{
		Name: "Zeus",
		Sex:  domain.SexMale,
	})
	req = httptest.NewRequest("POST", "/api/v1/workspaces/"+ws.ID+"/dogs", bytes.NewBuffer(dog1Body))
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d", rec.Code)
	}
	var dog1 domain.Dog
	_ = json.NewDecoder(rec.Body).Decode(&dog1)

	// 3. Create Dog 2 (Child)
	dog2Body, _ := json.Marshal(domain.Dog{
		Name: "Hercules",
		Sex:  domain.SexMale,
	})
	req = httptest.NewRequest("POST", "/api/v1/workspaces/"+ws.ID+"/dogs", bytes.NewBuffer(dog2Body))
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	var dog2 domain.Dog
	_ = json.NewDecoder(rec.Body).Decode(&dog2)

	// 4. Create Parentage (Zeus is sire of Hercules)
	relBody, _ := json.Marshal(domain.Parentage{
		ChildID:          dog2.ID,
		ParentID:         dog1.ID,
		Role:             domain.RoleSire,
		RelationshipType: domain.RelBiological,
		Confidence:       domain.ConfConfirmed,
	})
	req = httptest.NewRequest("POST", "/api/v1/workspaces/"+ws.ID+"/parentage", bytes.NewBuffer(relBody))
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d", rec.Code)
	}

	// 5. Attempt Self-Parenting (Hercules parent of Hercules) -> should fail 400
	selfRel, _ := json.Marshal(domain.Parentage{
		ChildID:          dog2.ID,
		ParentID:         dog2.ID,
		Role:             domain.RoleSire,
		RelationshipType: domain.RelBiological,
		Confidence:       domain.ConfConfirmed,
	})
	req = httptest.NewRequest("POST", "/api/v1/workspaces/"+ws.ID+"/parentage", bytes.NewBuffer(selfRel))
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request on self-parenting, got %d", rec.Code)
	}

	// 6. Attempt Cycle (Hercules parent of Zeus) -> should fail 400
	cycleRel, _ := json.Marshal(domain.Parentage{
		ChildID:          dog1.ID,
		ParentID:         dog2.ID,
		Role:             domain.RoleSire,
		RelationshipType: domain.RelBiological,
		Confidence:       domain.ConfConfirmed,
	})
	req = httptest.NewRequest("POST", "/api/v1/workspaces/"+ws.ID+"/parentage", bytes.NewBuffer(cycleRel))
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request on cycle, got %d", rec.Code)
	}

	// 7. Get Snapshot
	req = httptest.NewRequest("GET", "/api/v1/workspaces/"+ws.ID+"/snapshot", nil)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var snap application.WorkspaceSnapshot
	_ = json.NewDecoder(rec.Body).Decode(&snap)
	if len(snap.Dogs) != 2 || len(snap.Relationships) != 1 {
		t.Fatalf("snapshot mismatch: dogs=%d, rels=%d", len(snap.Dogs), len(snap.Relationships))
	}
}
