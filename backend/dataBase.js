// dataBase.js
function createTables(db) {
  db.exec(`
    PRAGMA foreign_keys = ON;

    /* === UTENTI (solo identificativo): un solo admin possibile === */
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      identificativo TEXT NOT NULL UNIQUE,
      password TEXT,
      role TEXT NOT NULL CHECK(role IN ('admin','medico')),
      /* Se role='admin' allora identificativo DEVE essere 'admin' */
      CHECK (role <> 'admin' OR identificativo = 'admin')
    );

    /* In più, assicuriamo che esista al massimo 1 riga con role='admin' */
    CREATE UNIQUE INDEX IF NOT EXISTS one_admin_only
      ON users(role)
      WHERE role = 'admin';

    /* === PAZIENTI (solo identificativo) === */
    CREATE TABLE IF NOT EXISTS patients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      identificativo TEXT UNIQUE NOT NULL,
      causa_decesso TEXT,
      ospedale_provenienza TEXT,
      data_inizio_ricovero TEXT,
      sesso TEXT,
      eta TEXT,
      gruppo_sanguigno TEXT,
      peso TEXT,
      altezza TEXT,
      luogo_nascita TEXT,
      luogo_residenza TEXT,
      altre_info TEXT
    );

    /* === TASK TEMPLATE (immutabile) === */
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      duration INTEGER NOT NULL,
      description TEXT,
      dependencies TEXT
    );

    /* === GANTT per paziente === */
    CREATE TABLE IF NOT EXISTS gantts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL,
      start_datetime TEXT,
      FOREIGN KEY(patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );

    /* === ISTANZE TASK per gantt === */
    CREATE TABLE IF NOT EXISTS task_gantt (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      gantt_id INTEGER NOT NULL,
      start_datetime TEXT,
      end_datetime TEXT,
      status TEXT DEFAULT 'non_iniziato',
      note TEXT,
      FOREIGN KEY (task_id) REFERENCES tasks(id),
      FOREIGN KEY (gantt_id) REFERENCES gantts(id) ON DELETE CASCADE
    );

    /* === LOG (facoltativo) === */
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      utente_identificativo TEXT,
      ruolo TEXT,
      azione TEXT,
      data TEXT DEFAULT CURRENT_TIMESTAMP,
      riferimento_id TEXT
    );
  `);
}

module.exports = { createTables };
