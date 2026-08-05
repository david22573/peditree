package application

import (
	"context"
	"fmt"
	"path/filepath"

	"dog-pedigree/internal/domain"
	"dog-pedigree/internal/storage"
)

type WorkspaceSnapshot struct {
	Workspace     domain.Workspace           `json:"workspace"`
	Revision      int                        `json:"revision"`
	Dogs          []domain.Dog               `json:"dogs"`
	Relationships []domain.Parentage         `json:"relationships"`
	Warnings      []domain.ValidationWarning `json:"warnings"`
}

type ExportData struct {
	SchemaVersion string             `json:"schemaVersion"`
	ExportedAt    string             `json:"exportedAt"`
	Workspace     domain.Workspace   `json:"workspace"`
	Dogs          []domain.Dog       `json:"dogs"`
	Relationships []domain.Parentage `json:"relationships"`
}

type WorkspaceService struct {
	repo storage.Repository
}

func NewWorkspaceService(repo storage.Repository) *WorkspaceService {
	return &WorkspaceService{repo: repo}
}

func (s *WorkspaceService) CreateWorkspace(ctx context.Context, name string) (*domain.Workspace, error) {
	if name == "" {
		name = "My Pedigree Workspace"
	}
	now := domain.NowISO()
	ws := &domain.Workspace{
		ID:        domain.NewID(),
		Name:      name,
		CreatedAt: now,
		UpdatedAt: now,
	}

	err := s.repo.CreateWorkspace(ctx, ws)
	if err != nil {
		return nil, err
	}

	_ = s.repo.CreateAuditEvent(ctx, &domain.AuditEvent{
		ID:          domain.NewID(),
		WorkspaceID: ws.ID,
		EventType:   "CREATE",
		EntityType:  "WORKSPACE",
		EntityID:    ws.ID,
		BeforeJSON:  nil,
		AfterJSON:   storage.ToJSONString(ws),
		CreatedAt:   now,
	})

	return ws, nil
}

func (s *WorkspaceService) GetWorkspace(ctx context.Context, id string) (*domain.Workspace, error) {
	return s.repo.GetWorkspace(ctx, id)
}

func (s *WorkspaceService) ListWorkspaces(ctx context.Context) ([]domain.Workspace, error) {
	return s.repo.ListWorkspaces(ctx)
}

func (s *WorkspaceService) GetSnapshot(ctx context.Context, workspaceID string) (*WorkspaceSnapshot, error) {
	ws, err := s.repo.GetWorkspace(ctx, workspaceID)
	if err != nil {
		return nil, err
	}

	dogs, err := s.repo.ListDogsByWorkspace(ctx, workspaceID, true) // include soft-deleted for inspector/dog list toggle
	if err != nil {
		return nil, err
	}

	relationships, err := s.repo.ListParentageByWorkspace(ctx, workspaceID)
	if err != nil {
		return nil, err
	}

	warnings := domain.GenerateWarnings(dogs, relationships)

	// Revision can be calculated from highest dog version or relationship count
	maxRev := 1
	for _, d := range dogs {
		if d.Version > maxRev {
			maxRev = d.Version
		}
	}

	return &WorkspaceSnapshot{
		Workspace:     *ws,
		Revision:      maxRev,
		Dogs:          dogs,
		Relationships: relationships,
		Warnings:      warnings,
	}, nil
}

func (s *WorkspaceService) ExportWorkspace(ctx context.Context, workspaceID string) (*ExportData, error) {
	ws, err := s.repo.GetWorkspace(ctx, workspaceID)
	if err != nil {
		return nil, err
	}

	dogs, err := s.repo.ListDogsByWorkspace(ctx, workspaceID, false) // non-deleted dogs
	if err != nil {
		return nil, err
	}

	relationships, err := s.repo.ListParentageByWorkspace(ctx, workspaceID)
	if err != nil {
		return nil, err
	}

	return &ExportData{
		SchemaVersion: "dog-pedigree.v1",
		ExportedAt:    domain.NowISO(),
		Workspace:     *ws,
		Dogs:          dogs,
		Relationships: relationships,
	}, nil
}

