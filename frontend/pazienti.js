window.addEventListener('DOMContentLoaded', () => {
  const list      = document.getElementById('pazienti-list');
  const modal     = document.getElementById('addPatientModal');
  const addBtn    = document.getElementById('addPatientBtn');
  const closeBtn  = document.getElementById('closePatientModalBtn');
  const saveBtn   = document.getElementById('savePatientBtn');
  const identInput= document.getElementById('identificativoPaziente');

  // ruolo dal login
  const role = (localStorage.getItem('role') || '').toLowerCase();
  const isAdmin = role === 'admin';

  // Mostra "Vedi Log" solo all'admin
  const viewLogsBtn = document.getElementById('viewLogsBtn');
  if (viewLogsBtn) {
    if (isAdmin) {
      viewLogsBtn.style.display = 'inline-block';
      viewLogsBtn.onclick = () => (window.location.href = 'logs.html');
    } else {
      viewLogsBtn.style.display = 'none';
    }
  }

  async function loadPatients() {
    try {
      const pazienti = await window.api.getPatients();
      list.innerHTML = '';

      (pazienti || []).forEach(p => {
        const card = document.createElement('div');
        card.className = 'paziente-card';

        const name = document.createElement('div');
        name.className = 'paziente-name';
        name.textContent = p.identificativo;

        const actions = document.createElement('div');
        actions.className = 'actions';

        if (isAdmin) {
          const delBtn = document.createElement('button');
          delBtn.className = 'btn-delete';
          delBtn.textContent = 'Elimina';
          delBtn.title = 'Elimina paziente (e relativo gantt/tasks)';
          delBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const ok = window.confirm(
              `Confermi l'eliminazione del paziente #${p.id} (${p.identificativo})?\n` +
              `Verranno rimossi anche Gantt e Task correlati.`
            );
            if (!ok) return;

            try {
              const adminIdentificativo = localStorage.getItem('user_identificativo') || 'admin';
              const res = await window.api.deletePatient({ patientId: p.id, adminIdentificativo });
              if (!res?.success) {
                alert(res?.error || 'Eliminazione non riuscita');
                return;
              }
              await loadPatients();
            } catch (err) {
              console.error('[UI] deletePatient error:', err);
              alert('Errore durante l’eliminazione');
            }
          });
          actions.appendChild(delBtn);
        }

        card.addEventListener('click', () => {
          window.location.href = `paziente.html?id=${p.id}`;
        });

        card.appendChild(name);
        card.appendChild(actions);
        list.appendChild(card);
      });

      if (!pazienti || pazienti.length === 0) {
        const empty = document.createElement('div');
        empty.style.color = '#666';
        empty.style.textAlign = 'center';
        empty.style.padding = '12px 0';
        empty.textContent = 'Nessun paziente';
        list.appendChild(empty);
      }
    } catch (e) {
      console.error('[UI] getPatients error:', e);
      alert('Errore nel caricamento dei pazienti');
    }
  }

  // Apre/chiude modale
  addBtn.onclick = () => {
    if (!modal) return;
    modal.style.display = 'flex';
    if (identInput) identInput.value = '';
  };

  closeBtn.onclick = () => { if (modal) modal.style.display = 'none'; };
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.style.display = 'none';
    });
  }

  // Salvataggio nuovo paziente
  saveBtn.onclick = async () => {
    const identificativo = (identInput?.value || '').trim();
    if (!identificativo) {
      alert('Inserisci un identificativo.');
      return;
    }

    try {
      const res = await window.api.createPatientAndGantt({ identificativo });
      if (res?.success) {
        if (modal) modal.style.display = 'none';
        await loadPatients();
        console.log(`Paziente ID ${res.patientId} creato, Gantt ID: ${res.ganttId}`);
      } else {
        // Gestione VINCOLO UNIQUE sul campo identificativo
        const msg = (res?.error || '').toLowerCase();
        if (msg.includes('unique') || msg.includes('constraint') || msg.includes('duplic')) {
          alert('Identificativo già esistente. Scegli un altro identificativo.');
        } else {
          alert('Errore: ' + (res?.error || 'Impossibile aggiungere paziente'));
        }
      }
    } catch (err) {
      console.error('Errore salvataggio paziente:', err);
      alert('Errore imprevisto: ' + (err?.message || err));
    }
  };

  // Logout
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.onclick = () => {
      if (modal) modal.style.display = 'none';
      localStorage.clear();
      window.location.href = 'login.html';
    };
  }

  loadPatients();
});
