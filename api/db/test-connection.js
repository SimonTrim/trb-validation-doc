// Quick test: connexion Turso + initialisation du schéma
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

import { getDatabase } from './database.js';

async function test() {
  console.log('=== Test connexion Turso ===');
  console.log('URL:', process.env.TURSO_DATABASE_URL ? '✓ configurée' : '✗ manquante');
  console.log('Token:', process.env.TURSO_AUTH_TOKEN ? '✓ configuré' : '✗ manquant');

  const db = getDatabase();

  try {
    // 1. Test basic connectivity
    console.log('\n1. Test de connexion...');
    await db.execute('SELECT 1');
    console.log('   ✓ Connexion OK');

    // 2. Execute schema statements one by one
    console.log('\n2. Initialisation du schéma...');
    const schema = readFileSync(resolve(__dirname, 'schema.sql'), 'utf-8');
    
    // Better statement splitting: handle multi-line, skip comments
    const lines = schema.split('\n');
    let currentStmt = '';
    let stmtCount = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('--') || trimmed === '') continue;
      currentStmt += ' ' + trimmed;

      if (trimmed.endsWith(';')) {
        const stmt = currentStmt.trim();
        if (stmt.length > 1) {
          try {
            await db.execute(stmt);
            stmtCount++;
          } catch (err) {
            console.error(`   ✗ Statement ${stmtCount + 1} failed:`, stmt.substring(0, 80) + '...');
            console.error('     Error:', err.message);
          }
        }
        currentStmt = '';
      }
    }
    console.log(`   ✓ ${stmtCount} statements exécutés`);

    // 3. Check tables
    console.log('\n3. Vérification des tables...');
    const result = await db.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    console.log('   Tables:', result.rows.map(r => r.name).join(', '));

    // 4. Test insert + read + delete
    console.log('\n4. Test CRUD...');
    const now = new Date().toISOString();
    await db.execute({
      sql: `INSERT OR IGNORE INTO workflow_definitions (id, name, type, project_id, created_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: ['test-1', 'Test Workflow', 'document_validation', 'test-project', 'test-user', now, now],
    });
    const check = await db.execute({ sql: 'SELECT * FROM workflow_definitions WHERE id = ?', args: ['test-1'] });
    console.log('   ✓ INSERT + SELECT OK (rows:', check.rows.length + ')');

    await db.execute({ sql: 'DELETE FROM workflow_definitions WHERE id = ?', args: ['test-1'] });
    console.log('   ✓ DELETE OK');

    console.log('\n=== TURSO PRET ===');
  } catch (err) {
    console.error('\n✗ ERREUR:', err.message);
    process.exit(1);
  }
}

test();
