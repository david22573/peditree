package storage

import (
	"context"
	"database/sql"
	"dog-pedigree/internal/domain"
)

type Repository interface {
	ExecTx(ctx context.Context, fn func(txRepo Repository) error) error

	// Workspaces
	CreateWorkspace(ctx context.Context, ws *domain.Workspace) error
	GetWorkspace(ctx context.Context, id string) (*domain.Workspace, error)
	ListWorkspaces(ctx context.Context) ([]domain.Workspace, error)

	// Dogs
	CreateDog(ctx context.Context, dog *domain.Dog) error
	GetDog(ctx context.Context, id string) (*domain.Dog, error)
	UpdateDog(ctx context.Context, dog *domain.Dog) error
	SoftDeleteDog(ctx context.Context, dogID string, expectedVersion int) (*domain.Dog, error)
	RestoreDog(ctx context.Context, dogID string) (*domain.Dog, error)
	ListDogsByWorkspace(ctx context.Context, workspaceID string, includeDeleted bool) ([]domain.Dog, error)

	// Parentage
	CreateParentage(ctx context.Context, p *domain.Parentage) error
	GetParentage(ctx context.Context, id string) (*domain.Parentage, error)
	UpdateParentage(ctx context.Context, p *domain.Parentage) error
	DeleteParentage(ctx context.Context, id string) error
	ListParentageByWorkspace(ctx context.Context, workspaceID string) ([]domain.Parentage, error)
	ListParentageByDog(ctx context.Context, dogID string) ([]domain.Parentage, error)

	// Saved Layouts
	SaveLayouts(ctx context.Context, workspaceID string, layouts []domain.SavedLayout) error
	GetLayouts(ctx context.Context, workspaceID string, viewID string) ([]domain.SavedLayout, error)

	// Audit
	CreateAuditEvent(ctx context.Context, event *domain.AuditEvent) error
	ListAuditEvents(ctx context.Context, workspaceID string) ([]domain.AuditEvent, error)

	// Backup
	CreateBackup(ctx context.Context, destPath string) error

	// Raw DB access if needed by migrations
	DB() *sql.DB
}
