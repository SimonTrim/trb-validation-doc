// ============================================================================
// DATABASE — Couche de persistance Turso/SQLite
// Utilise @libsql/client pour Turso (production) ou SQLite local (dev)
// ============================================================================

import { createClient } from '@libsql/client';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── CONNECTION ─────────────────────────────────────────────────────────────

let db = null;

/**
 * Initialise la connexion à la base de données.
 * - En production: utilise TURSO_DATABASE_URL + TURSO_AUTH_TOKEN
 * - En développement: utilise un fichier SQLite local
 */
export function getDatabase() {
  if (db) return db;

  if (process.env.TURSO_DATABASE_URL) {
    // Production: Turso
    db = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  } else {
    // Dev: SQLite local
    db = createClient({
      url: 'file:local.db',
    });
  }

  return db;
}

/**
 * Exécute le schéma SQL pour créer les tables.
 */
export async function initializeDatabase() {
  const client = getDatabase();
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');

  // Séparer les statements (SQLite ne supporte pas multi-statement)
  const statements = schema
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));

  for (const stmt of statements) {
    await client.execute(stmt + ';');
  }

  // ── Migrations for existing databases ──
  const migrations = [
    "ALTER TABLE document_comments ADD COLUMN reactions_json TEXT DEFAULT '[]'",
  ];
  for (const migration of migrations) {
    try { await client.execute(migration + ';'); } catch (_) { /* column already exists */ }
  }

  console.log('[Database] Schema initialized');
  return client;
}

// ─── WORKFLOW DEFINITIONS ───────────────────────────────────────────────────

export async function getWorkflowDefinitions(projectId) {
  const client = getDatabase();
  const result = await client.execute({
    sql: 'SELECT * FROM workflow_definitions WHERE project_id = ? ORDER BY updated_at DESC',
    args: [projectId],
  });
  return result.rows.map(rowToDefinition);
}

export async function getWorkflowDefinition(id) {
  const client = getDatabase();
  const result = await client.execute({
    sql: 'SELECT * FROM workflow_definitions WHERE id = ?',
    args: [id],
  });
  if (result.rows.length === 0) return null;
  return rowToDefinition(result.rows[0]);
}

export async function createWorkflowDefinition(def) {
  const client = getDatabase();
  await client.execute({
    sql: `INSERT INTO workflow_definitions
      (id, name, description, version, type, project_id, created_by, created_at, updated_at, is_active, nodes_json, edges_json, statuses_json, settings_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      def.id, def.name, def.description, def.version, def.type,
      def.projectId, def.createdBy, def.createdAt, def.updatedAt,
      def.isActive ? 1 : 0,
      JSON.stringify(def.nodes), JSON.stringify(def.edges),
      JSON.stringify(def.statuses), JSON.stringify(def.settings),
    ],
  });
  return def;
}

export async function updateWorkflowDefinition(id, updates) {
  const existing = await getWorkflowDefinition(id);
  if (!existing) throw new Error('Not found');

  const merged = { ...existing, ...updates, updatedAt: new Date().toISOString() };
  const client = getDatabase();
  await client.execute({
    sql: `UPDATE workflow_definitions SET
      name = ?, description = ?, version = ?, type = ?,
      is_active = ?, nodes_json = ?, edges_json = ?,
      statuses_json = ?, settings_json = ?, updated_at = ?
      WHERE id = ?`,
    args: [
      merged.name, merged.description, merged.version, merged.type,
      merged.isActive ? 1 : 0,
      JSON.stringify(merged.nodes), JSON.stringify(merged.edges),
      JSON.stringify(merged.statuses), JSON.stringify(merged.settings),
      merged.updatedAt, id,
    ],
  });
  return merged;
}

export async function deleteWorkflowDefinition(id) {
  const client = getDatabase();
  await client.execute({ sql: 'DELETE FROM workflow_definitions WHERE id = ?', args: [id] });
}

// ─── WORKFLOW INSTANCES ─────────────────────────────────────────────────────

export async function getWorkflowInstances(projectId) {
  const client = getDatabase();
  const result = await client.execute({
    sql: 'SELECT * FROM workflow_instances WHERE project_id = ? ORDER BY updated_at DESC',
    args: [projectId],
  });

  const instances = [];
  for (const row of result.rows) {
    const instance = rowToInstance(row);
    // Charger l'historique
    const histResult = await client.execute({
      sql: 'SELECT * FROM workflow_history WHERE instance_id = ? ORDER BY timestamp ASC',
      args: [instance.id],
    });
    instance.history = histResult.rows.map(rowToHistory);
    instances.push(instance);
  }

  return instances;
}

export async function getWorkflowInstance(id) {
  const client = getDatabase();
  const result = await client.execute({
    sql: 'SELECT * FROM workflow_instances WHERE id = ?',
    args: [id],
  });
  if (result.rows.length === 0) return null;

  const instance = rowToInstance(result.rows[0]);

  // Charger l'historique
  const histResult = await client.execute({
    sql: 'SELECT * FROM workflow_history WHERE instance_id = ? ORDER BY timestamp ASC',
    args: [id],
  });
  instance.history = histResult.rows.map(rowToHistory);

  return instance;
}

export async function createWorkflowInstance(inst) {
  const client = getDatabase();
  await client.execute({
    sql: `INSERT INTO workflow_instances
      (id, workflow_definition_id, project_id, document_id, document_name,
       current_node_id, current_status_id, started_by, started_at, updated_at, reviews_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      inst.id, inst.workflowDefinitionId, inst.projectId, inst.documentId,
      inst.documentName, inst.currentNodeId, inst.currentStatusId,
      inst.startedBy, inst.startedAt, inst.updatedAt,
      JSON.stringify(inst.reviews || []),
    ],
  });

  // Insérer l'historique
  for (const h of (inst.history || [])) {
    await insertHistory(h, inst.id);
  }

  return inst;
}

