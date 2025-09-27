window.addEventListener('DOMContentLoaded', async () => {
  // Solo admin può vedere
  const role = (localStorage.getItem('role') || '').toLowerCase();
  if (role !== 'admin') {
    alert('Accesso riservato agli amministratori.');
    window.location.href = 'pazienti.html';
    return;
  }

  const tbody = document.querySelector('#logsTable tbody');
  const refreshBtn = document.getElementById('refreshBtn');
  const backBtn = document.getElementById('backBtn');
  const logoutBtn = document.getElementById('logoutBtn');

  backBtn.onclick = () => window.location.href = 'pazienti.html';
  logoutBtn.onclick = () => {
    localStorage.clear();
    window.location.href = 'login.html';
  };

  function escapeHTML(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function loadLogs() {
    try {
      const res = await window.api.getLogs({ limit: 200 });
      if (!res?.success) throw new Error(res?.error || 'Errore getLogs');
      const rows = res.logs || [];
      tbody.innerHTML = '';
      rows.forEach(l => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${l.id}</td>
          <td class="muted">${escapeHTML(l.data)}</td>
          <td>${escapeHTML(l.utente_identificativo)}</td>
          <td>${escapeHTML(l.ruolo)}</td>
          <td class="mono">${escapeHTML(l.azione)}</td>
          <td>${escapeHTML(l.donatore)}</td>
        `;
        tbody.appendChild(tr);
      });
      if (rows.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="6" class="muted">Nessun log</td>`;
        tbody.appendChild(tr);
      }
    } catch (e) {
      console.error('[logs] loadLogs error:', e);
      alert('Errore nel caricamento dei log.');
    }
  }

  refreshBtn.onclick = loadLogs;
  await loadLogs();
});
