package domain

import "errors"

var (
	ErrNotFound                = errors.New("record not found")
	ErrConflict                = errors.New("optimistic concurrency conflict: record version mismatch")
	ErrInvalidInput            = errors.New("invalid input data")
	ErrSelfParenting           = errors.New("a dog cannot be its own parent")
	ErrAncestryCycle           = errors.New("operation would create an ancestry cycle")
	ErrCrossWorkspace          = errors.New("cannot link dogs from different workspaces")
	ErrDuplicateRelationship   = errors.New("exact duplicate parentage relationship already exists")
	ErrMultipleConfirmedSire   = errors.New("child cannot have more than one confirmed biological sire")
	ErrMultipleConfirmedDam    = errors.New("child cannot have more than one confirmed biological dam")
	ErrSameSireAndDam          = errors.New("the same dog cannot be both confirmed biological sire and dam for a child")
	ErrUnsupportedEnum         = errors.New("unsupported enum value")
	ErrDeletedDogReferenced    = errors.New("referenced dog is deleted")
)
