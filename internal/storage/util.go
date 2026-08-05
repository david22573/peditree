package storage

import "encoding/json"

// ToJSONString converts any struct/value to a JSON string pointer for audit logging
func ToJSONString(v any) *string {
	if v == nil {
		return nil
	}
	b, err := json.Marshal(v)
	if err != nil {
		return nil
	}
	s := string(b)
	return &s
}
