package domain

type SavedLayout struct {
	WorkspaceID string  `json:"workspace_id"`
	ViewID      string  `json:"view_id"`
	DogID       string  `json:"dog_id"`
	X           float64 `json:"x"`
	Y           float64 `json:"y"`
	Pinned      bool    `json:"pinned"`
	UpdatedAt   string  `json:"updated_at"`
}
