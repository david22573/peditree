package sqlite

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"os"
	"path/filepath"

	"dog-pedigree/internal/domain"
	"dog-pedigree/internal/storage"

	_ "modernc.org/sqlite"
)

type SQLiteRepo struct {
	db *sql.DB
	tx *sql.Tx
}

func New(dbPath string) (*SQLiteRepo, error) {
	dir := filepath.Dir(dbPath)
	if dir != "." && dir != "" {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return nil, fmt.Errorf("failed to create db directory: %w", err)
		}
	}

	db, err := sql.Open("sqlite", dbPath+"?_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)")
	if err != nil {
		return nil, fmt.Errorf("failed to open sqlite db: %w", err)
	}

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping sqlite db: %w", err)
	}

	return &SQLiteRepo{db: db}, nil
}

func (r *SQLiteRepo) DB() *sql.DB {
	return r.db
}

func (r *SQLiteRepo) RunMigrations(fs embed.FS) error {
	upSQL, err := fs.ReadFile("000001_init.up.sql")
	if err != nil {
		return fmt.Errorf("failed to read migration file: %w", err)
	}

	_, err = r.db.Exec(string(upSQL))
	if err != nil {
		return fmt.Errorf("failed to execute migration up: %w", err)
	}

	return nil
}

func (r *SQLiteRepo) ExecTx(ctx context.Context, fn func(txRepo storage.Repository) error) error {
	if r.tx != nil {
		// Already in a transaction
		return fn(r)
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin tx: %w", err)
	}

	txRepo := &SQLiteRepo{db: r.db, tx: tx}
	if err := fn(txRepo); err != nil {
		_ = tx.Rollback()
		return err
	}

	return tx.Commit()
}

type queryer interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

func (r *SQLiteRepo) q() queryer {
	if r.tx != nil {
		return r.tx
	}
	return r.db
}

// Workspaces
func (r *SQLiteRepo) CreateWorkspace(ctx context.Context, ws *domain.Workspace) error {
	query := `INSERT INTO workspaces (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`
	_, err := r.q().ExecContext(ctx, query, ws.ID, ws.Name, ws.CreatedAt, ws.UpdatedAt)
	return err
}

