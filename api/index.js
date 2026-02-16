// ============================================================================
// BACKEND PROXY — Vercel Serverless Function
// Proxy entre l'extension (iframe) et les APIs Trimble Connect
// + Persistance des workflows via Turso (SQLite)
// ============================================================================

// Load .env in local development (Vercel handles env vars in production)
if (!process.env.VERCEL) {
  const { config } = await import('dotenv');
  config();
}

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

/** Extract a display name from a TC user field (can be string or object) */
function extractUserString(val) {
  if (!val) return '';
  if (typeof val === 'string') return val;
  // TC API may return user as object: {id, tiduuid, email, firstName, lastName, status}
  if (typeof val === 'object') {
    if (val.firstName || val.lastName) return `${val.firstName || ''} ${val.lastName || ''}`.trim();
    if (val.email) return val.email;
    if (val.id) return val.id;
    return JSON.stringify(val);
  }
  return String(val);
}

/** Map TC Search/File API response to normalized ConnectFile format */
function mapTcFileToConnectFile(item) {
  return {
    id: item.id,
    name: item.name || item.fileName || '',
    extension: (item.name || '').split('.').pop()?.toLowerCase() || '',
    size: item.size || item.fileSize || 0,
    uploadedBy: extractUserString(item.createdBy || item.uploadedBy || item.creator),
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

// File move (copy to target + remove from source folder)
app.post('/api/files/move', requireAuth, async (req, res) => {
  try {
    const { fileId, targetFolderId, sourceFolderId } = req.body;
    console.log(`[Files] Move file ${fileId} → folder ${targetFolderId} (from: ${sourceFolderId || 'unknown'})`);

    // Step 1: Get file info
    const fileData = await tcFetch(req, `/files/${fileId}`);

    // Step 2: Copy to target folder (add file reference to the target folder)
    const result = await tcFetch(req, `/folders/${targetFolderId}/files`, {
      method: 'POST',
      body: { fileId: fileData.id },
    });

    // Step 3: Remove from source folder (if provided)
    const removeFromFolder = sourceFolderId || fileData.parentId;
    if (removeFromFolder) {
      try {
        await tcFetch(req, `/folders/${removeFromFolder}/files/${fileId}`, {
          method: 'DELETE',
        });
        console.log(`[Files] Removed file ${fileId} from source folder ${removeFromFolder}`);
      } catch (removeErr) {
        // Non-blocking: file was already copied, so we just warn
        console.warn(`[Files] Could not remove file from source folder:`, removeErr.message);
      }
    }

    res.json(result || fileData);
  } catch (error) {
    console.error('[Files] Move error:', error.message);
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

// Update comment (reactions, content)
app.put('/api/documents/:docId/comments/:commentId', requireAuth, async (req, res) => {
  try {
    if (await ensureDb()) {
      await db.updateDocumentComment(req.params.commentId, req.body);
    }
    res.json({ success: true });
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

// ─── CUSTOM LABEL ROUTES ────────────────────────────────────────────────────

app.get('/api/labels', requireAuth, async (req, res) => {
  try {
    const projectId = req.query.projectId;
    if (await ensureDb()) {
      const labels = await db.getCustomLabels(projectId);
      return res.json(labels);
    }
    res.json([]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/labels', requireAuth, async (req, res) => {
  try {
    if (await ensureDb()) {
      const label = await db.createCustomLabel(req.body);
      return res.status(201).json(label);
    }
    res.status(201).json(req.body);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/labels/:id', requireAuth, async (req, res) => {
  try {
    if (await ensureDb()) {
      await db.updateCustomLabel(req.params.id, req.body);
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/labels/:id', requireAuth, async (req, res) => {
  try {
    if (await ensureDb()) {
      await db.deleteCustomLabel(req.params.id);
    }
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── USER PREFERENCES ROUTES ────────────────────────────────────────────────

app.get('/api/preferences', requireAuth, async (req, res) => {
  try {
    const { userId, projectId } = req.query;
    if (!userId || !projectId) return res.json({});
    if (await ensureDb()) {
      const prefs = await db.getUserPreferences(userId, projectId);
      return res.json(prefs);
    }
    res.json({});
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/preferences', requireAuth, async (req, res) => {
  try {
    const { userId, projectId, ...prefs } = req.body;
    if (!userId || !projectId) return res.status(400).json({ error: 'Missing userId or projectId' });
    if (await ensureDb()) {
      await db.setUserPreferences(userId, projectId, prefs);
    }
    res.json({ success: true });
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

// ─── EMAIL NOTIFICATIONS ────────────────────────────────────────────────────

app.post('/api/notifications/email', async (req, res) => {
  try {
    const { to, subject, html, documentName, workflowName, reviewerName, projectName, projectId, nodeName, initiatorName } = req.body;

    if (!to || !subject) {
      return res.status(400).json({ error: 'Missing required fields: to, subject' });
    }

    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const EMAIL_FROM = process.env.EMAIL_FROM || 'Validation Doc <onboarding@resend.dev>';

    if (!RESEND_API_KEY) {
      console.warn('[Notifications] RESEND_API_KEY not configured — email not sent');
      return res.json({ sent: false, reason: 'Email service not configured (RESEND_API_KEY missing)' });
    }

    console.log(`[Notifications] Using Resend key: ${RESEND_API_KEY.substring(0, 8)}...${RESEND_API_KEY.slice(-4)} (${RESEND_API_KEY.length} chars), from: ${EMAIL_FROM}, to: ${to}`);

    const emailHtml = html || buildReviewNotificationHtml({
      reviewerName: reviewerName || 'Réviseur',
      documentName: documentName || 'Document',
      workflowName: workflowName || 'Workflow',
      projectName: projectName || '',
      projectId: projectId || '',
      nodeName: nodeName || '',
      initiatorName: initiatorName || '',
    });

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: Array.isArray(to) ? to : [to],
        subject,
        html: emailHtml,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Notifications] Resend API error:', response.status, errorText);
      return res.status(response.status).json({ sent: false, error: errorText });
    }

    const result = await response.json();
    console.log('[Notifications] Email sent successfully:', result.id, '→', to);
    res.json({ sent: true, id: result.id });
  } catch (error) {
    console.error('[Notifications] Email error:', error);
    res.status(500).json({ sent: false, error: error.message });
  }
});

/** Build a styled HTML email for review notification */
function buildReviewNotificationHtml({ reviewerName, documentName, workflowName, projectName, projectId, nodeName, initiatorName }) {
  // Build the link to the project in Trimble Connect
  const projectLink = projectId
    ? `https://web.connect.trimble.com/projects/${projectId}`
    : 'https://web.connect.trimble.com';

  const now = new Date();
  const dateStr = now.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  return `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background-color:#f4f4f7;">
  <div style="max-width:600px;margin:30px auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#005F9E,#0078D4);padding:24px 32px;">
      <h1 style="color:#ffffff;margin:0;font-size:20px;">📋 Validation Documentaire</h1>
      ${projectName ? `<p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:14px;">Projet : ${projectName}</p>` : ''}
    </div>

    <!-- Body -->
    <div style="padding:28px 32px;">
      <p style="font-size:16px;color:#333;margin:0 0 16px;">Bonjour <strong>${reviewerName}</strong>,</p>

      <p style="font-size:15px;color:#555;line-height:1.6;margin:0 0 20px;">
        Un document nécessite votre vérification dans le cadre du workflow
        <strong style="color:#005F9E;">${workflowName}</strong>.
      </p>

      <!-- Document card -->
      <div style="background:#f8f9fa;border-left:4px solid #0078D4;border-radius:4px;padding:16px 20px;margin:0 0 20px;">
        <p style="margin:0 0 4px;font-size:13px;color:#888;text-transform:uppercase;letter-spacing:0.5px;">Document à vérifier</p>
        <p style="margin:0 0 12px;font-size:16px;font-weight:600;color:#333;">📄 ${documentName}</p>

        <table style="width:100%;border-collapse:collapse;font-size:13px;color:#555;">
          ${projectName ? `<tr><td style="padding:3px 0;color:#888;width:120px;">Projet :</td><td style="padding:3px 0;font-weight:500;">${projectName}</td></tr>` : ''}
          <tr><td style="padding:3px 0;color:#888;width:120px;">Workflow :</td><td style="padding:3px 0;font-weight:500;">${workflowName}</td></tr>
          ${nodeName ? `<tr><td style="padding:3px 0;color:#888;width:120px;">Étape :</td><td style="padding:3px 0;font-weight:500;">${nodeName}</td></tr>` : ''}
          ${initiatorName ? `<tr><td style="padding:3px 0;color:#888;width:120px;">Soumis par :</td><td style="padding:3px 0;font-weight:500;">${initiatorName}</td></tr>` : ''}
          <tr><td style="padding:3px 0;color:#888;width:120px;">Date :</td><td style="padding:3px 0;font-weight:500;">${dateStr}</td></tr>
        </table>
      </div>

      <!-- Action required -->
      <div style="background:#fff8e1;border-left:4px solid #f0c040;border-radius:4px;padding:12px 16px;margin:0 0 24px;">
        <p style="margin:0;font-size:14px;color:#6d5c00;line-height:1.5;">
          ⚠️ <strong>Action requise</strong> — Veuillez consulter ce document et soumettre votre visa
          (approbation, observations ou rejet) dans l'extension Validation.
        </p>
      </div>

      <div style="text-align:center;margin:0 0 16px;">
        <a href="${projectLink}" style="display:inline-block;background:#0078D4;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:6px;font-size:15px;font-weight:600;">
          Ouvrir le projet dans Trimble Connect
        </a>
      </div>

      <p style="font-size:13px;color:#888;text-align:center;margin:0 0 8px;line-height:1.5;">
        Une fois dans le projet, ouvrez l'extension <strong>Validation</strong> → onglet <strong>Visas</strong>
      </p>
    </div>

    <!-- Footer -->
    <div style="background:#f8f9fa;padding:16px 32px;border-top:1px solid #e9ecef;">
      <p style="margin:0;font-size:12px;color:#999;text-align:center;">
        Cet email a été envoyé automatiquement par l'extension Validation Documentaire.
        Veuillez ne pas y répondre directement.
      </p>
    </div>
  </div>
</body>
</html>`;
}

// ─── AI WORKFLOW GENERATION ──────────────────────────────────────────────────

const AI_SYSTEM_PROMPT = `Tu es un expert en workflows de validation documentaire pour Trimble Connect.
Tu génères des définitions de workflow au format JSON strict.

TYPES DE NOEUDS DISPONIBLES :
- "start" : Point de départ (obligatoire, un seul)
- "status" : Étape de statut (affiche un état du document). Propriétés: statusId, color
- "review" : Étape de vérification par un ou plusieurs réviseurs. Propriétés: requiredApprovals (nombre), assignees (vide par défaut)
- "decision" : Branchement conditionnel basé sur les reviews
- "action" : Action automatique (déplacer fichier, notifier, etc.). Propriétés: autoActions[]
- "end" : Point de fin (peut y en avoir plusieurs)

TYPES D'ACTIONS AUTOMATIQUES (pour les noeuds "action") :
- "move_file" : Déplacer un fichier vers un dossier. config: { useRejectedFolder: true/false }
- "copy_file" : Copier un fichier vers un dossier
- "notify_user" : Envoyer une notification à un utilisateur
- "send_comment" : Ajouter un commentaire automatique
- "update_metadata" : Mettre à jour les métadonnées du fichier

STATUTS STANDARDS (à inclure dans statuses[]) :
- { id: "pending", name: "En attente", color: "#6a6e79", isDefault: true }
- { id: "approved", name: "Approuvé", color: "#1e8a44" }
- { id: "vso", name: "VSO", color: "#4caf50" }
- { id: "vao", name: "VAO", color: "#f0c040" }
- { id: "vao_blocking", name: "VAO Bloquantes", color: "#d4760a" }
- { id: "commented", name: "Commenté", color: "#e49325" }
- { id: "rejected", name: "Rejeté", color: "#da212c" }
- { id: "refused", name: "Refusé", color: "#8b0000" }

CONTRAINTES :
- Uniquement des opérations réalisables via les APIs Trimble Connect (fichiers, dossiers, utilisateurs, todos)
- Les positions des noeuds doivent être espacées horizontalement (~200px) et verticalement (~150px)
- Chaque noeud a un id unique commençant par "n-"
- Chaque edge a un id unique commençant par "e-"
- Les edges de décision doivent avoir un label décrivant la condition
- Les noeuds review ont assignees: [] (les utilisateurs les configureront manuellement)
- Inclure uniquement les statuts utilisés dans le workflow

FORMAT DE SORTIE (JSON strict, pas de markdown) :
{
  "name": "Nom du workflow",
  "description": "Description courte",
  "nodes": [{ "id": "n-...", "type": "...", "position": { "x": N, "y": N }, "data": { "label": "...", ... } }],
  "edges": [{ "id": "e-...", "source": "n-...", "target": "n-...", "label": "..." }],
  "statuses": [{ "id": "...", "name": "...", "color": "...", "isDefault": true/false }],
  "settings": { "autoStartOnUpload": true, "notifyOnStatusChange": true, "allowResubmission": true, "parallelReviews": false }
}`;

app.post('/api/ai/generate-workflow', async (req, res) => {
  try {
    const { prompt, projectId, createdBy } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Missing required field: prompt' });
    }

    const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY;
    if (!GOOGLE_AI_API_KEY) {
      return res.status(503).json({ error: 'AI service not configured (GOOGLE_AI_API_KEY missing)' });
    }

    console.log(`[AI] Generating workflow from prompt: "${prompt.substring(0, 80)}..."`);

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_AI_API_KEY}`;

    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: `${AI_SYSTEM_PROMPT}\n\n---\n\nGénère un workflow de validation documentaire pour Trimble Connect selon cette description :\n\n${prompt}\n\nRéponds UNIQUEMENT avec le JSON, sans markdown ni commentaire.` }],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4000,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[AI] Gemini API error:', response.status, errorText);
      return res.status(response.status).json({ error: `AI service error: ${response.status}` });
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      console.error('[AI] Gemini returned no content:', JSON.stringify(data).substring(0, 300));
      return res.status(500).json({ error: 'AI returned empty response' });
    }

    let workflow;
    try {
      const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      workflow = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('[AI] Failed to parse AI response:', content.substring(0, 300));
      return res.status(500).json({ error: 'AI returned invalid JSON' });
    }

    // Enrich with project context
    const now = new Date().toISOString();
    const result = {
      id: `wf-ai-${Date.now()}`,
      ...workflow,
      type: 'document_validation',
      version: 1,
      projectId: projectId || '',
      createdBy: createdBy || '',
      createdAt: now,
      updatedAt: now,
      isActive: false,
      settings: {
        autoStartOnUpload: true,
        notifyOnStatusChange: true,
        allowResubmission: true,
        parallelReviews: false,
        ...workflow.settings,
      },
    };

    console.log(`[AI] Generated workflow "${result.name}" with ${result.nodes?.length || 0} nodes`);
    res.json(result);
  } catch (error) {
    console.error('[AI] Generation error:', error);
    res.status(500).json({ error: error.message || 'AI generation failed' });
  }
});

// Check if AI service is available
app.get('/api/ai/status', (req, res) => {
  const available = !!process.env.GOOGLE_AI_API_KEY;
  res.json({ available, model: available ? 'gemini-2.0-flash' : null });
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
