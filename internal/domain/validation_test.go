package domain_test

import (
	"testing"

	"dog-pedigree/internal/domain"
)

func TestValidateDog(t *testing.T) {
	d := &domain.Dog{
		ID:          "dog-1",
		WorkspaceID: "ws-1",
		Name:        "Buddy",
		Sex:         domain.SexMale,
	}
	if err := domain.ValidateDog(d); err != nil {
		t.Fatalf("expected valid dog, got %v", err)
	}

	dInvalidSex := *d
	dInvalidSex.Sex = "INVALID"
	if err := domain.ValidateDog(&dInvalidSex); err != domain.ErrUnsupportedEnum {
		t.Fatalf("expected ErrUnsupportedEnum, got %v", err)
	}

	dEmptyName := *d
	dEmptyName.Name = ""
	if err := domain.ValidateDog(&dEmptyName); err != domain.ErrInvalidInput {
		t.Fatalf("expected ErrInvalidInput, got %v", err)
	}
}

func TestAncestryCycleDetection(t *testing.T) {
	// Setup existing relationships:
	// A -> B (A is parent of B)
	// B -> C (B is parent of C)
	existing := []domain.Parentage{
		{ID: "rel-1", WorkspaceID: "ws-1", ChildID: "dog-B", ParentID: "dog-A"},
		{ID: "rel-2", WorkspaceID: "ws-1", ChildID: "dog-C", ParentID: "dog-B"},
	}

	// 1. Self parenting check
	err := domain.CheckAncestryCycle("dog-A", "dog-A", existing, "")
	if err != domain.ErrSelfParenting {
		t.Fatalf("expected ErrSelfParenting, got %v", err)
	}

	// 2. Valid parentage: D -> A (D is parent of A)
	err = domain.CheckAncestryCycle("dog-A", "dog-D", existing, "")
	if err != nil {
		t.Fatalf("expected valid parentage, got %v", err)
	}

	// 3. Cycle: C -> A (Attempt to make C a parent of A, when A -> B -> C)
	err = domain.CheckAncestryCycle("dog-A", "dog-C", existing, "")
	if err != domain.ErrAncestryCycle {
		t.Fatalf("expected ErrAncestryCycle, got %v", err)
	}
}

func TestParentageCardinality(t *testing.T) {
	dogMap := map[string]*domain.Dog{
		"dog-child":  {ID: "dog-child", WorkspaceID: "ws-1", Name: "Child", Sex: domain.SexMale},
		"dog-sire1":  {ID: "dog-sire1", WorkspaceID: "ws-1", Name: "Sire 1", Sex: domain.SexMale},
		"dog-sire2":  {ID: "dog-sire2", WorkspaceID: "ws-1", Name: "Sire 2", Sex: domain.SexMale},
		"dog-dam1":   {ID: "dog-dam1", WorkspaceID: "ws-1", Name: "Dam 1", Sex: domain.SexFemale},
		"dog-other":  {ID: "dog-other", WorkspaceID: "ws-2", Name: "Other WS Dog", Sex: domain.SexFemale},
	}

	existing := []domain.Parentage{
		{
			ID:               "rel-1",
			WorkspaceID:      "ws-1",
			ChildID:          "dog-child",
			ParentID:         "dog-sire1",
			Role:             domain.RoleSire,
			RelationshipType: domain.RelBiological,
			Confidence:       domain.ConfConfirmed,
		},
	}

	// 1. Duplicate sire confirmed check
	targetSire2 := &domain.Parentage{
		ID:               "rel-2",
		WorkspaceID:      "ws-1",
		ChildID:          "dog-child",
		ParentID:         "dog-sire2",
		Role:             domain.RoleSire,
		RelationshipType: domain.RelBiological,
		Confidence:       domain.ConfConfirmed,
	}

	err := domain.CheckParentageCardinality(targetSire2, existing, dogMap)
	if err != domain.ErrMultipleConfirmedSire {
		t.Fatalf("expected ErrMultipleConfirmedSire, got %v", err)
	}

	// 2. Valid dam assignment
	targetDam := &domain.Parentage{
		ID:               "rel-3",
		WorkspaceID:      "ws-1",
		ChildID:          "dog-child",
		ParentID:         "dog-dam1",
		Role:             domain.RoleDam,
		RelationshipType: domain.RelBiological,
		Confidence:       domain.ConfConfirmed,
	}

	err = domain.CheckParentageCardinality(targetDam, existing, dogMap)
	if err != nil {
		t.Fatalf("expected valid dam assignment, got %v", err)
	}

	// 3. Cross workspace check
	targetCrossWS := &domain.Parentage{
		ID:               "rel-4",
		WorkspaceID:      "ws-1",
		ChildID:          "dog-child",
		ParentID:         "dog-other",
		Role:             domain.RoleDam,
		RelationshipType: domain.RelBiological,
		Confidence:       domain.ConfConfirmed,
	}

	err = domain.CheckParentageCardinality(targetCrossWS, existing, dogMap)
	if err != domain.ErrCrossWorkspace {
		t.Fatalf("expected ErrCrossWorkspace, got %v", err)
	}
}

func TestGenerateWarnings(t *testing.T) {
	childBirth := "2023-01-01"
	parentBirthAfter := "2023-06-01"

	dogs := []domain.Dog{
		{ID: "child", WorkspaceID: "ws-1", Name: "Child Dog", Sex: domain.SexMale, BirthDate: &childBirth, RegistrationNumber: "REG123"},
		{ID: "parent", WorkspaceID: "ws-1", Name: "Parent Dog", Sex: domain.SexFemale, BirthDate: &parentBirthAfter, RegistrationNumber: "REG123"}, // Sire female & born after child & duplicate reg!
	}

	rels := []domain.Parentage{
		{
			ID:               "rel-1",
			WorkspaceID:      "ws-1",
			ChildID:          "child",
			ParentID:         "parent",
			Role:             domain.RoleSire,
			RelationshipType: domain.RelBiological,
			Confidence:       domain.ConfConfirmed,
		},
	}

	warnings := domain.GenerateWarnings(dogs, rels)
	if len(warnings) == 0 {
		t.Fatalf("expected warnings, got 0")
	}

	hasSireNotMale := false
	hasBornAfter := false
	hasDuplicateReg := false

	for _, w := range warnings {
		if w.Code == "SIRE_NOT_MALE" {
			hasSireNotMale = true
		}
		if w.Code == "PARENT_BORN_AFTER_CHILD" {
			hasBornAfter = true
		}
		if w.Code == "DUPLICATE_REGISTRATION_NUMBER" {
			hasDuplicateReg = true
		}
	}

	if !hasSireNotMale || !hasBornAfter || !hasDuplicateReg {
		t.Fatalf("missing expected warning flags: sireNotMale=%v, bornAfter=%v, dupReg=%v", hasSireNotMale, hasBornAfter, hasDuplicateReg)
	}
}