func (r *SQLiteRepo) GetWorkspace(ctx context.Context, id string) (*domain.Workspace, error) {
	query := `SELECT id, name, created_at, updated_at FROM workspaces WHERE id = ?`
	row := r.q().QueryRowContext(ctx, query, id)
	var ws domain.Workspace
	err := row.Scan(&ws.ID, &ws.Name, &ws.CreatedAt, &ws.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, domain.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &ws, nil
}

func (r *SQLiteRepo) ListWorkspaces(ctx context.Context) ([]domain.Workspace, error) {
	query := `SELECT id, name, created_at, updated_at FROM workspaces ORDER BY created_at DESC`
	rows, err := r.q().QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var workspaces []domain.Workspace
	for rows.Next() {
		var ws domain.Workspace
		if err := rows.Scan(&ws.ID, &ws.Name, &ws.CreatedAt, &ws.UpdatedAt); err != nil {
			return nil, err
		}
		workspaces = append(workspaces, ws)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return workspaces, nil
}

// Dogs
func (r *SQLiteRepo) CreateDog(ctx context.Context, dog *domain.Dog) error {
	query := `
		INSERT INTO dogs (
			id, workspace_id, name, registered_name, sex, breed, birth_date, death_date,
			registration_number, microchip_number, color, notes, version, created_at, updated_at, deleted_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`
	_, err := r.q().ExecContext(ctx, query,
		dog.ID, dog.WorkspaceID, dog.Name, dog.RegisteredName, dog.Sex, dog.Breed, dog.BirthDate, dog.DeathDate,
		dog.RegistrationNumber, dog.MicrochipNumber, dog.Color, dog.Notes, dog.Version, dog.CreatedAt, dog.UpdatedAt, dog.DeletedAt,
	)
	return err
}

func (r *SQLiteRepo) GetDog(ctx context.Context, id string) (*domain.Dog, error) {
	query := `
		SELECT id, workspace_id, name, registered_name, sex, breed, birth_date, death_date,
		       registration_number, microchip_number, color, notes, version, created_at, updated_at, deleted_at
		FROM dogs WHERE id = ?
	`
	row := r.q().QueryRowContext(ctx, query, id)
	var d domain.Dog
	err := row.Scan(
		&d.ID, &d.WorkspaceID, &d.Name, &d.RegisteredName, &d.Sex, &d.Breed, &d.BirthDate, &d.DeathDate,
		&d.RegistrationNumber, &d.MicrochipNumber, &d.Color, &d.Notes, &d.Version, &d.CreatedAt, &d.UpdatedAt, &d.DeletedAt,
	)
	if err == sql.ErrNoRows {
		return nil, domain.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &d, nil
}

func (r *SQLiteRepo) UpdateDog(ctx context.Context, dog *domain.Dog) error {
	query := `
		UPDATE dogs SET
			name = ?, registered_name = ?, sex = ?, breed = ?, birth_date = ?, death_date = ?,
			registration_number = ?, microchip_number = ?, color = ?, notes = ?, version = version + 1, updated_at = ?
		WHERE id = ? AND version = ?
	`
	res, err := r.q().ExecContext(ctx, query,
		dog.Name, dog.RegisteredName, dog.Sex, dog.Breed, dog.BirthDate, dog.DeathDate,
		dog.RegistrationNumber, dog.MicrochipNumber, dog.Color, dog.Notes, dog.UpdatedAt,
		dog.ID, dog.Version,
	)
	if err != nil {
		return err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return domain.ErrConflict
	}
	dog.Version += 1
	return nil
}

func (r *SQLiteRepo) SoftDeleteDog(ctx context.Context, dogID string, expectedVersion int) (*domain.Dog, error) {
	existing, err := r.GetDog(ctx, dogID)
	if err != nil {
		return nil, err
	}
	if existing.Version != expectedVersion {
		return nil, domain.ErrConflict
	}
	query := `UPDATE dogs SET deleted_at = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?`
	now := domain.NowISO()
	res, err := r.q().ExecContext(ctx, query, now, now, dogID, expectedVersion)
	if err != nil {
		return nil, err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return nil, err
	}
	if rows == 0 {
		return nil, domain.ErrConflict
	}
	existing.DeletedAt = &now
	existing.Version += 1
	existing.UpdatedAt = now
	return existing, nil
}

func (r *SQLiteRepo) RestoreDog(ctx context.Context, dogID string) (*domain.Dog, error) {
	existing, err := r.GetDog(ctx, dogID)
	if err != nil {
		return nil, err
	}
	query := `UPDATE dogs SET deleted_at = NULL, version = version + 1, updated_at = ? WHERE id = ?`
	now := domain.NowISO()
	_, err = r.q().ExecContext(ctx, query, now, dogID)
	if err != nil {
		return nil, err
	}
	existing.DeletedAt = nil
	existing.Version += 1
	existing.UpdatedAt = now
	return existing, nil
}

func (r *SQLiteRepo) ListDogsByWorkspace(ctx context.Context, workspaceID string, includeDeleted bool) ([]domain.Dog, error) {
	query := `
		SELECT id, workspace_id, name, registered_name, sex, breed, birth_date, death_date,
		       registration_number, microchip_number, color, notes, version, created_at, updated_at, deleted_at
		FROM dogs WHERE workspace_id = ?
	`
	if !includeDeleted {
		query += ` AND deleted_at IS NULL`
	}
	query += ` ORDER BY name ASC`

	rows, err := r.q().QueryContext(ctx, query, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var dogs []domain.Dog
	for rows.Next() {
		var d domain.Dog
		if err := rows.Scan(
			&d.ID, &d.WorkspaceID, &d.Name, &d.RegisteredName, &d.Sex, &d.Breed, &d.BirthDate, &d.DeathDate,
			&d.RegistrationNumber, &d.MicrochipNumber, &d.Color, &d.Notes, &d.Version, &d.CreatedAt, &d.UpdatedAt, &d.DeletedAt,
		); err != nil {
			return nil, err
		}
		dogs = append(dogs, d)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return dogs, nil
}

// Parentage
func (r *SQLiteRepo) CreateParentage(ctx context.Context, p *domain.Parentage) error {
	query := `
		INSERT INTO parentage (
			id, workspace_id, child_id, parent_id, role, relationship_type, confidence, source_note, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`
	_, err := r.q().ExecContext(ctx, query,
		p.ID, p.WorkspaceID, p.ChildID, p.ParentID, p.Role, p.RelationshipType, p.Confidence, p.SourceNote, p.CreatedAt, p.UpdatedAt,
	)
	return err
}

func (r *SQLiteRepo) GetParentage(ctx context.Context, id string) (*domain.Parentage, error) {
	query := `
		SELECT id, workspace_id, child_id, parent_id, role, relationship_type, confidence, source_note, created_at, updated_at
		FROM parentage WHERE id = ?
	`
	row := r.q().QueryRowContext(ctx, query, id)
	var p domain.Parentage
	err := row.Scan(&p.ID, &p.WorkspaceID, &p.ChildID, &p.ParentID, &p.Role, &p.RelationshipType, &p.Confidence, &p.SourceNote, &p.CreatedAt, &p.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, domain.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *SQLiteRepo) UpdateParentage(ctx context.Context, p *domain.Parentage) error {
	query := `
		UPDATE parentage SET
			role = ?, relationship_type = ?, confidence = ?, source_note = ?, updated_at = ?
		WHERE id = ?
	`
	res, err := r.q().ExecContext(ctx, query, p.Role, p.RelationshipType, p.Confidence, p.SourceNote, p.UpdatedAt, p.ID)
	if err != nil {
		return err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return domain.ErrNotFound
	}
	return nil
}

func (r *SQLiteRepo) DeleteParentage(ctx context.Context, id string) error {
	query := `DELETE FROM parentage WHERE id = ?`
	res, err := r.q().ExecContext(ctx, query, id)
	if err != nil {
		return err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return domain.ErrNotFound
	}
	return nil
}

func (r *SQLiteRepo) ListParentageByWorkspace(ctx context.Context, workspaceID string) ([]domain.Parentage, error) {
	query := `
		SELECT id, workspace_id, child_id, parent_id, role, relationship_type, confidence, source_note, created_at, updated_at
		FROM parentage WHERE workspace_id = ?
	`
	rows, err := r.q().QueryContext(ctx, query, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var rels []domain.Parentage
	for rows.Next() {
		var p domain.Parentage
		if err := rows.Scan(&p.ID, &p.WorkspaceID, &p.ChildID, &p.ParentID, &p.Role, &p.RelationshipType, &p.Confidence, &p.SourceNote, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		rels = append(rels, p)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return rels, nil
}

func (r *SQLiteRepo) ListParentageByDog(ctx context.Context, dogID string) ([]domain.Parentage, error) {
	query := `
		SELECT id, workspace_id, child_id, parent_id, role, relationship_type, confidence, source_note, created_at, updated_at
		FROM parentage WHERE child_id = ? OR parent_id = ?
	`
	rows, err := r.q().QueryContext(ctx, query, dogID, dogID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var rels []domain.Parentage
	for rows.Next() {
		var p domain.Parentage
		if err := rows.Scan(&p.ID, &p.WorkspaceID, &p.ChildID, &p.ParentID, &p.Role, &p.RelationshipType, &p.Confidence, &p.SourceNote, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		rels = append(rels, p)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return rels, nil
}

// Saved Layouts
func (r *SQLiteRepo) SaveLayouts(ctx context.Context, workspaceID string, layouts []domain.SavedLayout) error {
	query := `
		INSERT INTO saved_layouts (workspace_id, view_id, dog_id, x, y, pinned, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(workspace_id, view_id, dog_id) DO UPDATE SET
			x = excluded.x, y = excluded.y, pinned = excluded.pinned, updated_at = excluded.updated_at
	`
	for _, l := range layouts {
		pinnedInt := 0
		if l.Pinned {
			pinnedInt = 1
		}
		viewID := l.ViewID
		if viewID == "" {
			viewID = "default"
		}
		_, err := r.q().ExecContext(ctx, query, workspaceID, viewID, l.DogID, l.X, l.Y, pinnedInt, l.UpdatedAt)
		if err != nil {
			return err
		}
	}
	return nil
}

func (r *SQLiteRepo) GetLayouts(ctx context.Context, workspaceID string, viewID string) ([]domain.SavedLayout, error) {
	if viewID == "" {
		viewID = "default"
	}
	query := `SELECT workspace_id, view_id, dog_id, x, y, pinned, updated_at FROM saved_layouts WHERE workspace_id = ? AND view_id = ?`
	rows, err := r.q().QueryContext(ctx, query, workspaceID, viewID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var layouts []domain.SavedLayout
	for rows.Next() {
		var l domain.SavedLayout
		var pinnedInt int
		if err := rows.Scan(&l.WorkspaceID, &l.ViewID, &l.DogID, &l.X, &l.Y, &pinnedInt, &l.UpdatedAt); err != nil {
			return nil, err
		}
		l.Pinned = (pinnedInt == 1)
		layouts = append(layouts, l)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return layouts, nil
}

// Audit Events
func (r *SQLiteRepo) CreateAuditEvent(ctx context.Context, event *domain.AuditEvent) error {
	query := `
		INSERT INTO audit_events (id, workspace_id, event_type, entity_type, entity_id, before_json, after_json, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`
	_, err := r.q().ExecContext(ctx, query,
		event.ID, event.WorkspaceID, event.EventType, event.EntityType, event.EntityID,
		event.BeforeJSON, event.AfterJSON, event.CreatedAt,
	)
	return err
}

func (r *SQLiteRepo) ListAuditEvents(ctx context.Context, workspaceID string) ([]domain.AuditEvent, error) {
	query := `
		SELECT id, workspace_id, event_type, entity_type, entity_id, before_json, after_json, created_at
		FROM audit_events WHERE workspace_id = ? ORDER BY created_at DESC
	`
	rows, err := r.q().QueryContext(ctx, query, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []domain.AuditEvent
	for rows.Next() {
		var e domain.AuditEvent
		if err := rows.Scan(&e.ID, &e.WorkspaceID, &e.EventType, &e.EntityType, &e.EntityID, &e.BeforeJSON, &e.AfterJSON, &e.CreatedAt); err != nil {
			return nil, err
		}
		events = append(events, e)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return events, nil
}

// Backup using VACUUM INTO
func (r *SQLiteRepo) CreateBackup(ctx context.Context, destPath string) error {
	dir := filepath.Dir(destPath)
	if dir != "." && dir != "" {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return fmt.Errorf("failed to create backup directory: %w", err)
		}
	}
	// Delete if file exists so VACUUM INTO won't fail
	_ = os.Remove(destPath)

	query := fmt.Sprintf("VACUUM INTO '%s'", destPath)
	_, err := r.db.ExecContext(ctx, query)
	if err != nil {
		return fmt.Errorf("failed to execute VACUUM INTO backup: %w", err)
	}
	return nil
}


