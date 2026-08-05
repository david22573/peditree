CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dogs (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    registered_name TEXT NOT NULL DEFAULT '',
    sex TEXT NOT NULL CHECK(sex IN ('M', 'F', 'UNKNOWN')),
    breed TEXT NOT NULL DEFAULT '',
    birth_date TEXT,
    death_date TEXT,
    registration_number TEXT NOT NULL DEFAULT '',
    microchip_number TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS parentage (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    child_id TEXT NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
    parent_id TEXT NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('SIRE', 'DAM', 'PARENT')),
    relationship_type TEXT NOT NULL CHECK(relationship_type IN ('BIOLOGICAL', 'ADOPTIVE', 'FOSTER', 'UNKNOWN')),
    confidence TEXT NOT NULL CHECK(confidence IN ('CONFIRMED', 'PROBABLE', 'POSSIBLE')),
    source_note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CONSTRAINT uq_child_parent UNIQUE(child_id, parent_id)
);

CREATE TABLE IF NOT EXISTS saved_layouts (
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    view_id TEXT NOT NULL DEFAULT 'default',
    dog_id TEXT NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
    x REAL NOT NULL,
    y REAL NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (workspace_id, view_id, dog_id)
);

CREATE TABLE IF NOT EXISTS audit_events (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    before_json TEXT,
    after_json TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dogs_workspace ON dogs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_dogs_name ON dogs(name);
CREATE INDEX IF NOT EXISTS idx_dogs_registration ON dogs(registration_number);
CREATE INDEX IF NOT EXISTS idx_dogs_deleted ON dogs(deleted_at);
CREATE INDEX IF NOT EXISTS idx_parentage_workspace ON parentage(workspace_id);
CREATE INDEX IF NOT EXISTS idx_parentage_child ON parentage(child_id);
CREATE INDEX IF NOT EXISTS idx_parentage_parent ON parentage(parent_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_workspace ON audit_events(workspace_id);
