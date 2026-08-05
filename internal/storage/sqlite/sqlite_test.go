package sqlite_test

import (
	"context"
	"path/filepath"
	"testing"

	"dog-pedigree/internal/domain"
	"dog-pedigree/internal/storage/sqlite"
	"dog-pedigree/migrations"
)

func TestSQLiteRepo_Integration(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")

	repo, err := sqlite.New(dbPath)
	if err != nil {
		t.Fatalf("failed to create repo: %v", err)
	}

	if err := repo.RunMigrations(migrations.FS); err != nil {
		t.Fatalf("failed to run migrations: %v", err)
	}

	ctx := context.Background()

	// 1. Create Workspace
	ws := &domain.Workspace{
		ID:        "ws-test-1",
		Name:      "Test Workspace",
		CreatedAt: domain.NowISO(),
		UpdatedAt: domain.NowISO(),
	}
	if err := repo.CreateWorkspace(ctx, ws); err != nil {
		t.Fatalf("failed to create workspace: %v", err)
	}

	fetchedWs, err := repo.GetWorkspace(ctx, ws.ID)
	if err != nil || fetchedWs.Name != ws.Name {
		t.Fatalf("workspace mismatch: %v, %v", fetchedWs, err)
	}

	// 2. Dog CRUD & Optimistic Locking
	dog := &domain.Dog{
		ID:          "dog-1",
		WorkspaceID: ws.ID,
		Name:        "Max",
		Sex:         domain.SexMale,
		Breed:       "Golden Retriever",
		Version:     1,
		CreatedAt:   domain.NowISO(),
		UpdatedAt:   domain.NowISO(),
	}
	if err := repo.CreateDog(ctx, dog); err != nil {
		t.Fatalf("failed to create dog: %v", err)
	}

	dog.Name = "Maximus"
	if err := repo.UpdateDog(ctx, dog); err != nil {
		t.Fatalf("failed to update dog: %v", err)
	}
	if dog.Version != 2 {
		t.Fatalf("expected version 2 after update, got %d", dog.Version)
	}

	// Try updating with stale version 1 -> should fail with ErrConflict
	staleDog := *dog
	staleDog.Version = 1
	staleDog.Name = "Stale Name"
	if err := repo.UpdateDog(ctx, &staleDog); err != domain.ErrConflict {
		t.Fatalf("expected ErrConflict on stale version update, got %v", err)
	}

	// 3. Parentage CRUD
	dog2 := &domain.Dog{
		ID:          "dog-2",
		WorkspaceID: ws.ID,
		Name:        "Puppy",
		Sex:         domain.SexFemale,
		Version:     1,
		CreatedAt:   domain.NowISO(),
		UpdatedAt:   domain.NowISO(),
	}
	if err := repo.CreateDog(ctx, dog2); err != nil {
		t.Fatalf("failed to create dog 2: %v", err)
	}

	rel := &domain.Parentage{
		ID:               "rel-1",
		WorkspaceID:      ws.ID,
		ChildID:          dog2.ID,
		ParentID:         dog.ID,
		Role:             domain.RoleSire,
		RelationshipType: domain.RelBiological,
		Confidence:       domain.ConfConfirmed,
		CreatedAt:        domain.NowISO(),
		UpdatedAt:        domain.NowISO(),
	}
	if err := repo.CreateParentage(ctx, rel); err != nil {
		t.Fatalf("failed to create parentage: %v", err)
	}

	rels, err := repo.ListParentageByWorkspace(ctx, ws.ID)
	if err != nil || len(rels) != 1 {
		t.Fatalf("expected 1 parentage relationship, got %d, err=%v", len(rels), err)
	}

	// 4. Backup test
	backupPath := filepath.Join(tmpDir, "backup.sqlite")
	if err := repo.CreateBackup(ctx, backupPath); err != nil {
		t.Fatalf("failed to create backup: %v", err)
	}
}
