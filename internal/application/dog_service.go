package application

import (
	"context"
	"fmt"

	"dog-pedigree/internal/domain"
	"dog-pedigree/internal/storage"
)

type DeleteDogResult struct {
	Dog                   *domain.Dog        `json:"dog"`
	AffectedRelationships []domain.Parentage `json:"affected_relationships"`
}

type DogService struct {
	repo storage.Repository
}

func NewDogService(repo storage.Repository) *DogService {
	return &DogService{repo: repo}
}

func (s *DogService) CreateDog(ctx context.Context, dog *domain.Dog) (*domain.Dog, error) {
	if dog.ID == "" {
		dog.ID = domain.NewID()
	}
	now := domain.NowISO()
	dog.CreatedAt = now
	dog.UpdatedAt = now
	dog.Version = 1

	if err := domain.ValidateDog(dog); err != nil {
		return nil, err
	}

	err := s.repo.ExecTx(ctx, func(txRepo storage.Repository) error {
		// Ensure workspace exists
		_, err := txRepo.GetWorkspace(ctx, dog.WorkspaceID)
		if err != nil {
			return fmt.Errorf("workspace error: %w", err)
		}

		if err := txRepo.CreateDog(ctx, dog); err != nil {
			return err
		}

		_ = txRepo.CreateAuditEvent(ctx, &domain.AuditEvent{
			ID:          domain.NewID(),
			WorkspaceID: dog.WorkspaceID,
			EventType:   "CREATE",
			EntityType:  "DOG",
			EntityID:    dog.ID,
			BeforeJSON:  nil,
			AfterJSON:   storage.ToJSONString(dog),
			CreatedAt:   now,
		})
		return nil
	})

	if err != nil {
		return nil, err
	}

	return dog, nil
}

func (s *DogService) GetDog(ctx context.Context, dogID string) (*domain.Dog, error) {
	return s.repo.GetDog(ctx, dogID)
}

func (s *DogService) UpdateDog(ctx context.Context, dog *domain.Dog) (*domain.Dog, error) {
	if err := domain.ValidateDog(dog); err != nil {
		return nil, err
	}
	dog.UpdatedAt = domain.NowISO()

	var updatedDog *domain.Dog

	err := s.repo.ExecTx(ctx, func(txRepo storage.Repository) error {
		existing, err := txRepo.GetDog(ctx, dog.ID)
		if err != nil {
			return err
		}

		beforeJSON := storage.ToJSONString(existing)

		if err := txRepo.UpdateDog(ctx, dog); err != nil {
			return err
		}

		updatedDog = dog

		_ = txRepo.CreateAuditEvent(ctx, &domain.AuditEvent{
			ID:          domain.NewID(),
			WorkspaceID: dog.WorkspaceID,
			EventType:   "UPDATE",
			EntityType:  "DOG",
			EntityID:    dog.ID,
			BeforeJSON:  beforeJSON,
			AfterJSON:   storage.ToJSONString(updatedDog),
			CreatedAt:   dog.UpdatedAt,
		})

		return nil
	})

	if err != nil {
		return nil, err
	}

	return updatedDog, nil
}

func (s *DogService) SoftDeleteDog(ctx context.Context, dogID string, expectedVersion int) (*DeleteDogResult, error) {
	var result DeleteDogResult

	err := s.repo.ExecTx(ctx, func(txRepo storage.Repository) error {
		existing, err := txRepo.GetDog(ctx, dogID)
		if err != nil {
			return err
		}

		beforeJSON := storage.ToJSONString(existing)

		// Get affected relationships
		rels, err := txRepo.ListParentageByDog(ctx, dogID)
		if err != nil {
			return err
		}
		result.AffectedRelationships = rels

		// Perform soft delete
		deleted, err := txRepo.SoftDeleteDog(ctx, dogID, expectedVersion)
		if err != nil {
			return err
		}
		result.Dog = deleted

		_ = txRepo.CreateAuditEvent(ctx, &domain.AuditEvent{
			ID:          domain.NewID(),
			WorkspaceID: existing.WorkspaceID,
			EventType:   "DELETE",
			EntityType:  "DOG",
			EntityID:    dogID,
			BeforeJSON:  beforeJSON,
			AfterJSON:   storage.ToJSONString(deleted),
			CreatedAt:   domain.NowISO(),
		})

		return nil
	})

	if err != nil {
		return nil, err
	}

	return &result, nil
}

func (s *DogService) RestoreDog(ctx context.Context, dogID string) (*domain.Dog, error) {
	var restored *domain.Dog

	err := s.repo.ExecTx(ctx, func(txRepo storage.Repository) error {
		existing, err := txRepo.GetDog(ctx, dogID)
		if err != nil {
			return err
		}

		beforeJSON := storage.ToJSONString(existing)

		d, err := txRepo.RestoreDog(ctx, dogID)
		if err != nil {
			return err
		}
		restored = d

		_ = txRepo.CreateAuditEvent(ctx, &domain.AuditEvent{
			ID:          domain.NewID(),
			WorkspaceID: existing.WorkspaceID,
			EventType:   "RESTORE",
			EntityType:  "DOG",
			EntityID:    dogID,
			BeforeJSON:  beforeJSON,
			AfterJSON:   storage.ToJSONString(restored),
			CreatedAt:   domain.NowISO(),
		})

		return nil
	})

	if err != nil {
		return nil, err
	}

	return restored, nil
}
