
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { createTables } = require('./dataBase');

let db;

/* -----------------------------
   Utility
------------------------------*/
function getDataJsonPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'data', 'data.json')
    : path.join(__dirname, 'data', 'data.json');
}

// Admin fisso: identificativo=admin, password=admin (nessun altro admin)
function seedAdminIfMissing() {
  try {
    db.prepare(`
      INSERT OR IGNORE INTO users (identificativo, password, role)
      VALUES ('admin', 'admin', 'admin')
    `).run();
  } catch (e) {
    console.warn('[SEED ADMIN] Impossibile inserire admin:', e.message);
  }
}

// Inserisce una riga nei logs (salvando anche il donatore/identificativo se lo passi in riferimento_id)
function logAction({ utente_identificativo = null, ruolo = null, azione = '', riferimento_id = null }) {
  try {
    db.prepare(`
      INSERT INTO logs (utente_identificativo, ruolo, azione, riferimento_id)
      VALUES (?, ?, ?, ?)
    `).run(utente_identificativo, ruolo, azione, riferimento_id);
  } catch (e) {
    console.warn('[LOG] insert error:', e.message);
  }
}

// Dato un tgId (task_gantt.id) risale all’identificativo del paziente
function getPatientIdentFromTaskInstance(tgId) {
  const row = db.prepare(`
    SELECT p.identificativo AS ident
    FROM task_gantt tg
    JOIN gantts g ON g.id = tg.gantt_id
    JOIN patients p ON p.id = g.patient_id
    WHERE tg.id = ?
  `).get(tgId);
  return row?.ident || null;
}

// Dato un patientId, ottiene l'identificativo (utile per i log di delete)
function getPatientIdentById(patientId) {
  const row = db.prepare(`SELECT identificativo FROM patients WHERE id = ?`).get(patientId);
  return row?.identificativo || null;
}

/* -----------------------------
   DB Init
------------------------------*/
function initDatabase() {
  const dbPath = path.join(__dirname, 'database.db');
  db = new Database(dbPath);
  db.pragma('foreign_keys = ON');

  createTables(db);
  seedAdminIfMissing();

  // Popola tasks se vuota
  const count = db.prepare('SELECT COUNT(*) AS c FROM tasks').get().c;
  if (count === 0) {
    const dataPath = getDataJsonPath();
    if (!fs.existsSync(dataPath)) {
      console.error('File data.json non trovato in:', dataPath);
      return;
    }
    const tasksData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    const insert = db.prepare(`
      INSERT INTO tasks (id, name, duration, description, dependencies)
      VALUES (?, ?, ?, ?, ?)
    `);
    const tx = db.transaction(rows => {
      rows.forEach(t => insert.run(
        t.id,
        t.name,
        t.duration,
        t.description || '',
        JSON.stringify(t.dependencies || [])
      ));
    });
    tx(tasksData);
    console.log(`Inizializzazione: inseriti ${tasksData.length} task template.`);
  } else {
    console.log('Tabella tasks già popolata.');
  }
}

/* -----------------------------
   Window
------------------------------*/
function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 800,
    icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  win.loadFile(path.join(__dirname, '..', 'frontend', 'login.html'));
}

app.whenReady().then(() => {
  initDatabase();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});


/* ===========================
   ======  IPC HANDLERS  =====
   =========================== */

/* -------- Login unificato --------
   - Medico: { identificativo } (senza password) -> crea/ritorna medico
   - Admin:  { identificativo, password }        -> verifica password e ruolo
*/
ipcMain.handle('login', (_ev, { identificativo, password = '' }) => {
  try {
    const idClean = (identificativo || '').trim();
    const pass = (password || '').trim();
    if (!idClean) return { success: false, error: 'Identificativo mancante' };

    if (!pass) {
      // MEDICO (non permettere di usare "admin" come identificativo medico)
      const existingUser = db.prepare('SELECT role FROM users WHERE identificativo = ?').get(idClean);
      if (existingUser) {
        if (existingUser.role === 'admin') {
          return { success: false, error: 'Identificativo riservato all’admin. Usa l’accesso admin.' };
        }
        return { success: true, role: 'medico', identificativo: idClean, message: 'Medico già presente' };
      }
      db.prepare('INSERT INTO users (identificativo, role) VALUES (?, ?)').run(idClean, 'medico');
      return { success: true, role: 'medico', identificativo: idClean, message: 'Medico inserito' };
    }

    // ADMIN
    const admin = db.prepare('SELECT * FROM users WHERE identificativo = ? AND role = ?')
                    .get(idClean, 'admin');
    if (!admin) return { success: false, error: 'Utente admin non trovato' };
    if ((admin.password || '') !== pass) return { success: false, error: 'Password errata' };

    return { success: true, role: 'admin', identificativo: idClean, message: 'Login admin OK' };
  } catch (err) {
    console.error('login error:', err);
    return { success: false, error: 'Errore interno del server' };
  }
});

