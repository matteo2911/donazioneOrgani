// preload.js
const { contextBridge, ipcRenderer, webFrame } = require('electron');

contextBridge.exposeInMainWorld('api', {
  /* --- Login --- */
  login: (payload) =>
    ipcRenderer.invoke('login', payload),
  
  /* --- Pazienti --- */
  getPatients: () =>
    ipcRenderer.invoke('get-patients'),

  getPatientById: (patientId) =>
    ipcRenderer.invoke('get-patient-by-id', patientId),

  createPatientAndGantt: ({ identificativo }) =>
    ipcRenderer.invoke('create-patient-and-gantt', { identificativo }),

  updatePatient: (payload ) =>
    ipcRenderer.invoke('update-patient', payload),

  deletePatient: ({ patientId, adminIdentificativo = null }) =>
    ipcRenderer.invoke('delete-patient', { patientId, adminIdentificativo }),

  getLastPatient: () =>
    ipcRenderer.invoke('get-last-patient'),

  /* --- Gantt & Tasks --- */
  checkGanttStart: (patientId) =>
    ipcRenderer.invoke('check-gantt-start', patientId),

  setGanttStart: ({ ganttId, startDatetime, actor = null }) =>
    ipcRenderer.invoke('set-gantt-start', { ganttId, startDatetime, actor }),

  // Alias usato dal frontend: prende i task di un Gantt
  getTasks: ({ ganttId }) =>
    ipcRenderer.invoke('get-gantt-tasks', { ganttId }),

  getTasksByPatient: (patientId) =>
    ipcRenderer.invoke('get-tasks-by-patient', patientId),

  updateTask: (payload ) =>
    ipcRenderer.invoke('update-task', payload),

  getTasksTemplates: () =>
    ipcRenderer.invoke('get-tasks-templates'),

  /* --- Logs (solo admin in UI) --- */
  getLogs: (filters) =>
    ipcRenderer.invoke('get-logs', filters),

  clearLogs: () =>
  ipcRenderer.invoke('clear-logs'),

  /* --- Manutenzione --- */
  resetDatabase: () =>
    ipcRenderer.invoke('reset-database'),  
});


// =========================
// Zoom con CTRL/CMD + rotellina (globale su tutte le pagine)
// =========================
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

window.addEventListener('wheel', (event) => {
  const zoomModifier = event.ctrlKey || event.metaKey; // Ctrl (Win/Linux) o Cmd (Mac)
  if (!zoomModifier) return;

  event.preventDefault();

  const step = 0.10;
  const current = webFrame.getZoomFactor();
  const next = event.deltaY < 0 ? current + step : current - step;

  webFrame.setZoomFactor(clamp(next, 0.25, 3));
}, { passive: false });

// reset veloce
window.addEventListener('keydown', (event) => {
  const zoomModifier = event.ctrlKey || event.metaKey;
  if (!zoomModifier) return;
  if (event.key === '0') webFrame.setZoomFactor(1);
});