export async function updateWorkflowInstance(id, updates) {
  const client = getDatabase();
  const fields = [];
  const args = [];

  if (updates.currentNodeId !== undefined) { fields.push('current_node_id = ?'); args.push(updates.currentNodeId); }
  if (updates.currentStatusId !== undefined) { fields.push('current_status_id = ?'); args.push(updates.currentStatusId); }
  if (updates.completedAt !== undefined) { fields.push('completed_at = ?'); args.push(updates.completedAt); }
  if (updates.reviews) { fields.push('reviews_json = ?'); args.push(JSON.stringify(updates.reviews)); }

  fields.push('updated_at = ?');
  args.push(new Date().toISOString());
  args.push(id);

  await client.execute({
    sql: `UPDATE workflow_instances SET ${fields.join(', ')} WHERE id = ?`,
    args,
  });

  // Insérer les nouvelles entrées d'historique
  if (updates.history) {
    const existing = await client.execute({
      sql: 'SELECT id FROM workflow_history WHERE instance_id = ?',
      args: [id],
    });
    const existingIds = new Set(existing.rows.map((r) => r.id));

    for (const h of updates.history) {
      if (!existingIds.has(h.id)) {
        await insertHistory(h, id);
      }
    }
  }

  return await getWorkflowInstance(id);
}

async function insertHistory(h, instanceId) {
  const client = getDatabase();
  await client.execute({
    sql: `INSERT INTO workflow_history
      (id, instance_id, timestamp, from_node_id, to_node_id, from_status_id, to_status_id, user_id, user_name, action, comment)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      h.id, instanceId, h.timestamp, h.fromNodeId || '', h.toNodeId,
      h.fromStatusId || '', h.toStatusId, h.userId, h.userName, h.action, h.comment || null,
    ],
  });
}

// ─── VALIDATION DOCUMENTS ───────────────────────────────────────────────────

export async function getValidationDocuments(projectId) {
  const client = getDatabase();
  const result = await client.execute({
    sql: 'SELECT * FROM validation_documents WHERE project_id = ? ORDER BY uploaded_at DESC',
    args: [projectId],
  });
  return result.rows.map(rowToValidationDocument);
}

export async function getValidationDocument(id) {
  const client = getDatabase();
  const result = await client.execute({
    sql: 'SELECT * FROM validation_documents WHERE id = ?',
    args: [id],
  });
  if (result.rows.length === 0) return null;
  return rowToValidationDocument(result.rows[0]);
}

export async function createValidationDocument(doc) {
  const client = getDatabase();
  await client.execute({
    sql: `INSERT INTO validation_documents
      (id, file_id, file_name, file_extension, file_size, file_path,
       uploaded_by, uploaded_by_name, uploaded_by_email, uploaded_at, last_modified,
       version_id, version_number, project_id, workflow_instance_id,
       status_id, status_name, status_color, status_changed_at, status_changed_by,
       metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      doc.id, doc.fileId, doc.fileName, doc.fileExtension || '', doc.fileSize || 0, doc.filePath || '',
      doc.uploadedBy || '', doc.uploadedByName || '', doc.uploadedByEmail || '',
      doc.uploadedAt || new Date().toISOString(), doc.lastModified || new Date().toISOString(),
      doc.versionId || null, doc.versionNumber || 1, doc.projectId,
      doc.workflowInstanceId || null,
      doc.currentStatus?.id || 'pending', doc.currentStatus?.name || 'En attente',
      doc.currentStatus?.color || '#6a6e79', doc.currentStatus?.changedAt || null,
      doc.currentStatus?.changedBy || null,
      JSON.stringify(doc.metadata || {}),
    ],
  });
  return doc;
}

