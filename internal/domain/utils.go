package domain

import (
	"time"

	"github.com/google/uuid"
)

func NewID() string {
	return uuid.New().String()
}

func NowISO() string {
	return time.Now().UTC().Format(time.RFC3339)
}
