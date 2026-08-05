package domain

import (
	"strings"
	"time"
)

type ValidationWarning struct {
	Code       string `json:"code"`
	Message    string `json:"message"`
	EntityID   string `json:"entity_id"`
	EntityType string `json:"entity_type"`
}

// ValidateDog checks dog field constraints
func ValidateDog(d *Dog) error {
	if strings.TrimSpace(d.ID) == "" || strings.TrimSpace(d.WorkspaceID) == "" {
		return ErrInvalidInput
	}
	if strings.TrimSpace(d.Name) == "" {
		return ErrInvalidInput
	}
	if !d.Sex.IsValid() {
		return ErrUnsupportedEnum
	}
	return nil
}

// ValidateParentageEnums checks parentage enum fields
func ValidateParentageEnums(p *Parentage) error {
	if !p.Role.IsValid() || !p.RelationshipType.IsValid() || !p.Confidence.IsValid() {
		return ErrUnsupportedEnum
	}
	return nil
}

// CheckAncestryCycle tests if adding or updating parentage (parentID -> childID) creates a cycle
// existingRelationships is the full set of parentage relationships in the workspace.
// relationshipIDBeingUpdated is empty string for new insert, or ID of relationship being patched.
func CheckAncestryCycle(childID, parentID string, existingRelationships []Parentage, relationshipIDBeingUpdated string) error {
	if childID == parentID {
		return ErrSelfParenting
	}

	// Build parent map: childID -> list of parentIDs
	parentMap := make(map[string][]string)
	for _, rel := range existingRelationships {
		if rel.ID == relationshipIDBeingUpdated {
			continue // Skip the relationship being updated
		}
		parentMap[rel.ChildID] = append(parentMap[rel.ChildID], rel.ParentID)
	}

	// Add proposed relationship: childID -> parentID
	parentMap[childID] = append(parentMap[childID], parentID)

	// Cycle detection using DFS with visited set for cycle detection from any starting node
	visited := make(map[string]int) // 0: unvisited, 1: visiting, 2: visited

	var dfs func(node string) bool
	dfs = func(node string) bool {
		visited[node] = 1
		for _, p := range parentMap[node] {
			if visited[p] == 1 {
				return true // Cycle detected!
			}
			if visited[p] == 0 {
				if dfs(p) {
					return true
				}
			}
		}
		visited[node] = 2
		return false
	}

	for node := range parentMap {
		if visited[node] == 0 {
			if dfs(node) {
				return ErrAncestryCycle
			}
		}
	}

	return nil
}

// CheckParentageCardinality checks confirmed biological sire/dam limits for a child
func CheckParentageCardinality(target *Parentage, existing []Parentage, dogsByID map[string]*Dog) error {
	// Check cross workspace
	childDog, childExists := dogsByID[target.ChildID]
	parentDog, parentExists := dogsByID[target.ParentID]

	if !childExists || !parentExists {
		return ErrNotFound
	}

	if childDog.DeletedAt != nil || parentDog.DeletedAt != nil {
		return ErrDeletedDogReferenced
	}

	if childDog.WorkspaceID != target.WorkspaceID || parentDog.WorkspaceID != target.WorkspaceID {
		return ErrCrossWorkspace
	}

	// Check duplicates & cardinality
	for _, rel := range existing {
		if rel.ID == target.ID {
			continue
		}
		// Exact duplicate relationship
		if rel.ChildID == target.ChildID && rel.ParentID == target.ParentID {
			return ErrDuplicateRelationship
		}

		// Confirmed sire / dam checks for same child
		if rel.ChildID == target.ChildID {
			// Check if target dog is assigned as both sire and dam to same child
			if rel.ParentID == target.ParentID {
				if (rel.Role == RoleSire && target.Role == RoleDam) || (rel.Role == RoleDam && target.Role == RoleSire) {
					return ErrSameSireAndDam
				}
			}

			// Confirmed biological sire rule
			if target.Role == RoleSire && target.RelationshipType == RelBiological && target.Confidence == ConfConfirmed {
				if rel.Role == RoleSire && rel.RelationshipType == RelBiological && rel.Confidence == ConfConfirmed {
					return ErrMultipleConfirmedSire
				}
			}

			// Confirmed biological dam rule
			if target.Role == RoleDam && target.RelationshipType == RelBiological && target.Confidence == ConfConfirmed {
				if rel.Role == RoleDam && rel.RelationshipType == RelBiological && rel.Confidence == ConfConfirmed {
					return ErrMultipleConfirmedDam
				}
			}
		}
	}

	return nil
}