export async function updateValidationDocument(id, updates) {
  const client = getDatabase();
  const fields = [];
  const args = [];

  if (updates.fileName !== undefined) { fields.push('file_name = ?'); args.push(updates.fileName); }
  if (updates.fileSize !== undefined) { fields.push('file_size = ?'); args.push(updates.fileSize); }
  if (updates.filePath !== undefined) { fields.push('file_path = ?'); args.push(updates.filePath); }
  if (updates.versionId !== undefined) { fields.push('version_id = ?'); args.push(updates.versionId); }
  if (updates.versionNumber !== undefined) { fields.push('version_number = ?'); args.push(updates.versionNumber); }
  if (updates.workflowInstanceId !== undefined) { fields.push('workflow_instance_id = ?'); args.push(updates.workflowInstanceId || null); }
  if (updates.currentStatus) {
    fields.push('status_id = ?'); args.push(updates.currentStatus.id);
    fields.push('status_name = ?'); args.push(updates.currentStatus.name);
    fields.push('status_color = ?'); args.push(updates.currentStatus.color);
    fields.push('status_changed_at = ?'); args.push(updates.currentStatus.changedAt || new Date().toISOString());
    fields.push('status_changed_by = ?'); args.push(updates.currentStatus.changedBy || '');
  }
  if (updates.metadata !== undefined) { fields.push('metadata_json = ?'); args.push(JSON.stringify(updates.metadata)); }

  if (fields.length === 0) {
    return await getValidationDocument(id);
  }

  fields.push('last_modified = ?');
  args.push(new Date().toISOString());
  args.push(id);

  await client.execute({
    sql: `UPDATE validation_documents SET ${fields.join(', ')} WHERE id = ?`,
    args,
  });

  return await getValidationDocument(id);
}

export async function deleteValidationDocument(id) {
  const client = getDatabase();
  await client.execute({ sql: 'DELETE FROM validation_documents WHERE id = ?', args: [id] });
}

// ─── DOCUMENT COMMENTS ──────────────────────────────────────────────────────

export async function getDocumentComments(documentId) {
  const client = getDatabase();
  const result = await client.execute({
    sql: 'SELECT * FROM document_comments WHERE document_id = ? ORDER BY created_at ASC',
    args: [documentId],
  });
  return result.rows.map(rowToComment);
}