/* -------- Pazienti (anonimi) -------- */

/** Crea paziente + gantt + istanze */
ipcMain.handle('create-patient-and-gantt', (_ev, { identificativo }) => {
  try {
    const idClean = (identificativo || '').trim();
    if (!idClean) return { success: false, error: 'Identificativo mancante' };

    const pInfo = db.prepare('INSERT INTO patients (identificativo) VALUES (?)').run(idClean);
    const patientId = pInfo.lastInsertRowid;

    const gInfo = db.prepare('INSERT INTO gantts (patient_id, start_datetime) VALUES (?, NULL)').run(patientId);
    const ganttId = gInfo.lastInsertRowid;

    const templates = db.prepare('SELECT id FROM tasks').all();
    const insertTG = db.prepare(`
      INSERT INTO task_gantt (task_id, gantt_id, start_datetime, end_datetime, status, note)
      VALUES (?, ?, NULL, NULL, 'non_iniziato', NULL)
    `);
    const tx = db.transaction(rows => rows.forEach(t => insertTG.run(t.id, ganttId)));
    tx(templates);

    return { success: true, patientId, ganttId };
  } catch (err) {
    console.error('create-patient-and-gantt error:', err);
    return { success: false, error: err.message };
  }
});

/** Lista pazienti */
ipcMain.handle('get-patients', () => {
  try {
    return db.prepare('SELECT id, identificativo FROM patients ORDER BY id DESC').all();
  } catch (err) {
    console.error('get-patients error:', err);
    return [];
  }
});

/** Paziente per id */
ipcMain.handle('get-patient-by-id', (_ev, id) => {
  try {
    return db.prepare('SELECT * FROM patients WHERE id = ?').get(id);
  } catch (err) {
    console.error('get-patient-by-id error:', err);
    return null;
  }
});

/** Update paziente (solo: identificativo, ospedale_provenienza, sesso, altre_info) */
ipcMain.handle('update-patient', (_ev, {
  id,
  identificativo,
  causa_decesso = null,
  ospedale_provenienza = null,
  data_inizio_ricovero = null,
  sesso = null,
  eta = null,
  gruppo_sanguigno= null,
  peso= null,
  altezza=null,
  luogo_nascita=null,
  luogo_residenza=null,
  altre_info = null,
  actor = null
}) => {
  try {
    const info = db.prepare(`
      UPDATE patients
      SET identificativo = ?, causa_decesso = ?, ospedale_provenienza = ?, data_inizio_ricovero = ?, sesso = ?, eta = ?, gruppo_sanguigno = ?, peso = ?, altezza = ?, luogo_nascita = ?, luogo_residenza = ?,   altre_info = ?
      WHERE id = ?
    `).run((identificativo || '').trim(), causa_decesso, ospedale_provenienza,data_inizio_ricovero, sesso, eta, gruppo_sanguigno, peso, altezza, luogo_nascita, luogo_residenza ,altre_info, id);


    if (info.changes > 0) {
      const ident = (identificativo || '').trim() || getPatientIdentById(id);
      logAction({
        utente_identificativo: actor?.identificativo || null,
        ruolo: actor?.role || null,
        azione: `Aggiornati dati donatore`,
        riferimento_id: ident || null
      });
    }

    return { success: info.changes > 0 };
  } catch (err) {
    console.error('update-patient error:', err);
    return { success: false, error: err.message };
  }
});

