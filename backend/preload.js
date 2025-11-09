// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  /* --- Login --- */
  login: (payload /* { identificativo, password? } */) =>
    ipcRenderer.invoke('login', payload),

  /* --- Pazienti --- */
  getPatients: () =>
    ipcRenderer.invoke('get-patients'),

  getPatientById: (patientId) =>
    ipcRenderer.invoke('get-patient-by-id', patientId),

  createPatientAndGantt: ({ identificativo }) =>
    ipcRenderer.invoke('create-patient-and-gantt', { identificativo }),

  updatePatient: (payload /* { id, identificativo, ospedale_provenienza, sesso, altre_info } */) =>
    ipcRenderer.invoke('update-patient', payload),

  deletePatient: ({ patientId, adminIdentificativo = null }) =>
    ipcRenderer.invoke('delete-patient', { patientId, adminIdentificativo }),

  getLastPatient: () =>
    ipcRenderer.invoke('get-last-patient'),

  /* --- Gantt & Tasks --- */
  checkGanttStart: (patientId) =>
    ipcRenderer.invoke('check-gantt-start', patientId),

  setGanttStart: ({ ganttId, startDatetime, actor = null }) =>
    ipcRenderer.invoke('set-gantt-start', { ganttId, startDatetime }),

  // Alias usato dal frontend: prende i task di un Gantt
  getTasks: ({ ganttId }) =>
    ipcRenderer.invoke('get-gantt-tasks', { ganttId }),

  getTasksByPatient: (patientId) =>
    ipcRenderer.invoke('get-tasks-by-patient', patientId),

  updateTask: (payload /* { tgId, status?, note?, startDatetime?, endDatetime?, actor? } */) =>
    ipcRenderer.invoke('update-task', payload),

  getTasksTemplates: () =>
    ipcRenderer.invoke('get-tasks-templates'),

  /* --- Logs (solo admin in UI) --- */
  getLogs: (filters /* { role?, user?, since?, until?, limit? } */) =>
    ipcRenderer.invoke('get-logs', filters),

  /* --- Manutenzione --- */
  resetDatabase: () =>
    ipcRenderer.invoke('reset-database'),
});
