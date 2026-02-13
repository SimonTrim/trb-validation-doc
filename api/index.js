// ============================================================================
// BACKEND PROXY — Vercel Serverless Function
// Proxy entre l'extension (iframe) et les APIs Trimble Connect
// + Persistance des workflows via Turso (SQLite)
// ============================================================================

import express from 'express';
import cors from 'cors';
import * as db from './db/database.js';

const app = express();
const PORT = process.env.PORT || 3001;

// ─── CORS ───────────────────────────────────────────────────────────────────
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
    process.env.FRONTEND_URL,
    'https://trb-validation-doc.vercel.app',
    // Trimble Connect origins (the iframe host)
    'https://web.connect.trimble.com',
    'https://app.connect.trimble.com',
    'https://app21.connect.trimble.com',
    'https://app31.connect.trimble.com',
    'https://app32.connect.trimble.com',
  ].filter(Boolean),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Project-Region'],
}));

app.use(express.json({ limit: '50mb' }));

// ─── HELPERS ────────────────────────────────────────────────────────────────

/** Get Trimble Connect Core API base URL from region */
function getCoreApiUrl(region) {
  const hosts = {
    us: 'app.connect.trimble.com',
    eu: 'app21.connect.trimble.com',
    ap: 'app31.connect.trimble.com',
    'ap-au': 'app32.connect.trimble.com',
  };
  const host = hosts[region] || hosts.eu;
  return `https://${host}/tc/api/2.0`;
}

/** Auth middleware */
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token provided' });
  req.accessToken = token;
  req.region = req.headers['x-project-region'] || 'eu';
  req.baseUrl = getCoreApiUrl(req.region);
  next();
}

/** Proxy fetch to Trimble Connect API */
async function tcFetch(req, endpoint, options = {}) {
  const url = `${req.baseUrl}${endpoint}`;
  console.log(`[tcFetch] ${options.method || 'GET'} ${url}`);
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${req.accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`[tcFetch] Error ${response.status} for ${url}:`, text.substring(0, 300));
    throw { status: response.status, message: `TC API ${response.status}: ${text.substring(0, 200)}` };
  }

  if (response.status === 204) return null;
  return response.json();
}

// ─── RESPONSE MAPPERS ───────────────────────────────────────────────────────

/** Map TC Search/File API response to normalized ConnectFile format */
function mapTcFileToConnectFile(item) {
  return {
    id: item.id,
    name: item.name || item.fileName || '',
    extension: (item.name || '').split('.').pop()?.toLowerCase() || '',
    size: item.size || item.fileSize || 0,
    uploadedBy: item.createdBy || item.uploadedBy || item.creator || '',
    uploadedAt: item.createdOn || item.uploadedAt || item.createdAt || '',
    lastModified: item.modifiedOn || item.lastModified || item.modifiedAt || item.createdOn || '',
    parentId: item.parentId || item.folderId || '',
    versionId: item.versionId || item.latestVersionId || '',
    path: item.path || item.parentPath || '',
  };
}

/** Map TC User API response to normalized ConnectUser format */
function mapTcUserToConnectUser(user) {
  return {
    id: user.id,
    email: user.email || '',
    firstName: user.firstName || user.givenName || '',
    lastName: user.lastName || user.surname || '',
    role: user.power || user.role || 'USER',
    status: user.status || 'ACTIVE',
  };
}

// ─── TRIMBLE CONNECT PROXY ROUTES ───────────────────────────────────────────