func (s *WorkspaceService) ImportWorkspace(ctx context.Context, data *ExportData, targetWorkspaceID string) (*domain.Workspace, error) {
	if data.SchemaVersion != "dog-pedigree.v1" {
		return nil, fmt.Errorf("%w: unsupported schema version '%s', expected 'dog-pedigree.v1'", domain.ErrInvalidInput, data.SchemaVersion)
	}

	// Validate imported dogs & relationships structure before transaction
	dogIDSet := make(map[string]bool)
	for _, d := range data.Dogs {
		if d.ID == "" {
			return nil, fmt.Errorf("%w: imported dog missing ID", domain.ErrInvalidInput)
		}
		if dogIDSet[d.ID] {
			return nil, fmt.Errorf("%w: duplicate dog ID '%s' in import data", domain.ErrInvalidInput, d.ID)
		}
		dogIDSet[d.ID] = true
	}

	// Check missing parent references and cycles
	for _, rel := range data.Relationships {
		if !dogIDSet[rel.ChildID] {
			return nil, fmt.Errorf("%w: relationship references missing child dog ID '%s'", domain.ErrInvalidInput, rel.ChildID)
		}
		if !dogIDSet[rel.ParentID] {
			return nil, fmt.Errorf("%w: relationship references missing parent dog ID '%s'", domain.ErrInvalidInput, rel.ParentID)
		}
	}

	// Perform import transactionally
	var targetWs *domain.Workspace

	err := s.repo.ExecTx(ctx, func(txRepo storage.Repository) error {
		now := domain.NowISO()

		if targetWorkspaceID != "" {
			// Import into existing workspace
			ws, err := txRepo.GetWorkspace(ctx, targetWorkspaceID)
			if err != nil {
				return err
			}
			targetWs = ws
		} else {
			// Create new workspace from import
			newWsName := data.Workspace.Name
			if newWsName == "" {
				newWsName = "Imported Workspace"
			}
			targetWs = &domain.Workspace{
				ID:        domain.NewID(),
				Name:      newWsName,
				CreatedAt: now,
				UpdatedAt: now,
			}
			if err := txRepo.CreateWorkspace(ctx, targetWs); err != nil {
				return err
			}
		}

		// Remap or insert dogs
		for _, d := range data.Dogs {
			d.WorkspaceID = targetWs.ID
			if d.CreatedAt == "" {
				d.CreatedAt = now
			}
			d.UpdatedAt = now
			d.Version = 1
			d.DeletedAt = nil

			if err := domain.ValidateDog(&d); err != nil {
				return fmt.Errorf("invalid dog '%s': %w", d.Name, err)
			}

			// Check if dog exists in workspace
			_, err := txRepo.GetDog(ctx, d.ID)
			if err == domain.ErrNotFound {
				if err := txRepo.CreateDog(ctx, &d); err != nil {
					return fmt.Errorf("failed to create dog %s: %w", d.Name, err)
				}
			} else if err == nil {
				if err := txRepo.UpdateDog(ctx, &d); err != nil {
					return fmt.Errorf("failed to update dog %s: %w", d.Name, err)
				}
			} else {
				return err
			}
		}

		// Check cycles across all relationships to be imported
		for _, rel := range data.Relationships {
			rel.WorkspaceID = targetWs.ID
			if rel.ID == "" {
				rel.ID = domain.NewID()
			}
			rel.CreatedAt = now
			rel.UpdatedAt = now

			if err := domain.ValidateParentageEnums(&rel); err != nil {
				return fmt.Errorf("invalid parentage enum in import: %w", err)
			}

			// Save parentage
			_ = txRepo.DeleteParentage(ctx, rel.ID) // Remove existing if re-importing
			if err := txRepo.CreateParentage(ctx, &rel); err != nil {
				return fmt.Errorf("failed to insert imported parentage: %w", err)
			}
		}

		// Verify final ancestry graph in target workspace has no cycles
		allRels, err := txRepo.ListParentageByWorkspace(ctx, targetWs.ID)
		if err != nil {
			return err
		}
		for _, r := range allRels {
			if err := domain.CheckAncestryCycle(r.ChildID, r.ParentID, allRels, r.ID); err != nil {
				return fmt.Errorf("import created ancestry cycle: %w", err)
			}
		}

		_ = txRepo.CreateAuditEvent(ctx, &domain.AuditEvent{
			ID:          domain.NewID(),
			WorkspaceID: targetWs.ID,
			EventType:   "IMPORT",
			EntityType:  "WORKSPACE",
			EntityID:    targetWs.ID,
			BeforeJSON:  nil,
			AfterJSON:   storage.ToJSONString(targetWs),
			CreatedAt:   now,
		})

		return nil
	})

	if err != nil {
		return nil, err
	}

	return targetWs, nil
}

func (s *WorkspaceService) CreateBackup(ctx context.Context, backupDir string) (string, error) {
	fileName := fmt.Sprintf("backup_%s.sqlite", domain.NowISO())
	fullPath := filepath.Join(backupDir, fileName)
	err := s.repo.CreateBackup(ctx, fullPath)
	if err != nil {
		return "", err
	}
	return fullPath, nil
}
