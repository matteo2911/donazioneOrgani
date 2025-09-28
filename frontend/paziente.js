window.addEventListener('DOMContentLoaded', () => {
  // id paziente dalla query string
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if (!id) {
    alert('Paziente non trovato');
    window.location.href = 'pazienti.html';
    return;
  }

  // Elementi info paziente (nuovo schema)
  const infoIdentificativo = document.getElementById('infoIdentificativo');
  const infoOspedale       = document.getElementById('infoOspedale');
  const infoSesso          = document.getElementById('infoSesso');
  const infoAltro          = document.getElementById('infoAltro');
  const pazienteNome       = document.getElementById('pazienteNome');

  // Form edit
  const editBtn     = document.getElementById('editBtn');
  const ganttBtn    = document.getElementById('ganttBtn');
  const editForm    = document.getElementById('editForm');
  const annullaEdit = document.getElementById('annullaEdit');

  // Input form modifica (nuovo schema)
  const editIdentificativo = document.getElementById('editIdentificativo');
  const editOspedale       = document.getElementById('editOspedale');
  const editSesso          = document.getElementById('editSesso');
  const editAltreInfo      = document.getElementById('editAltreInfo');

  // Modale gantt
  const ganttModal         = document.getElementById('ganttModal');
  const ganttDatetimeInput = document.getElementById('ganttDatetimeInput');
  const ganttSaveBtn       = document.getElementById('ganttSaveBtn');
  const ganttCancelBtn     = document.getElementById('ganttCancelBtn');

  // Helpers
  const setText = (el, v) => { if (el) el.textContent = v ?? ''; };
  const setVal  = (el, v) => { if (el) el.value = v ?? ''; };
  const showEl  = (el) => el && el.classList.remove('hidden');
  const hideEl  = (el) => el && el.classList.add('hidden');

  async function loadPaziente() {
    const p = await window.api.getPatientById(id);
    if (!p) {
      alert('Paziente non trovato');
      window.location.href = 'pazienti.html';
      return;
    }

    // Titolo e campi (anonimi)
    setText(pazienteNome,        p.identificativo || '');
    setText(infoIdentificativo,  p.identificativo || '');
    setText(infoOspedale,        p.ospedale_provenienza || '');
    setText(infoSesso,           p.sesso || '');
    setText(infoAltro,           p.altre_info || '');

    // Precompila form edit
    setVal(editIdentificativo,   p.identificativo || '');
    setVal(editOspedale,         p.ospedale_provenienza || '');
    setVal(editSesso,            p.sesso || '');
    setVal(editAltreInfo,        p.altre_info || '');
  }

  // Mostra/Nascondi form edit
  if (editBtn)  editBtn.onclick     = () => showEl(editForm);
  if (annullaEdit) annullaEdit.onclick = () => hideEl(editForm);

  // Submit modifica (nuovo payload)
  if (editForm) {
    editForm.onsubmit = async (e) => {
      e.preventDefault();

      const identificativo       = (editIdentificativo?.value || '').trim();
      const ospedale_provenienza = (editOspedale?.value || '').trim() || null;
      const sesso                = (editSesso?.value || '').trim() || null;
      const altre_info           = (editAltreInfo?.value || '').trim() || null;

      if (!identificativo) {
        alert('Inserisci l’identificativo del paziente.');
        return;
      }

      const res = await window.api.updatePatient({
        id,
        identificativo,
        ospedale_provenienza,
        sesso,
        altre_info
      });

      if (res.success) {
        hideEl(editForm);
        await loadPaziente();
      } else {
        const msg = (res.error || '').toLowerCase();
        if (msg.includes('unique') || msg.includes('constraint') || msg.includes('duplic')) {
          alert('Identificativo già esistente. Scegli un altro identificativo.');
        } else {
          alert('Errore: ' + (res.error || 'Impossibile aggiornare paziente'));
        }
      }
    };
  }

  // Pulsante Gantt
  if (ganttBtn) {
    ganttBtn.onclick = async () => {
      try {
        const res = await window.api.checkGanttStart(id);
        if (!res.success) {
          alert('Errore: ' + res.error);
          return;
        }

        if (!res.startDatetime) {
          // chiede orario di inizio
          showEl(ganttModal);

          if (ganttSaveBtn) {
            ganttSaveBtn.onclick = async () => {
              const inputVal = ganttDatetimeInput?.value;
              if (!inputVal) { alert('Inserisci una data valida'); return; }

              const updateRes = await window.api.setGanttStart({ ganttId: res.ganttId, startDatetime: inputVal });
              if (!updateRes.success) {
                alert('Errore nel salvataggio orario: ' + updateRes.error);
                return;
              }
              hideEl(ganttModal);
              alert('Orario inserito correttamente.');
              localStorage.setItem('LastGant', id);
              window.location.href = `gantt.html?id=${id}`;
            };
          }
          if (ganttCancelBtn) {
            ganttCancelBtn.onclick = () => hideEl(ganttModal);
          }
        } else {
          // start già presente
          localStorage.setItem('LastGant', id);
          window.location.href = `gantt.html?id=${id}`;
        }
      } catch (err) {
        alert('Errore imprevisto: ' + err.message);
      }
    };
  }

  // Indietro
  const backBtn = document.getElementById('Indietro');
  if (backBtn) backBtn.onclick = () => { window.location.href = 'pazienti.html'; };

  // Logout
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.onclick = () => {
      localStorage.clear();
      window.location.href = 'login.html';
    };
  }

  loadPaziente();
});
