# 🐕 Dog Pedigree Editor (Peditree)

A secure, maintainable, local-first web application for creating, editing, viewing, validating, importing, and exporting dog pedigree data.

---

## 🏛️ Core Architecture & Design Decisions

### Source of Truth
The durable source of truth consists strictly of normalized relational records stored in SQLite:
* `dogs` table: Contains dog profiles, sex (`M`, `F`, `UNKNOWN`), breeds, registration numbers, dates, version counter for optimistic locking, and soft deletion (`deleted_at`).
* `parentage` table: Stores parent-child links separately from dog records, specifying parent role (`SIRE`, `DAM`, `PARENT`), relationship type (`BIOLOGICAL`, `ADOPTIVE`, `FOSTER`, `UNKNOWN`), and confidence (`CONFIRMED`, `PROBABLE`, `POSSIBLE`).

### Derived Representations
All visualization elements are dynamically derived and **never persisted**:
* **Parental Union Nodes**: Generated during graph building (`union:sireId_damId`) to group siblings sharing the same parent pair.
* **Generation Levels**: Calculated using topological sorting and depth calculation algorithms outside React.
* **Connected Components**: Dynamically calculated undirected graph components.
* **Ancestor/Descendant Traversal**: Pure graph algorithms for focusing views.

### Pedigree Integrity & Concurrency
* **Ancestry Cycle Detection**: Depth-first search traversal checks before any parentage creation or edit.
* **Transactional Operations**: Parentage creation and cardinality validation run inside a single SQLite transaction.
* **Optimistic Locking**: Every dog record maintains a `version` field. Stale update attempts trigger HTTP `409 Conflict`.
* **Data-Quality Warnings**: Non-fatal conditions (sire not male, parent born after child, duplicated registration numbers, incomplete parentage) generate clear UI warnings without altering user data.

---

## 🚀 Quick Start

### Prerequisites
* Go 1.26+ (or 1.20+)
* Node.js v20+ / v26+
* Make

### Development Mode
```bash
make dev
```
Starts the Go backend on `http://127.0.0.1:8080` and the Vite dev server on `http://127.0.0.1:5173`.

### Production Build
```bash
make build
```
1. Builds the production React frontend bundle into `web/dist`.
2. Compiles the Go binary into `bin/dog-pedigree` with embedded frontend static assets (`embed.FS`).

Run the compiled binary:
```bash
./bin/dog-pedigree -port 8080 -db ./data/pedigree.db -backups ./backups
```
Open `http://127.0.0.1:8080` in your browser.

---

## 🧪 Testing & Validation

Run all unit, integration, and pre-commit checks:
```bash
make check
```

Or individual test targets:
```bash
make test-backend    # Run Go unit & integration tests
make test-frontend   # Run Vitest graph algorithm tests
```

---

## 💾 Backup, Import & Export

### Safe Database Backup
* Uses SQLite's online `VACUUM INTO` backup command.
* Triggered via UI toolbar or API: `POST /api/v1/workspaces/{workspaceId}/backup`.
* Backups are written to the `./backups/` directory with ISO timestamp filenames (`backup_YYYY-MM-DD...sqlite`).

### JSON Export
Exports workspace pedigree data into versioned format (`dog-pedigree.v1`):
```json
{
  "schemaVersion": "dog-pedigree.v1",
  "exportedAt": "2026-08-05T02:30:00Z",
  "workspace": { ... },
  "dogs": [ ... ],
  "relationships": [ ... ]
}
```

### JSON Import
* Validates schema version (`dog-pedigree.v1`).
* Pre-validates IDs, missing references, and ancestry cycles.
* Runs transactionally; invalid imports are rejected without modifying the database.

---

## 📂 Project Structure

```text
peditree/
├── cmd/
│   └── server/
│       └── main.go           # Server entry point & embedded asset routing
├── internal/
│   ├── domain/               # Domain models, enums, cycle & cardinality validation
│   ├── application/          # Workspace, Dog, and Pedigree services
│   ├── storage/              # Storage repository interface & SQLite implementation
│   └── httpapi/              # Chi HTTP router & REST API handlers
├── migrations/               # SQL database migration scripts (000001_init.up.sql)
├── web/
│   ├── src/
│   │   ├── api/              # Frontend REST API client
│   │   ├── components/       # React components (Header, DogList, Inspector, Modals)
│   │   ├── graph/            # Pure TypeScript graph algorithms & vis-network builder
│   │   └── types/            # TypeScript interfaces
│   ├── e2e/                  # Playwright browser end-to-end test suite
│   └── package.json
├── Makefile                  # Build, test, lint, and dev targets
├── go.mod                    # Go dependencies
└── README.md
```
