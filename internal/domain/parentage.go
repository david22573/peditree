package domain

type Role string

const (
	RoleSire   Role = "SIRE"
	RoleDam    Role = "DAM"
	RoleParent Role = "PARENT"
)

func (r Role) IsValid() bool {
	switch r {
	case RoleSire, RoleDam, RoleParent:
		return true
	default:
		return false
	}
}

type RelationshipType string

const (
	RelBiological RelationshipType = "BIOLOGICAL"
	RelAdoptive   RelationshipType = "ADOPTIVE"
	RelFoster     RelationshipType = "FOSTER"
	RelUnknown    RelationshipType = "UNKNOWN"
)

func (rt RelationshipType) IsValid() bool {
	switch rt {
	case RelBiological, RelAdoptive, RelFoster, RelUnknown:
		return true
	default:
		return false
	}
}

type Confidence string

const (
	ConfConfirmed Confidence = "CONFIRMED"
	ConfProbable  Confidence = "PROBABLE"
	ConfPossible  Confidence = "POSSIBLE"
)

func (c Confidence) IsValid() bool {
	switch c {
	case ConfConfirmed, ConfProbable, ConfPossible:
		return true
	default:
		return false
	}
}

type Parentage struct {
	ID               string           `json:"id"`
	WorkspaceID      string           `json:"workspace_id"`
	ChildID          string           `json:"child_id"`
	ParentID         string           `json:"parent_id"`
	Role             Role             `json:"role"`
	RelationshipType RelationshipType `json:"relationship_type"`
	Confidence       Confidence       `json:"confidence"`
	SourceNote       string           `json:"source_note"`
	CreatedAt        string           `json:"created_at"`
	UpdatedAt        string           `json:"updated_at"`
}
