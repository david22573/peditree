package domain

type AuditEvent struct {
	ID          string  `json:"id"`
	WorkspaceID string  `json:"workspace_id"`
	EventType   string  `json:"event_type"`
	EntityType  string  `json:"entity_type"`
	EntityID    string  `json:"entity_id"`
	BeforeJSON  *string `json:"before_json"`
	AfterJSON   *string `json:"after_json"`
	CreatedAt   string  `json:"created_at"`
}