/** Ultimo paziente inserito */
ipcMain.handle('get-last-patient', () => {
  try {
    const row = db.prepare(`SELECT id, identificativo FROM patients ORDER BY id DESC LIMIT 1`).get();
    return { success: true, patientId: row ? row.id : null, patient: row || null };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

/** Elimina paziente (cascade su gantts/task_gantt) */
ipcMain.handle('delete-patient', (_ev, { patientId, adminIdentificativo = null }) => {
  try {
    const ident = getPatientIdentById(patientId); // prendi identificativo PRIMA di eliminare
    const del = db.prepare('DELETE FROM patients WHERE id = ?').run(patientId);

    if (del.changes > 0) {
      logAction({
        utente_identificativo: adminIdentificativo,
        ruolo: 'admin',
        azione: `Eliminato donatore e Gantt associati`,
        riferimento_id: ident || null
      });
    }

    return { success: del.changes > 0, changes: del.changes };
  } catch (err) {
    console.error('[MAIN] delete-patient error:', err);
    return { success: false, error: err.message };
  }
});

/* -------- Gantt & Tasks -------- */

/** Controlla/legge start datetime del gantt di un paziente */
ipcMain.handle('check-gantt-start', (_ev, patientId) => {
  try {
    const gantt = db.prepare(`SELECT id, start_datetime FROM gantts WHERE patient_id = ?`).get(patientId);
    if (!gantt) return { success: false, error: 'Gantt non trovato' };
    return { success: true, ganttId: gantt.id, startDatetime: gantt.start_datetime };
  } catch (err) {
    console.error('check-gantt-start error:', err);
    return { success: false, error: err.message };
  }
});

/** Imposta start datetime del gantt */
ipcMain.handle('set-gantt-start', (_ev, { ganttId, startDatetime }) => {
  try {
    const stmt = db.prepare(`UPDATE gantts SET start_datetime = ? WHERE id = ?`);
    stmt.run(startDatetime, ganttId);
    return { success: true, ganttId };
  } catch (err) {
    console.error('set-gantt-start error:', err);
    return { success: false, error: err.message };
  }
});

/** JOIN template + task_gantt per un GANTT */
ipcMain.handle('get-gantt-tasks', (_ev, { ganttId }) => {
  try {
    const rows = db.prepare(`
      SELECT 
        t.id              AS task_id,
        t.name,
        t.duration,
        t.description,
        t.dependencies,
        tg.id             AS tg_id,
        tg.start_datetime AS inst_start,
        tg.end_datetime   AS inst_end,
        tg.status,
        tg.note
      FROM tasks t
      LEFT JOIN task_gantt tg
             ON tg.task_id = t.id AND tg.gantt_id = ?
      ORDER BY CAST(t.id AS INTEGER)
    `).all(ganttId);

    const tasks = rows.map(r => ({
      ...r,
      dependencies: (() => { try { return JSON.parse(r.dependencies || '[]'); } catch { return []; } })()
    }));

    return { success: true, tasks };
  } catch (e) {
    console.error('get-gantt-tasks error:', e);
    return { success: false, error: e.message };
  }
});


ipcMain.handle('get-tasks-by-patient', (_ev, patientId) => {
  try {
    const g = db.prepare(`SELECT id FROM gantts WHERE patient_id = ?`).get(patientId);
    if (!g) return { success: false, error: 'Gantt non trovato per il paziente' };

    const rows = db.prepare(`
      SELECT 
        t.id AS task_id, t.name, t.duration, t.description, t.dependencies,
        tg.id AS tg_id, tg.start_datetime AS inst_start, tg.end_datetime AS inst_end,
        tg.status, tg.note
      FROM tasks t
      LEFT JOIN task_gantt tg
        ON tg.task_id = t.id AND tg.gantt_id = ?
      ORDER BY CAST(t.id AS INTEGER)
    `).all(g.id);

    const tasks = rows.map(r => ({
      ...r,
      dependencies: (() => { try { return JSON.parse(r.dependencies || '[]'); } catch { return []; } })()
    }));

    return { success: true, ganttId: g.id, tasks };
  } catch (e) {
    console.error('get-tasks-by-patient error:', e);
    return { success: false, error: e.message };
  }
});

/** Aggiorna istanza task_gantt + LOG naturale (start/end + note) */
ipcMain.handle('update-task', (_ev, payload) => {
  try {
    const { tgId, status, note, startDatetime, endDatetime, actor = null } = payload || {};
    const fields = [];
    const params = [];

    if (status !== undefined)        { fields.push('status = ?');         params.push(status); }
    if (note !== undefined)          { fields.push('note = ?');           params.push(note); }
    if (startDatetime !== undefined) { fields.push('start_datetime = ?'); params.push(startDatetime); }
    if (endDatetime !== undefined)   { fields.push('end_datetime = ?');   params.push(endDatetime); }
    if (!fields.length) return { success: true, changes: 0 };

    params.push(tgId);
    const info = db.prepare(`UPDATE task_gantt SET ${fields.join(', ')} WHERE id = ?`).run(...params);

    // LOG naturale + donatore (identificativo)
    if (info.changes > 0) {
      const row = db.prepare(`
        SELECT t.name
        FROM task_gantt tg
        JOIN tasks t ON t.id = tg.task_id
        WHERE tg.id = ?
      `).get(tgId);

      const taskName = row?.name || 'Task';
      const who   = actor?.identificativo || null;
      const ruolo = (actor?.role || null);
      const donatoreIdent = getPatientIdentFromTaskInstance(tgId); // <- identificativo paziente

      let azione = null;
      if (status === 'iniziato')  azione = `Iniziato task "${taskName}"`;
      if (status === 'terminato') azione = `Terminato task "${taskName}"`;

      if (note !== undefined) {
        const trimmed = (note || '').trim();
        azione = trimmed
          ? `Aggiunta/modificata nota al task "${taskName}"`
          : `Rimossa nota dal task "${taskName}"`;
      }

      if (azione) {
        logAction({
          utente_identificativo: who,
          ruolo,
          azione,
          riferimento_id: donatoreIdent || null   // <— Identificativo del donatore
        });
      }
    }

    return { success: true, changes: info.changes };
  } catch (e) {
    console.error('update-task error:', e);
    return { success: false, error: e.message };
  }
});

/** Solo template tasks globali */
ipcMain.handle('get-tasks-templates', () => {
  try {
    const rows = db.prepare('SELECT * FROM tasks ORDER BY CAST(id AS INTEGER)').all();
    const tasks = rows.map(t => ({ ...t, dependencies: (()=>{ try { return JSON.parse(t.dependencies||'[]'); } catch { return []; } })() }));
    return { success: true, tasks };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

/** Reset DB (drop + recreate + ripopola tasks) */
ipcMain.handle('reset-database', () => {
  try {
    const drops = [
      'DROP TABLE IF EXISTS task_gantt',
      'DROP TABLE IF EXISTS gantts',
      'DROP TABLE IF EXISTS patients',
      'DROP TABLE IF EXISTS tasks',
      'DROP TABLE IF EXISTS users',
      'DROP TABLE IF EXISTS logs'
    ];
    const tx = db.transaction(() => {
      drops.forEach(sql => db.exec(sql));
      createTables(db);
      seedAdminIfMissing();
    });
    tx();

    // repopola tasks
    const dataPath = getDataJsonPath();
    if (fs.existsSync(dataPath)) {
      const tasksData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
      const insert = db.prepare(`
        INSERT INTO tasks (id, name, duration, description, dependencies)
        VALUES (?, ?, ?, ?, ?)
      `);
      const tx2 = db.transaction(rows => {
        rows.forEach(t => insert.run(
          t.id, t.name, t.duration, t.description || '', JSON.stringify(t.dependencies || [])
        ));
      });
      tx2(tasksData);
    }
    return { success: true };
  } catch (e) {
    console.error('reset-database error:', e);
    return { success: false, error: e.message };
  }
});

/* -------- Logs (solo admin) -------- */
ipcMain.handle('get-logs', (_ev, filters = {}) => {
  try {
    // Ora in logs.riferimento_id salviamo l’IDENTIFICATIVO del donatore: lo esponiamo come "donatore"
    let sql = `SELECT id, utente_identificativo, ruolo, azione, data,
                      riferimento_id AS donatore
               FROM logs`;
    const where = [];
    const args = [];

    if (filters.role)  { where.push('ruolo = ?'); args.push(filters.role); }
    if (filters.user)  { where.push('utente_identificativo = ?'); args.push(filters.user); }
    if (filters.since) { where.push('datetime(data) >= datetime(?)'); args.push(filters.since); }
    if (filters.until) { where.push('datetime(data) <= datetime(?)'); args.push(filters.until); }

    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY datetime(data) DESC';

    const limit = Math.max(0, Math.min(parseInt(filters.limit || 200, 10), 1000));
    sql += ` LIMIT ${limit}`;

    const rows = db.prepare(sql).all(...args);
    return { success: true, logs: rows };
  } catch (e) {
    console.error('get-logs error:', e);
    return { success: false, error: e.message };
  }
});