export async function createDocumentComment(comment) {
  const client = getDatabase();
  await client.execute({
    sql: `INSERT INTO document_comments
      (id, document_id, author_id, author_name, author_email, content,
       created_at, parent_id, is_system_message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      comment.id, comment.documentId, comment.authorId, comment.authorName,
      comment.authorEmail || '', comment.content, comment.createdAt || new Date().toISOString(),
      comment.parentId || null, comment.isSystemMessage ? 1 : 0,
    ],
  });
  return comment;
}

export async function updateDocumentComment(id, data) {
  const client = getDatabase();
  const sets = [];
  const args = [];
  if (data.reactions !== undefined) {
    sets.push('reactions_json = ?');
    args.push(JSON.stringify(data.reactions));
  }
  if (data.content !== undefined) {
    sets.push('content = ?');
    args.push(data.content);
  }
  if (sets.length === 0) return;
  args.push(id);
  await client.execute({
    sql: `UPDATE document_comments SET ${sets.join(', ')} WHERE id = ?`,
    args,
  });
}

export async function deleteDocumentComment(id) {
  const client = getDatabase();
  await client.execute({ sql: 'DELETE FROM document_comments WHERE id = ?', args: [id] });
}

// ─── DOCUMENT LABELS ────────────────────────────────────────────────────────

export async function getDocumentLabels(documentId) {
  const client = getDatabase();
  const result = await client.execute({
    sql: 'SELECT * FROM document_labels WHERE document_id = ?',
    args: [documentId],
  });
  return result.rows.map((r) => ({ id: r.label_id, name: r.label_name, color: r.label_color }));
}

export async function setDocumentLabels(documentId, labels) {
  const client = getDatabase();
  // Remove existing labels
  await client.execute({ sql: 'DELETE FROM document_labels WHERE document_id = ?', args: [documentId] });
  // Insert new labels
  for (const label of labels) {
    await client.execute({
      sql: 'INSERT INTO document_labels (document_id, label_id, label_name, label_color) VALUES (?, ?, ?, ?)',
      args: [documentId, label.id, label.name, label.color],
    });
  }
}

// ─── CUSTOM LABELS ──────────────────────────────────────────────────────────

export async function getCustomLabels(projectId) {
  const client = getDatabase();
  const result = await client.execute({
    sql: 'SELECT * FROM custom_labels WHERE project_id = ? ORDER BY created_at ASC',
    args: [projectId],
  });
  return result.rows.map((r) => ({ id: r.id, name: r.name, color: r.color }));
}

export async function createCustomLabel(label) {
  const client = getDatabase();
  await client.execute({
    sql: 'INSERT INTO custom_labels (id, project_id, name, color) VALUES (?, ?, ?, ?)',
    args: [label.id, label.projectId, label.name, label.color],
  });
  return { id: label.id, name: label.name, color: label.color };
}

export async function updateCustomLabel(id, data) {
  const client = getDatabase();
  const sets = [];
  const args = [];
  if (data.name !== undefined) { sets.push('name = ?'); args.push(data.name); }
  if (data.color !== undefined) { sets.push('color = ?'); args.push(data.color); }
  if (sets.length === 0) return;
  args.push(id);
  await client.execute({ sql: `UPDATE custom_labels SET ${sets.join(', ')} WHERE id = ?`, args });
}

export async function deleteCustomLabel(id) {
  const client = getDatabase();
  await client.execute({ sql: 'DELETE FROM custom_labels WHERE id = ?', args: [id] });
}

// ─── USER PREFERENCES ───────────────────────────────────────────────────────

export async function getUserPreferences(userId, projectId) {
  const client = getDatabase();
  const result = await client.execute({
    sql: 'SELECT * FROM user_preferences WHERE user_id = ? AND project_id = ?',
    args: [userId, projectId],
  });
  if (result.rows.length === 0) return {};
  try { return JSON.parse(result.rows[0].prefs_json || '{}'); } catch { return {}; }
}

export async function setUserPreferences(userId, projectId, prefs) {
  const client = getDatabase();
  const id = `pref-${userId}-${projectId}`;
  await client.execute({
    sql: `INSERT INTO user_preferences (id, user_id, project_id, prefs_json, updated_at)
          VALUES (?, ?, ?, ?, datetime('now'))
          ON CONFLICT(user_id, project_id) DO UPDATE SET prefs_json = ?, updated_at = datetime('now')`,
    args: [id, userId, projectId, JSON.stringify(prefs), JSON.stringify(prefs)],
  });
}

// ─── ROW MAPPERS ────────────────────────────────────────────────────────────

function rowToDefinition(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    version: row.version,
    type: row.type,
    projectId: row.project_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isActive: row.is_active === 1,
    nodes: JSON.parse(row.nodes_json || '[]'),
    edges: JSON.parse(row.edges_json || '[]'),
    statuses: JSON.parse(row.statuses_json || '[]'),
    settings: JSON.parse(row.settings_json || '{}'),
  };
}

function rowToInstance(row) {
  return {
    id: row.id,
    workflowDefinitionId: row.workflow_definition_id,
    projectId: row.project_id,
    documentId: row.document_id,
    documentName: row.document_name,
    currentNodeId: row.current_node_id,
    currentStatusId: row.current_status_id,
    startedBy: row.started_by,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at || undefined,
    reviews: JSON.parse(row.reviews_json || '[]'),
    history: [],
  };
}

function rowToHistory(row) {
  return {
    id: row.id,
    timestamp: row.timestamp,
    fromNodeId: row.from_node_id,
    toNodeId: row.to_node_id,
    fromStatusId: row.from_status_id,
    toStatusId: row.to_status_id,
    userId: row.user_id,
    userName: row.user_name,
    action: row.action,
    comment: row.comment || undefined,
  };
}

function rowToValidationDocument(row) {
  return {
    id: row.id,
    fileId: row.file_id,
    fileName: row.file_name,
    fileExtension: row.file_extension || '',
    fileSize: row.file_size || 0,
    filePath: row.file_path || '',
    uploadedBy: row.uploaded_by || '',
    uploadedByName: row.uploaded_by_name || '',
    uploadedByEmail: row.uploaded_by_email || '',
    uploadedAt: row.uploaded_at,
    lastModified: row.last_modified,
    versionId: row.version_id || undefined,
    versionNumber: row.version_number || 1,
    projectId: row.project_id,
    workflowInstanceId: row.workflow_instance_id || undefined,
    currentStatus: {
      id: row.status_id || 'pending',
      name: row.status_name || 'En attente',
      color: row.status_color || '#6a6e79',
      changedAt: row.status_changed_at || row.uploaded_at,
      changedBy: row.status_changed_by || '',
    },
    metadata: JSON.parse(row.metadata_json || '{}'),
  };
}

function rowToComment(row) {
  let reactions = [];
  try { reactions = JSON.parse(row.reactions_json || '[]'); } catch (_) {}
  return {
    id: row.id,
    documentId: row.document_id,
    authorId: row.author_id,
    authorName: row.author_name,
    authorEmail: row.author_email || '',
    content: row.content,
    createdAt: row.created_at,
    parentId: row.parent_id || undefined,
    isSystemMessage: row.is_system_message === 1,
    attachments: [],
    reactions,
  };
}
