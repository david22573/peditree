package application

import (
	"context"
	"fmt"

	"dog-pedigree/internal/domain"
	"dog-pedigree/internal/storage"
)

type PedigreeService struct {
	repo storage.Repository
}

func NewPedigreeService(repo storage.Repository) *PedigreeService {
	return &PedigreeService{repo: repo}
}

func (s *PedigreeService) CreateParentage(ctx context.Context, p *domain.Parentage) (*domain.Parentage, error) {
	if p.ID == "" {
		p.ID = domain.NewID()
	}
	now := domain.NowISO()
	p.CreatedAt = now
	p.UpdatedAt = now

	if err := domain.ValidateParentageEnums(p); err != nil {
		return nil, err
	}

	var created *domain.Parentage

	// Perform all parentage creation & validation inside ONE single database transaction
	err := s.repo.ExecTx(ctx, func(txRepo storage.Repository) error {
		// 1. Fetch workspace dogs & relationships
		dogsList, err := txRepo.ListDogsByWorkspace(ctx, p.WorkspaceID, false)
		if err != nil {
			return fmt.Errorf("failed to list workspace dogs: %w", err)
		}
		dogMap := make(map[string]*domain.Dog)
		for i := range dogsList {
			dogMap[dogsList[i].ID] = &dogsList[i]
		}

		existingRels, err := txRepo.ListParentageByWorkspace(ctx, p.WorkspaceID)
		if err != nil {
			return fmt.Errorf("failed to list workspace parentage: %w", err)
		}

		// 2. Self parenting & ancestry cycle check
		if err := domain.CheckAncestryCycle(p.ChildID, p.ParentID, existingRels, ""); err != nil {
			return err
		}

		// 3. Cardinality & workspace consistency check
		if err := domain.CheckParentageCardinality(p, existingRels, dogMap); err != nil {
			return err
		}

		// 4. Create relationship
		if err := txRepo.CreateParentage(ctx, p); err != nil {
			return fmt.Errorf("failed to insert parentage: %w", err)
		}

		created = p

		// 5. Audit event
		_ = txRepo.CreateAuditEvent(ctx, &domain.AuditEvent{
			ID:          domain.NewID(),
			WorkspaceID: p.WorkspaceID,
			EventType:   "CREATE",
			EntityType:  "PARENTAGE",
			EntityID:    p.ID,
			BeforeJSON:  nil,
			AfterJSON:   storage.ToJSONString(created),
			CreatedAt:   now,
		})

		return nil
	})

	if err != nil {
		return nil, err
	}

	return created, nil
}

func (s *PedigreeService) UpdateParentage(ctx context.Context, p *domain.Parentage) (*domain.Parentage, error) {
	p.UpdatedAt = domain.NowISO()

	if err := domain.ValidateParentageEnums(p); err != nil {
		return nil, err
	}

	var updated *domain.Parentage

	err := s.repo.ExecTx(ctx, func(txRepo storage.Repository) error {
		existing, err := txRepo.GetParentage(ctx, p.ID)
		if err != nil {
			return err
		}
		beforeJSON := storage.ToJSONString(existing)

		p.WorkspaceID = existing.WorkspaceID
		p.ChildID = existing.ChildID
		p.ParentID = existing.ParentID

		dogsList, err := txRepo.ListDogsByWorkspace(ctx, p.WorkspaceID, false)
		if err != nil {
			return err
		}
		dogMap := make(map[string]*domain.Dog)
		for i := range dogsList {
			dogMap[dogsList[i].ID] = &dogsList[i]
		}

		existingRels, err := txRepo.ListParentageByWorkspace(ctx, p.WorkspaceID)
		if err != nil {
			return err
		}

		if err := domain.CheckParentageCardinality(p, existingRels, dogMap); err != nil {
			return err
		}

		if err := txRepo.UpdateParentage(ctx, p); err != nil {
			return err
		}

		updated = p

		_ = txRepo.CreateAuditEvent(ctx, &domain.AuditEvent{
			ID:          domain.NewID(),
			WorkspaceID: p.WorkspaceID,
			EventType:   "UPDATE",
			EntityType:  "PARENTAGE",
			EntityID:    p.ID,
			BeforeJSON:  beforeJSON,
			AfterJSON:   storage.ToJSONString(updated),
			CreatedAt:   p.UpdatedAt,
		})

		return nil
	})

	if err != nil {
		return nil, err
	}

	return updated, nil
}

func (s *PedigreeService) DeleteParentage(ctx context.Context, relationshipID string) error {
	return s.repo.ExecTx(ctx, func(txRepo storage.Repository) error {
		existing, err := txRepo.GetParentage(ctx, relationshipID)
		if err != nil {
			return err
		}
		beforeJSON := storage.ToJSONString(existing)

		if err := txRepo.DeleteParentage(ctx, relationshipID); err != nil {
			return err
		}

		_ = txRepo.CreateAuditEvent(ctx, &domain.AuditEvent{
			ID:          domain.NewID(),
			WorkspaceID: existing.WorkspaceID,
			EventType:   "DELETE",
			EntityType:  "PARENTAGE",
			EntityID:    relationshipID,
			BeforeJSON:  beforeJSON,
			AfterJSON:   nil,
			CreatedAt:   domain.NowISO(),
		})

		return nil
	})
}