// GenerateWarnings calculates non-fatal data quality warnings for a workspace snapshot
func GenerateWarnings(dogs []Dog, parentages []Parentage) []ValidationWarning {
	var warnings []ValidationWarning

	dogMap := make(map[string]*Dog)
	activeDogs := make([]Dog, 0)
	for i := range dogs {
		if dogs[i].DeletedAt == nil {
			dogMap[dogs[i].ID] = &dogs[i]
			activeDogs = append(activeDogs, dogs[i])
		}
	}

	// Check registration / microchip duplicates
	regCount := make(map[string][]string)
	chipCount := make(map[string][]string)

	for _, d := range activeDogs {
		if strings.TrimSpace(d.RegistrationNumber) != "" {
			regCount[d.RegistrationNumber] = append(regCount[d.RegistrationNumber], d.ID)
		}
		if strings.TrimSpace(d.MicrochipNumber) != "" {
			chipCount[d.MicrochipNumber] = append(chipCount[d.MicrochipNumber], d.ID)
		}
	}

	for regNum, ids := range regCount {
		if len(ids) > 1 {
			for _, id := range ids {
				warnings = append(warnings, ValidationWarning{
					Code:       "DUPLICATE_REGISTRATION_NUMBER",
					Message:    "Registration number " + regNum + " is used by multiple dogs",
					EntityID:   id,
					EntityType: "DOG",
				})
			}
		}
	}

	for chipNum, ids := range chipCount {
		if len(ids) > 1 {
			for _, id := range ids {
				warnings = append(warnings, ValidationWarning{
					Code:       "DUPLICATE_MICROCHIP_NUMBER",
					Message:    "Microchip number " + chipNum + " is used by multiple dogs",
					EntityID:   id,
					EntityType: "DOG",
				})
			}
		}
	}

	// Track parentage per child
	childParents := make(map[string][]Parentage)

	for _, rel := range parentages {
		child, childOk := dogMap[rel.ChildID]
		parent, parentOk := dogMap[rel.ParentID]

		if !childOk || !parentOk {
			continue
		}

		childParents[rel.ChildID] = append(childParents[rel.ChildID], rel)

		// Check sire/dam sex mismatch
		if rel.Role == RoleSire && parent.Sex != SexMale {
			warnings = append(warnings, ValidationWarning{
				Code:       "SIRE_NOT_MALE",
				Message:    "Sire " + parent.Name + " is not marked as Male",
				EntityID:   rel.ID,
				EntityType: "PARENTAGE",
			})
		}
		if rel.Role == RoleDam && parent.Sex != SexFemale {
			warnings = append(warnings, ValidationWarning{
				Code:       "DAM_NOT_FEMALE",
				Message:    "Dam " + parent.Name + " is not marked as Female",
				EntityID:   rel.ID,
				EntityType: "PARENTAGE",
			})
		}

		// Check uncertain parentage
		if rel.Confidence != ConfConfirmed || rel.RelationshipType != RelBiological {
			warnings = append(warnings, ValidationWarning{
				Code:       "UNCERTAIN_PARENTAGE",
				Message:    "Parentage for " + child.Name + " has confidence " + string(rel.Confidence) + " and type " + string(rel.RelationshipType),
				EntityID:   rel.ID,
				EntityType: "PARENTAGE",
			})
		}

		// Check birth date logic
		if child.BirthDate != nil && parent.BirthDate != nil {
			childBirth, err1 := parseDate(*child.BirthDate)
			parentBirth, err2 := parseDate(*parent.BirthDate)

			if err1 == nil && err2 == nil {
				if parentBirth.After(childBirth) {
					warnings = append(warnings, ValidationWarning{
						Code:       "PARENT_BORN_AFTER_CHILD",
						Message:    "Parent " + parent.Name + " was born after child " + child.Name,
						EntityID:   rel.ID,
						EntityType: "PARENTAGE",
					})
				} else {
					// Implausibly young parent (< 180 days)
					days := childBirth.Sub(parentBirth).Hours() / 24
					if days < 180 {
						warnings = append(warnings, ValidationWarning{
							Code:       "PARENT_IMPLAUSIBLY_YOUNG",
							Message:    "Parent " + parent.Name + " was less than 6 months old when child " + child.Name + " was born",
							EntityID:   rel.ID,
							EntityType: "PARENTAGE",
						})
					}
				}
			}
		}
	}

	// Check incomplete parentage for dogs that have at least 1 parent recorded
	for childID, rels := range childParents {
		child := dogMap[childID]
		hasSire := false
		hasDam := false

		for _, r := range rels {
			if r.Role == RoleSire {
				hasSire = true
			}
			if r.Role == RoleDam {
				hasDam = true
			}
		}

		if (hasSire && !hasDam) || (!hasSire && hasDam) {
			warnings = append(warnings, ValidationWarning{
				Code:       "INCOMPLETE_PARENTAGE",
				Message:    "Dog " + child.Name + " has incomplete parentage (missing sire or dam)",
				EntityID:   child.ID,
				EntityType: "DOG",
			})
		}
	}

	return warnings
}

func parseDate(s string) (time.Time, error) {
	if len(s) >= 10 {
		// Try YYYY-MM-DD first
		t, err := time.Parse("2006-01-02", s[:10])
		if err == nil {
			return t, nil
		}
	}
	return time.Parse(time.RFC3339, s)
}
