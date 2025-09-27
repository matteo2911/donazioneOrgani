window.addEventListener('DOMContentLoaded', () => {
  // Chiude eventuali modali/overlay rimasti aperti
  document.querySelectorAll('.modal, .overlay').forEach(el => {
    el.style.display = 'none';
    el.classList.remove('show');
  });

  // Riferimenti UI
  const switchToAdminBtn = document.getElementById('switchToAdmin');
  const goBackBtn        = document.getElementById('goBack');
  const medicoForm       = document.getElementById('medico-form');
  const adminForm        = document.getElementById('admin-form');

  // Campi MEDICO (solo identificativo)
  const medicoIdentInput = document.getElementById('identificativo-medico');

  // Campi ADMIN (identificativo + password)
  const adminIdentInput  = document.getElementById('identificativo-admin');
  const adminPassInput   = document.getElementById('admin-password');

  // Reset visibilità form e bottoni
  medicoForm.classList.remove('hidden');
  adminForm.classList.add('hidden');
  switchToAdminBtn.classList.remove('hidden');
  goBackBtn.classList.add('hidden');

  // Svuota i campi
  if (medicoIdentInput) medicoIdentInput.value = '';
  if (adminIdentInput)  adminIdentInput.value  = '';
  if (adminPassInput)   adminPassInput.value   = '';

  // Rimuovi eventuali attributi disabilitanti
  [medicoIdentInput, adminIdentInput, adminPassInput].forEach(el => {
    if (!el) return;
    el.removeAttribute('disabled');
    el.removeAttribute('readonly');
  });

  // Switch medico → admin
  switchToAdminBtn.addEventListener('click', () => {
    medicoForm.classList.add('hidden');
    adminForm.classList.remove('hidden');
    switchToAdminBtn.classList.add('hidden');
    goBackBtn.classList.remove('hidden');
  });

  // Switch admin → medico
  goBackBtn.addEventListener('click', () => {
    medicoForm.classList.remove('hidden');
    adminForm.classList.add('hidden');
    switchToAdminBtn.classList.remove('hidden');
    goBackBtn.classList.add('hidden');
  });

  function showError(msg) {
    alert(msg || 'Errore imprevisto.');
  }

  // Redirect post-login
  async function onLoginSuccess(payload) {
    const { role, identificativo } = payload || {};
    localStorage.setItem('role', role || '');
    localStorage.setItem('user_identificativo', identificativo || '');

    if ((role || '').toLowerCase() === 'medico') {
      try {
        // usa la nuova API esposta da preload → main: get-latest-gantt-patient
        const latest = await window.api.getLastGanttPatient?.();
        if (latest?.success && latest?.patientId) {
          window.location.href = `gantt.html?id=${latest.patientId}`;
          return;
        }
      } catch (e) {
        console.warn('[login] getLastGanttPatient fallita:', e);
      }
      // nessun gantt esistente → lista pazienti
      window.location.href = 'pazienti.html';
      return;
    }

    // admin (o altro) → lista pazienti
    window.location.href = 'pazienti.html';
  }

  // === Login MEDICO (identificativo solo) ===
  document.getElementById('loginMedico').addEventListener('click', async () => {
    const identificativo = (medicoIdentInput?.value || '').trim();
    if (!identificativo) {
      showError('Inserisci identificativo del medico.');
      return;
    }

    try {
      const res = await window.api.login({ identificativo, password: '' });
      if (res && res.success) {
        await onLoginSuccess(res);
      } else {
        showError(res?.error || 'Login fallito (utente non trovato o non valido).');
      }
    } catch (error) {
      console.error('[LOGIN MEDICO] errore:', error);
      showError('Errore di connessione con il backend.');
    }
  });

  // === Login ADMIN (identificativo + password) ===
  document.getElementById('loginAdmin').addEventListener('click', async () => {
    const identificativo = (adminIdentInput?.value || '').trim();
    const password       = (adminPassInput?.value  || '').trim();

    if (!identificativo || !password) {
      showError('Inserisci identificativo e password admin.');
      return;
    }

    try {
      const res = await window.api.login({ identificativo, password });
      if (res && res.success) {
        if (res.role !== 'admin') {
          showError('L’utente non ha ruolo admin.');
          return;
        }
        await onLoginSuccess(res);
      } else {
        showError(res?.error || 'Credenziali non valide.');
      }
    } catch (error) {
      console.error('[LOGIN ADMIN] errore:', error);
      showError('Errore di connessione con il backend.');
    }
  });

  // Logout (se presente su questa pagina)
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.clear();
      window.location.href = 'login.html';
    });
  }
});
