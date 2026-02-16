-- ============================================================================
-- TURSO / SQLite SCHEMA — Persistance du Workflow Engine
-- Compatible avec @libsql/client (Turso) et SQLite standard
-- ============================================================================

-- ── Workflow Definitions ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workflow_definitions (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT DEFAULT '',
  version     INTEGER DEFAULT 1,
  type        TEXT NOT NULL DEFAULT 'document_validation',
  project_id  TEXT NOT NULL,
  created_by  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  is_active   INTEGER DEFAULT 0,
  -- Nodes, edges, statuses et settings sont stockés en JSON
  nodes_json    TEXT DEFAULT '[]',
  edges_json    TEXT DEFAULT '[]',
  statuses_json TEXT DEFAULT '[]',
  settings_json TEXT DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_wf_def_project ON workflow_definitions(project_id);
CREATE INDEX IF NOT EXISTS idx_wf_def_active  ON workflow_definitions(is_active);

-- ── Workflow Instances ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workflow_instances (
  id                      TEXT PRIMARY KEY,
  workflow_definition_id  TEXT NOT NULL REFERENCES workflow_definitions(id),
  project_id              TEXT NOT NULL,
  document_id             TEXT NOT NULL,
  document_name           TEXT NOT NULL,
  current_node_id         TEXT NOT NULL,
  current_status_id       TEXT NOT NULL,
  started_by              TEXT NOT NULL,
  started_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at            TEXT,
  -- Reviews stockées en JSON pour flexibilité
  reviews_json TEXT DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_wf_inst_project    ON workflow_instances(project_id);
CREATE INDEX IF NOT EXISTS idx_wf_inst_definition ON workflow_instances(workflow_definition_id);
CREATE INDEX IF NOT EXISTS idx_wf_inst_document   ON workflow_instances(document_id);
CREATE INDEX IF NOT EXISTS idx_wf_inst_status     ON workflow_instances(current_status_id);

-- ── Workflow History (Timeline normalisée) ──────────────────────────────────

CREATE TABLE IF NOT EXISTS workflow_history (
  id              TEXT PRIMARY KEY,
  instance_id     TEXT NOT NULL REFERENCES workflow_instances(id),
  timestamp       TEXT NOT NULL DEFAULT (datetime('now')),
  from_node_id    TEXT DEFAULT '',
  to_node_id      TEXT NOT NULL,
  from_status_id  TEXT DEFAULT '',
  to_status_id    TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  user_name       TEXT NOT NULL,
  action          TEXT NOT NULL,
  comment         TEXT
);

CREATE INDEX IF NOT EXISTS idx_wf_hist_instance  ON workflow_history(instance_id);
CREATE INDEX IF NOT EXISTS idx_wf_hist_timestamp ON workflow_history(timestamp);

-- ── Reviews (normalisées pour requêtes efficaces) ───────────────────────────

CREATE TABLE IF NOT EXISTS workflow_reviews (
  id              TEXT PRIMARY KEY,
  instance_id     TEXT NOT NULL REFERENCES workflow_instances(id),
  reviewer_id     TEXT NOT NULL,
  reviewer_name   TEXT NOT NULL,
  reviewer_email  TEXT DEFAULT '',
  status_id       TEXT NOT NULL,
  decision        TEXT NOT NULL,
  comment         TEXT,
  observations    TEXT,
  attachments     TEXT,
  reviewed_at     TEXT,
  requested_at    TEXT NOT NULL DEFAULT (datetime('now')),
  due_date        TEXT,
  is_completed    INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_wf_rev_instance ON workflow_reviews(instance_id);
CREATE INDEX IF NOT EXISTS idx_wf_rev_reviewer ON workflow_reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_wf_rev_decision ON workflow_reviews(decision);

-- ── Documents en validation ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS validation_documents (
  id                  TEXT PRIMARY KEY,
  file_id             TEXT NOT NULL,
  file_name           TEXT NOT NULL,
  file_extension      TEXT DEFAULT '',
  file_size           INTEGER DEFAULT 0,
  file_path           TEXT DEFAULT '',
  uploaded_by         TEXT NOT NULL,
  uploaded_by_name    TEXT NOT NULL,
  uploaded_by_email   TEXT DEFAULT '',
  uploaded_at         TEXT NOT NULL DEFAULT (datetime('now')),
  last_modified       TEXT NOT NULL DEFAULT (datetime('now')),
  version_id          TEXT,
  version_number      INTEGER DEFAULT 1,
  project_id          TEXT NOT NULL,
  workflow_instance_id TEXT REFERENCES workflow_instances(id),
  -- Statut courant (dénormalisé pour performance)
  status_id           TEXT DEFAULT 'pending',
  status_name         TEXT DEFAULT 'En attente',
  status_color        TEXT DEFAULT '#6a6e79',
  status_changed_at   TEXT,
  status_changed_by   TEXT,
  -- Métadonnées en JSON
  metadata_json       TEXT DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_val_doc_project  ON validation_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_val_doc_status   ON validation_documents(status_id);
CREATE INDEX IF NOT EXISTS idx_val_doc_file     ON validation_documents(file_id);
CREATE INDEX IF NOT EXISTS idx_val_doc_workflow ON validation_documents(workflow_instance_id);

-- ── Commentaires sur les documents ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS document_comments (
  id                TEXT PRIMARY KEY,
  document_id       TEXT NOT NULL REFERENCES validation_documents(id),
  author_id         TEXT NOT NULL,
  author_name       TEXT NOT NULL,
  author_email      TEXT DEFAULT '',
  content           TEXT NOT NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  parent_id         TEXT,
  is_system_message INTEGER DEFAULT 0,
  reactions_json    TEXT DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_doc_comments_doc ON document_comments(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_comments_parent ON document_comments(parent_id);

-- ── Labels sur les documents ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS document_labels (
  document_id TEXT NOT NULL REFERENCES validation_documents(id),
  label_id    TEXT NOT NULL,
  label_name  TEXT NOT NULL,
  label_color TEXT NOT NULL DEFAULT '#6a6e79',
  PRIMARY KEY (document_id, label_id)
);

CREATE INDEX IF NOT EXISTS idx_doc_labels_doc ON document_labels(document_id);

-- ── Labels personnalises ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS custom_labels (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#6a6e79',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_custom_labels_project ON custom_labels(project_id);

-- ── Preferences utilisateur ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_preferences (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  project_id  TEXT NOT NULL,
  prefs_json  TEXT DEFAULT '{}',
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_user_prefs_user ON user_preferences(user_id);

-- ── Vue pour les statistiques ───────────────────────────────────────────────

CREATE VIEW IF NOT EXISTS v_document_stats AS
SELECT
  project_id,
  COUNT(*) as total,
  SUM(CASE WHEN status_id = 'pending' THEN 1 ELSE 0 END) as pending,
  SUM(CASE WHEN status_id IN ('approved', 'vso') THEN 1 ELSE 0 END) as approved,
  SUM(CASE WHEN status_id IN ('rejected', 'refused') THEN 1 ELSE 0 END) as rejected,
  SUM(CASE WHEN status_id IN ('commented', 'vao', 'vao_blocking') THEN 1 ELSE 0 END) as in_review,
  SUM(CASE WHEN workflow_instance_id IS NOT NULL THEN 1 ELSE 0 END) as with_workflow
FROM validation_documents
GROUP BY project_id;
