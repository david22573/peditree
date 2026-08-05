.PHONY: dev build test lint migrate-up check clean

GO ?= GOWORK=off go
NODE ?= node

dev:
	@echo "Starting development backend on :8080 and frontend on :5173..."
	$(GO) run cmd/server/main.go & (cd web && $(NODE) ./node_modules/vite/bin/vite.js)

build-frontend:
	@echo "Building frontend bundle..."
	cd web && $(NODE) ./node_modules/typescript/bin/tsc --noEmit
	cd web && $(NODE) ./node_modules/vite/bin/vite.js build
	mkdir -p cmd/server/dist && cp -r web/dist/* cmd/server/dist/

build-backend: build-frontend
	@echo "Building Go backend binary..."
	$(GO) build -o bin/dog-pedigree cmd/server/main.go

build: build-backend

test-backend:
	@echo "Running Go backend tests..."
	$(GO) test -v ./internal/... ./cmd/...

test-frontend:
	@echo "Running Vitest frontend unit tests..."
	cd web && $(NODE) ./node_modules/vitest/vitest.mjs run

test: test-backend test-frontend

lint:
	@echo "Running type check..."
	cd web && $(NODE) ./node_modules/typescript/bin/tsc --noEmit
	$(GO) vet ./...

migrate-up:
	@echo "Migrations are applied automatically on startup by embedded migration runner."

check: lint test build
	@echo "All pre-commit checks passed!"

clean:
	rm -rf bin/ web/dist/ pedigree.db data/ backups/