// Files (via TC Search API — normalize response)
app.get('/api/projects/:projectId/files', requireAuth, async (req, res) => {
  try {
    const raw = await tcFetch(req, `/search?query=*&projectId=${req.params.projectId}&type=FILE`);
    // TC Search returns either { items: [...] } or direct array
    const items = Array.isArray(raw) ? raw : (raw?.items || raw?.results || []);
    // Filter to only FILE type and map to our format
    const files = items
      .filter((item) => !item.type || item.type === 'FILE')
      .map(mapTcFileToConnectFile);
    res.json(files);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

// Folder contents
app.get('/api/folders/:folderId/items', requireAuth, async (req, res) => {
  try {
    console.log(`[FolderItems] GET /folders/${req.params.folderId}/items — region: ${req.region}`);
    const raw = await tcFetch(req, `/folders/${req.params.folderId}/items`);
    const items = Array.isArray(raw) ? raw : (raw?.items || []);
    console.log(`[FolderItems] Folder ${req.params.folderId}: ${items.length} items, types:`, items.map(i => `${i.name}(${i.type})`).slice(0, 10));
    // Map files, pass through folders
    const mapped = items.map((item) => {
      if (item.type === 'FILE' || item.size !== undefined) {
        return mapTcFileToConnectFile(item);
      }
      return item; // folders pass through
    });
    res.json(mapped);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

// File details
app.get('/api/files/:fileId', requireAuth, async (req, res) => {
  try {
    const data = await tcFetch(req, `/files/${req.params.fileId}`);
    res.json(mapTcFileToConnectFile(data));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

// File download URL
app.get('/api/files/:fileId/downloadurl', requireAuth, async (req, res) => {
  try {
    const data = await tcFetch(req, `/files/${req.params.fileId}/downloadurl`);
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

// Project users (normalize to ConnectUser format)
app.get('/api/projects/:projectId/users', requireAuth, async (req, res) => {
  try {
    const raw = await tcFetch(req, `/projects/${req.params.projectId}/users`);
    const users = (Array.isArray(raw) ? raw : (raw?.items || raw?.users || []))
      .map(mapTcUserToConnectUser);
    res.json(users);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

// Todos (used for notifications)
app.get('/api/projects/:projectId/todos', requireAuth, async (req, res) => {
  try {
    const data = await tcFetch(req, `/todos?projectId=${req.params.projectId}`);
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.post('/api/todos', requireAuth, async (req, res) => {
  try {
    const data = await tcFetch(req, '/todos', { method: 'POST', body: req.body });
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

// File copy (used by workflow engine)
app.post('/api/files/copy', requireAuth, async (req, res) => {
  try {
    const { fileId, targetFolderId } = req.body;
    // TC API: copy file by creating a new reference in the target folder
    const fileData = await tcFetch(req, `/files/${fileId}`);
    const result = await tcFetch(req, `/folders/${targetFolderId}/files`, {
      method: 'POST',
      body: { fileId: fileData.id },
    });
    res.json(result || fileData);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

// File move (copy + remove from source — simplified)
app.post('/api/files/move', requireAuth, async (req, res) => {
  try {
    const { fileId, targetFolderId } = req.body;
    // Copy to target folder
    const fileData = await tcFetch(req, `/files/${fileId}`);
    const result = await tcFetch(req, `/folders/${targetFolderId}/files`, {
      method: 'POST',
      body: { fileId: fileData.id },
    });
    // Note: Trimble Connect doesn't have a direct "move" API.
    // In production, you would remove the file from the source folder after copy.
    res.json(result || fileData);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

// File versions
app.get('/api/files/:fileId/versions', requireAuth, async (req, res) => {
  try {
    const data = await tcFetch(req, `/files/${req.params.fileId}/versions`);
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

// File upload — step 1: create file metadata, step 2: upload content
// For iframe context, the frontend sends file as base64 in the JSON body
app.post('/api/projects/:projectId/files', requireAuth, async (req, res) => {
  try {
    const { fileName, folderId, fileBase64, mimeType } = req.body;

    if (!fileName || !folderId) {
      return res.status(400).json({ error: 'fileName and folderId are required' });
    }

    // Step 1: Create file entry in TC
    const fileEntry = await tcFetch(req, '/files', {
      method: 'POST',
      body: {
        name: fileName,
        parentId: folderId,
      },
    });

    const fileId = fileEntry.id || fileEntry.fileId;

    // Step 2: Upload binary content if provided
    if (fileBase64 && fileId) {
      const buffer = Buffer.from(fileBase64, 'base64');
      const uploadUrl = `${req.baseUrl}/files/${fileId}/content`;
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${req.accessToken}`,
          'Content-Type': mimeType || 'application/octet-stream',
          'Content-Length': buffer.length.toString(),
        },
        body: buffer,
      });

      if (!uploadResponse.ok) {
        const text = await uploadResponse.text();
        console.warn('[Upload] Content upload failed:', text);
        // File metadata was created, return it anyway
      }
    }

    res.json(mapTcFileToConnectFile(fileEntry));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

// ─── BCF TOPICS PROXY ──────────────────────────────────────────────────────

/** Get BCF API base URL from region */
function getBcfApiUrl(region) {
  const hosts = {
    us: 'open11.connect.trimble.com',
    eu: 'open21.connect.trimble.com',
    ap: 'open31.connect.trimble.com',
    'ap-au': 'open32.connect.trimble.com',
  };
  const host = hosts[region] || hosts.eu;
  return `https://${host}`;
}

/** Proxy fetch to BCF API */
async function bcfFetch(req, endpoint, options = {}) {
  const bcfBase = getBcfApiUrl(req.region);
  const url = `${bcfBase}${endpoint}`;
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${req.accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw { status: response.status, message: text };
  }

  if (response.status === 204) return null;
  return response.json();
}

// List BCF topics
app.get('/api/projects/:projectId/bcf/topics', requireAuth, async (req, res) => {
  try {
    // Try BCF 3.0, then 2.1
    let data;
    try {
      data = await bcfFetch(req, `/bcf/3.0/projects/${req.params.projectId}/topics`);
    } catch {
      data = await bcfFetch(req, `/bcf/2.1/projects/${req.params.projectId}/topics`);
    }
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

// Create BCF topic
app.post('/api/projects/:projectId/bcf/topics', requireAuth, async (req, res) => {
  try {
    let data;
    try {
      data = await bcfFetch(req, `/bcf/3.0/projects/${req.params.projectId}/topics`, {
        method: 'POST',
        body: req.body,
      });
    } catch {
      data = await bcfFetch(req, `/bcf/2.1/projects/${req.params.projectId}/topics`, {
        method: 'POST',
        body: req.body,
      });
    }
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

// Get BCF topic comments
app.get('/api/projects/:projectId/bcf/topics/:topicId/comments', requireAuth, async (req, res) => {
  try {
    let data;
    try {
      data = await bcfFetch(req, `/bcf/3.0/projects/${req.params.projectId}/topics/${req.params.topicId}/comments`);
    } catch {
      data = await bcfFetch(req, `/bcf/2.1/projects/${req.params.projectId}/topics/${req.params.topicId}/comments`);
    }
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

// ─── VIEWS PROXY ────────────────────────────────────────────────────────────

app.get('/api/projects/:projectId/views', requireAuth, async (req, res) => {
  try {
    const data = await tcFetch(req, `/views?projectId=${req.params.projectId}`);
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.get('/api/views/:viewId/thumbnail', requireAuth, async (req, res) => {
  try {
    const url = `${req.baseUrl}/views/${req.params.viewId}/thumbnail`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${req.accessToken}` },
    });
    if (!response.ok) throw { status: response.status, message: 'Thumbnail not found' };
    const buffer = await response.arrayBuffer();
    res.set('Content-Type', response.headers.get('Content-Type') || 'image/png');
    res.send(Buffer.from(buffer));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

// ─── DATABASE ───────────────────────────────────────────────────────────────

let dbReady = false;
const workflowStore = new Map(); // Fallback in-memory
const instanceStore = new Map();
const documentMemStore = new Map(); // Fallback in-memory for documents

// Initialize database on first request
async function ensureDb() {
  if (dbReady) return true;
  try {
    await db.initializeDatabase();
    dbReady = true;
    console.log('[Backend] Turso/SQLite database ready');
    return true;
  } catch (err) {
    console.warn('[Backend] Database init failed, using in-memory fallback:', err.message);
    return false;
  }
}

// ─── PROJECT FOLDERS ────────────────────────────────────────────────────────

// Get root folder ID for a project (lightweight call)
app.get('/api/projects/:projectId/rootfolder', requireAuth, async (req, res) => {
  try {
    console.log(`[RootFolder] GET /projects/${req.params.projectId}/rootfolder — region: ${req.region}`);
    const project = await tcFetch(req, `/projects/${req.params.projectId}`);
    const rootId = project.rootId || project.rootFolderId || project.root_id || '';
    console.log('[RootFolder] Project keys:', Object.keys(project || {}), 'rootId:', rootId);
    res.json({ rootId, projectName: project.name });
  } catch (error) {
    console.error('[RootFolder] Error:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to get root folder' });
  }
});

// Get project root folder ID then list its contents
app.get('/api/projects/:projectId/folders', requireAuth, async (req, res) => {
  try {
    console.log(`[Folders] GET /projects/${req.params.projectId}/folders — region: ${req.region}`);
    // TC API: GET /projects/{projectId} returns project info with rootFolderId
    const project = await tcFetch(req, `/projects/${req.params.projectId}`);
    console.log('[Folders] Project response keys:', Object.keys(project || {}));
    const rootFolderId = project.rootId || project.rootFolderId || project.root_id;
    console.log('[Folders] rootFolderId:', rootFolderId);
    if (!rootFolderId) {
      console.warn('[Folders] No rootFolderId found in project data:', JSON.stringify(project).substring(0, 500));
      return res.json([]);
    }
    // Get root folder contents (folders only)
    const raw = await tcFetch(req, `/folders/${rootFolderId}/items`);
    const items = Array.isArray(raw) ? raw : (raw?.items || raw?.data || []);
    console.log(`[Folders] Root folder items: ${items.length} total, types:`, items.map(i => `${i.name}(${i.type})`).slice(0, 10));
    // TC items can have type 'FOLDER' or be identified by lack of size/extension
    const folders = items
      .filter((item) => {
        const itemType = (item.type || '').toUpperCase();
        return itemType === 'FOLDER' || itemType === 'DIR' || 
               (item.id && !item.size && !item.extension && item.name);
      })
      .map((f) => ({ id: f.id, name: f.name, parentId: f.parentId || rootFolderId }));
    // Prepend root
    const rootName = project.name || 'Racine du projet';
    console.log(`[Folders] Returning ${folders.length + 1} folders (including root)`);
    res.json([{ id: rootFolderId, name: rootName, parentId: null }, ...folders]);
  } catch (error) {
    console.error('[Folders] Error:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
});

// Get subfolders of a specific folder
app.get('/api/folders/:folderId/subfolders', requireAuth, async (req, res) => {
  try {
    console.log(`[Subfolders] GET /folders/${req.params.folderId}/subfolders — region: ${req.region}`);
    const raw = await tcFetch(req, `/folders/${req.params.folderId}/items`);
    const items = Array.isArray(raw) ? raw : (raw?.items || raw?.data || []);
    const folders = items
      .filter((item) => {
        const itemType = (item.type || '').toUpperCase();
        return itemType === 'FOLDER' || itemType === 'DIR' ||
               (item.id && !item.size && !item.extension && item.name);
      })
      .map((f) => ({ id: f.id, name: f.name, parentId: f.parentId || req.params.folderId }));
    res.json(folders);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

// ─── VALIDATION DOCUMENT ROUTES (TURSO) ────────────────────────────────────

// List validation documents for a project
app.get('/api/documents', requireAuth, async (req, res) => {
  try {
    const projectId = req.query.projectId;
    if (await ensureDb()) {
      const docs = await db.getValidationDocuments(projectId);
      // Enrich with labels
      for (const doc of docs) {
        doc.labels = await db.getDocumentLabels(doc.id);
      }
      return res.json(docs);
    }
    // Fallback in-memory
    const docs = Array.from(documentMemStore.values()).filter((d) => d.projectId === projectId);
    res.json(docs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single validation document
app.get('/api/documents/:id', requireAuth, async (req, res) => {
  try {
    if (await ensureDb()) {
      const doc = await db.getValidationDocument(req.params.id);
      if (!doc) return res.status(404).json({ error: 'Document not found' });
      doc.labels = await db.getDocumentLabels(doc.id);
      doc.comments = await db.getDocumentComments(doc.id);
      return res.json(doc);
    }
    const doc = documentMemStore.get(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    res.json(doc);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create validation document (register a TC file for validation)
app.post('/api/documents', requireAuth, async (req, res) => {
  try {
    const doc = {
      ...req.body,
      uploadedAt: req.body.uploadedAt || new Date().toISOString(),
      lastModified: req.body.lastModified || new Date().toISOString(),
    };
    if (await ensureDb()) {
      await db.createValidationDocument(doc);
      // Set labels if provided
      if (doc.labels && doc.labels.length > 0) {
        await db.setDocumentLabels(doc.id, doc.labels);
      }
    } else {
      documentMemStore.set(doc.id, doc);
    }
    res.status(201).json(doc);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update validation document
app.put('/api/documents/:id', requireAuth, async (req, res) => {
  try {
    if (await ensureDb()) {
      const updated = await db.updateValidationDocument(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: 'Document not found' });
      // Update labels if provided
      if (req.body.labels !== undefined) {
        await db.setDocumentLabels(req.params.id, req.body.labels || []);
        updated.labels = req.body.labels;
      }
      return res.json(updated);
    }
    const existing = documentMemStore.get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Document not found' });
    const updated = { ...existing, ...req.body, lastModified: new Date().toISOString() };
    documentMemStore.set(req.params.id, updated);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete validation document
app.delete('/api/documents/:id', requireAuth, async (req, res) => {
  try {
    if (await ensureDb()) {
      await db.deleteValidationDocument(req.params.id);
    } else {
      documentMemStore.delete(req.params.id);
    }
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── DOCUMENT COMMENT ROUTES ───────────────────────────────────────────────

// List comments for a document
app.get('/api/documents/:docId/comments', requireAuth, async (req, res) => {
  try {
    if (await ensureDb()) {
      const comments = await db.getDocumentComments(req.params.docId);
      return res.json(comments);
    }
    res.json([]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add comment to a document
app.post('/api/documents/:docId/comments', requireAuth, async (req, res) => {
  try {
    const comment = {
      ...req.body,
      documentId: req.params.docId,
      createdAt: req.body.createdAt || new Date().toISOString(),
    };
    if (await ensureDb()) {
      await db.createDocumentComment(comment);
    }
    res.status(201).json(comment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete comment
app.delete('/api/documents/:docId/comments/:commentId', requireAuth, async (req, res) => {
  try {
    if (await ensureDb()) {
      await db.deleteDocumentComment(req.params.commentId);
    }
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── DOCUMENT LABEL ROUTES ─────────────────────────────────────────────────

// Update labels for a document
app.put('/api/documents/:docId/labels', requireAuth, async (req, res) => {
  try {
    const labels = req.body.labels || [];
    if (await ensureDb()) {
      await db.setDocumentLabels(req.params.docId, labels);
    }
    res.json({ labels });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── WORKFLOW STORAGE ROUTES (TURSO/SQLITE) ────────────────────────────────

// List workflow definitions
app.get('/api/workflows', requireAuth, async (req, res) => {
  try {
    const projectId = req.query.projectId;
    if (await ensureDb()) {
      const workflows = await db.getWorkflowDefinitions(projectId);
      return res.json(workflows);
    }
    const workflows = Array.from(workflowStore.values()).filter((w) => w.projectId === projectId);
    res.json(workflows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get workflow definition
app.get('/api/workflows/:id', requireAuth, async (req, res) => {
  try {
    if (await ensureDb()) {
      const workflow = await db.getWorkflowDefinition(req.params.id);
      if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
      return res.json(workflow);
    }
    const workflow = workflowStore.get(req.params.id);
    if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
    res.json(workflow);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create workflow definition
app.post('/api/workflows', requireAuth, async (req, res) => {
  try {
    const workflow = { ...req.body, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    if (await ensureDb()) {
      await db.createWorkflowDefinition(workflow);
    } else {
      workflowStore.set(workflow.id, workflow);
    }
    res.status(201).json(workflow);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update workflow definition (upsert: create if not found)
app.put('/api/workflows/:id', requireAuth, async (req, res) => {
  try {
    if (await ensureDb()) {
      try {
        const updated = await db.updateWorkflowDefinition(req.params.id, req.body);
        return res.json(updated);
      } catch (err) {
        if (err.message === 'Not found') {
          // Workflow doesn't exist yet in DB — create it (upsert)
          console.log(`[Workflows] Workflow ${req.params.id} not found, creating (upsert)`);
          const workflow = {
            ...req.body,
            id: req.params.id,
            createdAt: req.body.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          await db.createWorkflowDefinition(workflow);
          return res.json(workflow);
        }
        throw err;
      }
    }
    const existing = workflowStore.get(req.params.id);
    if (!existing) {
      // In-memory fallback: also upsert
      const workflow = { ...req.body, id: req.params.id, updatedAt: new Date().toISOString() };
      workflowStore.set(req.params.id, workflow);
      return res.json(workflow);
    }
    const updated = { ...existing, ...req.body, updatedAt: new Date().toISOString() };
    workflowStore.set(req.params.id, updated);
    res.json(updated);
  } catch (error) {
    console.error('[Workflows] PUT error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete workflow definition
app.delete('/api/workflows/:id', requireAuth, async (req, res) => {
  try {
    if (await ensureDb()) {
      await db.deleteWorkflowDefinition(req.params.id);
    } else {
      workflowStore.delete(req.params.id);
    }
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── WORKFLOW INSTANCE ROUTES ───────────────────────────────────────────────

// List instances
app.get('/api/workflow-instances', requireAuth, async (req, res) => {
  try {
    const projectId = req.query.projectId;
    if (await ensureDb()) {
      const instances = await db.getWorkflowInstances(projectId);
      return res.json(instances);
    }
    const instances = Array.from(instanceStore.values()).filter((i) => i.projectId === projectId);
    res.json(instances);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get instance
app.get('/api/workflow-instances/:id', requireAuth, async (req, res) => {
  try {
    if (await ensureDb()) {
      const instance = await db.getWorkflowInstance(req.params.id);
      if (!instance) return res.status(404).json({ error: 'Instance not found' });
      return res.json(instance);
    }
    const instance = instanceStore.get(req.params.id);
    if (!instance) return res.status(404).json({ error: 'Instance not found' });
    res.json(instance);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create instance (start workflow for a document)
app.post('/api/workflow-instances', requireAuth, async (req, res) => {
  try {
    const instance = {
      ...req.body,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      history: req.body.history || [],
      reviews: req.body.reviews || [],
    };
    if (await ensureDb()) {
      await db.createWorkflowInstance(instance);
    } else {
      instanceStore.set(instance.id, instance);
    }
    res.status(201).json(instance);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update instance (status change, review submission)
app.put('/api/workflow-instances/:id', requireAuth, async (req, res) => {
  try {
    if (await ensureDb()) {
      const updated = await db.updateWorkflowInstance(req.params.id, req.body);
      return res.json(updated);
    }
    const existing = instanceStore.get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Instance not found' });
    const updated = { ...existing, ...req.body, updatedAt: new Date().toISOString() };
    instanceStore.set(req.params.id, updated);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Submit review/visa
app.post('/api/workflow-instances/:id/reviews', requireAuth, async (req, res) => {
  try {
    const review = {
      ...req.body,
      reviewedAt: new Date().toISOString(),
      isCompleted: true,
    };

    if (await ensureDb()) {
      // Get current instance, add review, update
      const instance = await db.getWorkflowInstance(req.params.id);
      if (!instance) return res.status(404).json({ error: 'Instance not found' });

      const reviews = [...(instance.reviews || []), review];
      const historyEntry = {
        id: `hist-${Date.now()}`,
        timestamp: new Date().toISOString(),
        fromNodeId: instance.currentNodeId,
        toNodeId: instance.currentNodeId,
        fromStatusId: instance.currentStatusId,
        toStatusId: review.statusId || instance.currentStatusId,
        userId: review.reviewerId,
        userName: review.reviewerName,
        action: `Visa: ${review.decision}`,
        comment: review.comment,
      };
      const history = [...(instance.history || []), historyEntry];
      const updated = await db.updateWorkflowInstance(req.params.id, { reviews, history });
      return res.json(updated);
    }

    // Fallback in-memory
    const instance = instanceStore.get(req.params.id);
    if (!instance) return res.status(404).json({ error: 'Instance not found' });

    instance.reviews = [...(instance.reviews || []), review];
    instance.updatedAt = new Date().toISOString();
    instance.history = [...(instance.history || []), {
      id: `hist-${Date.now()}`,
      timestamp: new Date().toISOString(),
      fromNodeId: instance.currentNodeId,
      toNodeId: instance.currentNodeId,
      fromStatusId: instance.currentStatusId,
      toStatusId: review.statusId || instance.currentStatusId,
      userId: review.reviewerId,
      userName: review.reviewerName,
      action: `Visa: ${review.decision}`,
      comment: review.comment,
    }];

    instanceStore.set(req.params.id, instance);
    res.json(instance);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── OAUTH ROUTES (standalone mode) ─────────────────────────────────────────

const TRIMBLE_AUTH_URL = process.env.TRIMBLE_ENVIRONMENT === 'staging'
  ? 'https://stage.id.trimble.com/oauth/token'
  : 'https://id.trimble.com/oauth/token';

// Token exchange (code → access_token)
app.post('/api/auth/token', async (req, res) => {
  try {
    const { code, redirect_uri } = req.body;

    if (!code) return res.status(400).json({ error: 'Missing code' });

    const response = await fetch(TRIMBLE_AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirect_uri || process.env.TRIMBLE_REDIRECT_URI || '',
        client_id: process.env.TRIMBLE_CLIENT_ID || '',
        client_secret: process.env.TRIMBLE_CLIENT_SECRET || '',
      }).toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: text });
    }

    const tokenData = await response.json();
    res.json(tokenData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Token refresh
app.post('/api/auth/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) return res.status(400).json({ error: 'Missing refresh_token' });

    const response = await fetch(TRIMBLE_AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token,
        client_id: process.env.TRIMBLE_CLIENT_ID || '',
        client_secret: process.env.TRIMBLE_CLIENT_SECRET || '',
      }).toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: text });
    }

    const tokenData = await response.json();
    res.json(tokenData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── HEALTH CHECK ───────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── START SERVER ───────────────────────────────────────────────────────────

// Only start listening in local dev — Vercel handles this in serverless mode
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`[Backend] Server running on port ${PORT}`);
  });
}

export default app;
