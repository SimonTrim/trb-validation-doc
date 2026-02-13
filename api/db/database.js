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
