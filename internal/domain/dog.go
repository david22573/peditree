package domain

type Sex string

const (
	SexMale    Sex = "M"
	SexFemale  Sex = "F"
	SexUnknown Sex = "UNKNOWN"
)

func (s Sex) IsValid() bool {
	switch s {
	case SexMale, SexFemale, SexUnknown:
		return true
	default:
		return false
	}
}

type Dog struct {
	ID                 string  `json:"id"`
	WorkspaceID        string  `json:"workspace_id"`
	Name               string  `json:"name"`
	RegisteredName     string  `json:"registered_name"`
	Sex                Sex     `json:"sex"`
	Breed              string  `json:"breed"`
	BirthDate          *string `json:"birth_date"`
	DeathDate          *string `json:"death_date"`
	RegistrationNumber string  `json:"registration_number"`
	MicrochipNumber    string  `json:"microchip_number"`
	Color              string  `json:"color"`
	Notes              string  `json:"notes"`
	Version            int     `json:"version"`
	CreatedAt          string  `json:"created_at"`
	UpdatedAt          string  `json:"updated_at"`
	DeletedAt          *string `json:"deleted_at"`
}
