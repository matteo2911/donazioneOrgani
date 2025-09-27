/**********************
 * Modali base
 **********************/
function showGanttModal() {
  // Chiudi sempre eventuale popup note prima di aprire l'orario
  const note = document.getElementById('notePopup');
  if (note) note.style.display = 'none';

  const modal = document.getElementById('ganttModal');
  if (modal) modal.style.display = 'flex';
}

function hideGanttModal() {
  const modal = document.getElementById('ganttModal');
  if (modal) modal.style.display = 'none';
}

function showModal(message) {
  const modal = document.getElementById('customModal');
  if (!modal) { alert(message); return; }
  const modalMessage = document.getElementById('modalMessage');
  const closeButton = document.querySelector('.close-button');
  if (modalMessage) modalMessage.textContent = message;
  modal.classList.remove('hidden');
  if (closeButton) closeButton.onclick = () => modal.classList.add('hidden');
  window.onclick = e => { if (e.target === modal) modal.classList.add('hidden'); };
}

/**********************
 * Stato globale semplice
 **********************/
let GANTT_ID = null;
let CLOCK_CLEANUP = null;   // per fermare l’orologio live
let LAST_START_ISO = null;  // ultimo start_datetime per rigenerare grafico

/**********************
 * Util url
 **********************/
function getPatientIdFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id');
}

/**********************
 * Actor per logging
 **********************/
function getActor() {
  return {
    identificativo: localStorage.getItem('user_identificativo') || null,
    role: (localStorage.getItem('role') || 'medico').toLowerCase(),
  };
}

/**********************
 * Gestione NOTE task
 **********************/
let currentTaskForNote = null;

function openNotePopup(task) {
  // Chiudi sempre la modale orario se fosse aperta
  const gmodal = document.getElementById('ganttModal');
  if (gmodal) gmodal.style.display = 'none';

  currentTaskForNote = task; // istanza (tg_id)
  const noteInput = document.getElementById('noteInput');
  if (noteInput) noteInput.value = task.note || '';
  const np = document.getElementById('notePopup');
  if (np) np.style.display = 'flex';
}
function closeNotePopup() {
  const np = document.getElementById('notePopup');
  if (np) np.style.display = 'none';
  currentTaskForNote = null;
}

const _saveNoteBtn = document.getElementById('saveNoteBtn');
if (_saveNoteBtn) {
  _saveNoteBtn.addEventListener('click', () => {
    const noteText = (document.getElementById('noteInput')?.value || '').trim();
    if (!currentTaskForNote) return;
    window.api.updateTask({ tgId: currentTaskForNote.id, note: noteText, actor: getActor() })
      .then(res => {
        if (!res.success || res.changes === 0) throw new Error('Nessuna modifica applicata');
        closeNotePopup();
        if (LAST_START_ISO) generateGanttFromDatetime(LAST_START_ISO);
      })
      .catch(err => {
        console.error('[RENDERER] Errore nel salvataggio nota:', err);
        showModal("Errore durante il salvataggio della nota. Controlla la console.");
      });
  });
}

/**********************
 * Bootstrap pagina
 **********************/
window.addEventListener('DOMContentLoaded', async () => {
  // 🔒 Chiudi forzatamente tutte le modali/overlay all'avvio
  ['#ganttModal', '#notePopup', '.overlay', '.modal'].forEach(sel => {
    document.querySelectorAll(sel).forEach(el => {
      el.style.display = 'none';
      el.classList?.remove('show');
    });
  });

  const patientId = getPatientIdFromURL();
  if (!patientId) { alert('ID paziente non trovato'); return; }

  // Pulsanti top bar
  const reenterBtn         = document.getElementById('reenterTimeBtn');
  const backBtn            = document.getElementById('backBtn');
  const logoutBtn          = document.getElementById('logoutBtn');

  // Nascondo "Rinserisci orario" inizialmente (stile via JS, CSS rimane il tuo)
  if (reenterBtn) reenterBtn.style.display = 'none';

  // Logout come nelle altre pagine
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.clear();
      window.location.href = 'login.html';
    });
  }
  if (backBtn) backBtn.onclick = () => { window.location.href = 'pazienti.html'; };

  // Mostra identificativo donatore nella top bar
  try {
    const p = await window.api.getPatientById(patientId);
    const el = document.getElementById('patientIdent');
    if (el) el.textContent = p?.identificativo || '—';
  } catch (e) {
    console.warn('[GANTT] impossibile caricare identificativo donatore:', e);
  }

  // Modale orario
  const ganttDatetimeInput = document.getElementById('ganttDatetimeInput');
  const ganttSaveBtn       = document.getElementById('ganttSaveBtn');
  const ganttCancelBtn     = document.getElementById('ganttCancelBtn');

  try {
    const ganttData = await window.api.checkGanttStart(patientId);
    if (!ganttData.success) { alert('Errore: ' + ganttData.error); return; }
    GANTT_ID = ganttData.ganttId || ganttData.id;
    LAST_START_ISO = ganttData.startDatetime || null;

    if (!ganttData.startDatetime) {
      showGanttModal();
    } else {
      generateGanttFromDatetime(ganttData.startDatetime);
      if (reenterBtn) reenterBtn.style.display = 'inline-block';
    }

    if (reenterBtn) {
      reenterBtn.onclick = () => {
        if (ganttDatetimeInput) ganttDatetimeInput.value = LAST_START_ISO ? LAST_START_ISO.slice(0,16) : '';
        showGanttModal();
        reenterBtn.style.display = 'none';
      };
    }

    if (ganttSaveBtn) {
      ganttSaveBtn.onclick = async () => {
        const inputVal = ganttDatetimeInput?.value;
        if (!inputVal) { alert('Inserisci una data valida'); return; }

        const updateRes = await window.api.setGanttStart({
          ganttId: GANTT_ID,
          startDatetime: inputVal,
          actor: getActor() // il backend può ignorarlo per i log dello start, se non richiesti
        });

        if (updateRes.success) {
          GANTT_ID = updateRes.ganttId || GANTT_ID;
          LAST_START_ISO = inputVal;

          // Chiudi entrambe per robustezza
          hideGanttModal();
          closeNotePopup();

          alert('Orario inserito correttamente.');
          generateGanttFromDatetime(inputVal);
          if (reenterBtn) reenterBtn.style.display = 'inline-block';
        } else {
          alert('Errore nel salvataggio orario: ' + updateRes.error);
        }
      };
    }

    if (ganttCancelBtn) {
      ganttCancelBtn.onclick = () => {
        hideGanttModal();
        closeNotePopup();
        if (LAST_START_ISO && reenterBtn) reenterBtn.style.display = 'inline-block';
      };
    }

  } catch (err) {
    alert('Errore imprevisto: ' + err.message);
  }
});

/**********************
 * Generazione Gantt
 **********************/
function generateGanttFromDatetime(startDatetime) {
  LAST_START_ISO = startDatetime;
  const date = new Date(startDatetime);
  renderGantt(date);
}

function generateGanttFromInput(inputHour) {
  const container = document.getElementById('container');
  if (container) container.innerHTML = "";
  const [hh, mm] = inputHour.split(':');
  const now = new Date();
  const startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(hh), parseInt(mm), 0);
  renderGantt(startTime);
}

/**********************
 * Parsing dipendenze
 **********************/
function parseDependencies(text) {
  if (!text) return [];
  try {
    const v = JSON.parse(text);
    return Array.isArray(v) ? v : [];
  } catch {
    return String(text).split(',').map(s => s.trim()).filter(Boolean);
  }
}

/**********************
 * Context & rendering
 **********************/
function createGanttContext(startTime) {
  const taskHeight   = 50;
  const taskPadding  = 15;
  const minuteWidth  = 5;
  const totalMinutes = 24 * 60;
  const endTime      = new Date(startTime.getTime() + totalMinutes * 60000);
  const svgWidth     = totalMinutes * minuteWidth + 600;
  const chartHeight  = 1490;
  const offsetX      = 220;

  //aggiungo padding
  const topPad=50;

  const container = document.getElementById('container');
  if (container) container.innerHTML = "";

  const svg = d3.select('#container')
    .append('svg')
    .attr('width', svgWidth + offsetX)
    .attr('height', chartHeight + 1300+ topPad)
    .style('overflow','visible');

  const tooltip = d3.select('#tooltip');

  const x = d3.scaleTime()
    .domain([startTime, endTime])
    .range([150, svgWidth - 100]);

  const localeIt = d3.timeFormatLocale({
    dateTime: "%A %e %B %Y, %X",
    date: "%d/%m/%Y",
    time: "%H:%M:%S",
    periods: ["AM","PM"],
    days: ["domenica","lunedì","martedì","mercoledì","giovedì","venerdì","sabato"],
    shortDays: ["dom","lun","mar","mer","gio","ven","sab"],
    months: ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"],
    shortMonths: ["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"]
  });

  return {
    startTime, endTime, totalMinutes, svgWidth, chartHeight, offsetX,
    taskHeight, taskPadding, minuteWidth,
    svg, x, tooltip,topPad,
    formatDay: localeIt.format('%B %d')
  };
}

function drawLegend(ctx) {
  const legendGroup = ctx.svg.append('g').attr('transform', 'translate(20, 50)');
  legendGroup.append('rect').attr('x',0).attr('y',-22).attr('width',300).attr('height',185).attr('rx',10).attr('fill','white');

  const items = [
    { color:'rgb(1, 1, 2)', label:'Non iniziato' },
    { color:'rgb(233, 238, 160)',  label:'Richiesto' },
    { color:'rgb(255, 197, 72)',   label:'Iniziato' },
    { color:'rgb(160, 248, 175)',  label:'Terminato o non Richiesto' },
    { symbol:'✎',                  label:'Nota presente' },
    { symbol:'\u25C0',             label:'Torna indietro azione precedente' },
    { symbol:'\u25B6',             label:'Vai avanti azione successiva' }
  ];
  items.forEach((item,i)=>{
    const y = 15 + i*20;
    if (item.color) {
      legendGroup.append('rect').attr('x',10).attr('y',y).attr('width',15).attr('height',15).attr('fill',item.color);
      legendGroup.append('text').attr('x',30).attr('y',y+12).attr('fill','black').attr('font-size','17px').text(item.label);
    } else {
      legendGroup.append('text').attr('x',10).attr('y',y+12).attr('fill','black').attr('font-size','17px').text(`${item.symbol} ${item.label}`);
    }
  });
  legendGroup.append('text').attr('x',10).attr('y',3).attr('fill','black').attr('font-weight','bold').attr('font-size','19px').text('Leggenda Task:');
}

function drawBackgroundBandsAndDayLabels(ctx) {
  const rectHeight = 90;
  const dayStart = new Date(ctx.startTime);
  const dayEnd = new Date(dayStart); dayEnd.setHours(24,0,0,0);

  const y0= ctx.topPad +10; 

  ctx.svg.append('rect').attr('x',ctx.x(dayStart)+ctx.offsetX).attr('y',y0)
    .attr('width', ctx.x(dayEnd)-ctx.x(dayStart)).attr('height',rectHeight).attr('fill','#c89bffff').lower();
  ctx.svg.append('rect').attr('x',ctx.x(dayEnd)+ctx.offsetX).attr('y',y0)
    .attr('width', ctx.x(ctx.endTime)-ctx.x(dayEnd)).attr('height',rectHeight).attr('fill','#c89bffff').lower();
  ctx.svg.append('line').attr('x1',ctx.x(dayEnd)+ctx.offsetX).attr('y1',y0).attr('x2',ctx.x(dayEnd)+ctx.offsetX).attr('y2',10+rectHeight)
    .attr('stroke','#fff').attr('stroke-width',2);

  ctx.svg.append('text')
    .attr('x', ((ctx.x(dayStart)+ctx.offsetX)+(ctx.x(dayEnd)+ctx.offsetX))/2)
    .attr('y',y0+50).attr('text-anchor','middle').attr('fill','#fff').attr('font-weight','bold').attr('font-size','30px')
    .text(ctx.formatDay(dayStart));

  ctx.svg.append('text')
    .attr('x', ((ctx.x(dayEnd)+ctx.offsetX)+(ctx.x(ctx.endTime)+ctx.offsetX))/2)
    .attr('y',y0+50).attr('text-anchor','middle').attr('fill','#fff').attr('font-weight','bold').attr('font-size','30px')
    .text(ctx.formatDay(dayEnd));
}

function drawTimeGrid(ctx) {
  const rectHeight = 90;

  const yBase=ctx.topPad + rectHeight +30; 

  for (let i=0; i<=ctx.totalMinutes; i++) {
    const time = new Date(ctx.startTime.getTime() + i*60000);
    const xPos = ctx.x(time)+ctx.offsetX;

    ctx.svg.append('line')
      .attr('x1',xPos).attr('y1',yBase)
      .attr('x2',xPos).attr('y2',yBase+22)
      .attr('stroke','rgb(255, 255, 255)')
      .attr('stroke-width', i%60===0 ? 5.5 : 0.8);
    if (i%60===0) {
      ctx.svg.append('text').attr('x',xPos+5).attr('y',yBase-6).text(d3.timeFormat('%H:%M')(time)).attr('font-size','15px');
    }
  }
}

function draw18hMarker(ctx) {
  const rectTop = ctx.topPad + 110;
  const t = new Date(ctx.startTime.getTime() + 18*60*60*1000);
  const x18 = ctx.x(t) + ctx.offsetX;
  ctx.svg.append('line').attr('x1',x18).attr('y1',rectTop).attr('x2',x18).attr('y2',ctx.chartHeight+1300+ ctx.topPad).attr('stroke','black').attr('stroke-width',2);
  ctx.svg.append('text').attr('x',x18+5).attr('y',ctx.chartHeight+1260+ctx.topPad).attr('fill','black').attr('font-size','20px')
    .text('18h - COMPLETAMENTO IDEALE DI TUTTE LE ATTIVITÀ ');
  ctx.svg.append('text').attr('x',x18+5).attr('y',rectTop -  -50).attr('fill','black').attr('font-size','20px')
    .text('18h - COMPLETAMENTO IDEALE DI TUTTE LE ATTIVITÀ ');
}

function drawCurrentTimeTicker(ctx) {
  const rectTop = ctx.topPad + 110;

  const line = ctx.svg.append('line').attr('y1',rectTop).attr('y2',ctx.chartHeight+1300+ctx.topPad).attr('stroke','red').attr('stroke-width',2);
  const textBottom = ctx.svg.append('text').attr('y',ctx.chartHeight+1280+ctx.topPad).attr('fill','red').attr('font-size','20px');
  const textTop    = ctx.svg.append('text').attr('y',ctx.topPad + 160).attr('fill','red').attr('font-size','20px');

  function update() {
    const now = new Date();
    const clamped = Math.max(ctx.startTime.getTime(), Math.min(now.getTime(), ctx.endTime.getTime()));
    const xPos = ctx.x(new Date(clamped)) + ctx.offsetX;
    const timeString = d3.timeFormat('%H:%M:%S')(now);
    line.attr('x1',xPos).attr('x2',xPos);
    textBottom.attr('x',xPos+5).text(timeString);
    textTop.attr('x',xPos+5).text(timeString);
  }
  update();
  const id = setInterval(update, 1000);
  return () => clearInterval(id);
}

/**********************
 * Scheduling (basato su template `task_id`)
 **********************/
function scheduleTasksFromTemplates(instances, startTime) {
  const sched = instances.map(t => ({
    schedId: t.task_id,
    duration: t.duration,
    dependencies: t.dependencies,
  }));

  const bySchedId = new Map(sched.map(t => [t.schedId, t]));
  const scheduled = new Map();

  function computeStart(s) {
    if (scheduled.has(s.schedId)) return scheduled.get(s.schedId);
    if (!s.dependencies || s.dependencies.length === 0) {
      const st = new Date(startTime);
      scheduled.set(s.schedId, st);
      return st;
    }
    let maxEnd = new Date(startTime);
    for (const depTid of s.dependencies) {
      const dep = bySchedId.get(depTid);
      if (!dep) continue;
      const depStart = computeStart(dep);
      const depEnd   = new Date(depStart.getTime() + dep.duration*60000);
      if (depEnd > maxEnd) maxEnd = depEnd;
    }
    scheduled.set(s.schedId, maxEnd);
    return maxEnd;
  }

  // calcolo
  sched.forEach(s => {
    const st = computeStart(s);
    const en = new Date(st.getTime() + s.duration*60000);
    s.start = st; s.end = en;
  });

  // proietto i tempi calcolati sulle istanze
  const timeByTemplate = new Map(sched.map(s => [s.schedId, {start:s.start, end:s.end}]));
  instances.forEach(inst => {
    const t = timeByTemplate.get(inst.task_id);
    inst.start = t ? t.start : new Date(startTime);
    inst.end   = t ? t.end   : new Date(startTime.getTime() + inst.duration*60000);
  });

  return instances;
}

/**********************
 * Fetch & Draw tasks
 **********************/
function fetchTasksForGantt() {
  return window.api.getTasks({ ganttId: GANTT_ID }).then(resp => {
    if (!resp.success) throw new Error(resp.error || 'Errore getTasks');
    const rows = resp.tasks.map(t => {
      const depsRaw = parseDependencies(t.dependencies);
      const deps = depsRaw.map(x => String(x));
      return {
        id: t.tg_id,                      // id ISTANZA
        task_id: String(t.task_id),       // id TEMPLATE
        name: t.name,
        duration: t.duration,
        description: t.description,
        dependencies: deps,
        status: t.status || 'non_iniziato',
        note: t.note || null
      };
    });
    return rows;
  });
}

function drawTasks(ctx, data) {
  // y layout
  data.forEach((d, i) => d.y = 140 + i * (ctx.taskHeight + ctx.taskPadding));

  const statusColors = {
    non_iniziato: 'rgba(75, 73, 227, 1)',
    richiesto:    'rgb(233, 238, 160)',
    iniziato:     'rgb(255, 197, 72)',
    terminato:    'rgb(160, 248, 175)'
  };

  // chiavi = template id (stringhe)
  const byTaskTemplate = new Map(data.map(d => [d.task_id, d]));

  const groups = ctx.svg.selectAll('.task').data(data).enter().append('g');

  groups.each(function(d) {
    const g = d3.select(this);

    const barX = ctx.x(d.start) + ctx.offsetX;
    const barY = ctx.topPad+ d.y + 30;
    const barW = Math.max(1, ctx.x(d.end) - ctx.x(d.start));
    const barH = ctx.taskHeight;

    // barra
    g.append('rect')
     .attr('class', 'task')
     .attr('x', barX)
     .attr('y', barY)
     .attr('width',  barW)
     .attr('height', barH)
     .attr('fill', statusColors[d.status] || '#ccc')
     .attr('stroke', '#000')
     .on('click', () => openNotePopup(d))
     .on('mouseover', (event) => {
        const depsNames = (d.dependencies && d.dependencies.length)
          ? d.dependencies.map(tid => (byTaskTemplate.get(tid)?.name || tid)).join(', ')
          : 'Nessuna';
        const statusText = { non_iniziato:'Non Iniziato', richiesto:'Richiesto', iniziato:'Iniziato', terminato:'Terminato o non Richiesto' }[d.status];
        let html = `<div style="text-align:center;"><strong class="task-name">${d.name}</strong></div><strong class="task-d">Durata:</strong> ${d.duration} min<br/>`;
        if (d.description) html += `<strong class="task-d">Descrizione:</strong> ${d.description}<br/>`;
        html += `<strong class="task-d">Dipendenze:</strong> ${depsNames}<br/><strong class="task-d">Stato:</strong> ${statusText}<br/><strong class="task-note">Nota:</strong> ${d.note || 'Nessuna'}`;
        ctx.tooltip.style('opacity',1).html(html).style('left',(event.pageX+10)+'px').style('top',(event.pageY+10)+'px');
     })
     .on('mousemove', (event) => ctx.tooltip.style('left',(event.pageX+10)+'px').style('top',(event.pageY+10)+'px'))
     .on('mouseout', () => ctx.tooltip.style('opacity',0));

    // ✎ Icona matita se esiste una nota (cliccabile per aprire il popup)
    const hasNote = !!(d.note && String(d.note).trim().length > 0);
    if (hasNote) {
      const iconX = (barW > 22) ? (barX + barW - 16) : (barX + 6);
      const iconY = barY + barH / 2;
      g.append('text')
        .attr('x', iconX)
        .attr('y', iconY)
        .text('✎')
        .attr('font-size', '16px')
        .attr('dominant-baseline', 'middle')
        .attr('fill', '#000')
        .style('cursor', 'pointer')
        .on('click', (e) => { e.stopPropagation(); openNotePopup(d); })
        .append('title').text('Nota presente');
    }

    // ▶ Freccia avanti
    const forwardArrow = g.append('text')
      .attr('x', ctx.x(d.end) + ctx.offsetX + 15)
      .attr('y', ctx.topPad + d.y + ctx.taskHeight / 2 + 40)
      .text('\u25B6')
      .attr('font-size', '27px')
      .attr('fill', d.status === 'terminato' ? 'gray' : '#000')
      .style('cursor', 'pointer')
      .on('click', function() {
        function depsCompleted(inst) {
          if (!inst.dependencies || inst.dependencies.length === 0) return true;
          return inst.dependencies.every(depTid => {
            const depInst = byTaskTemplate.get(depTid);
            return depInst && depInst.status === 'terminato';
          });
        }

        if (d.status === 'non_iniziato') {
          if (depsCompleted(d)) {
            d.status = 'richiesto';
            g.select('rect').attr('fill', statusColors[d.status]);
            updateTaskStatus(d.id, 'richiesto'); // niente log lato server per 'richiesto'
          } else {
            const names = d.dependencies
              .map(tid => byTaskTemplate.get(tid))
              .filter(x => x && x.status !== 'terminato')
              .map(x => x.name).join(', ');
            showModal(`Per iniziare questo processo devi concludere prima i processi: ${names}`);
          }
        } else if (d.status === 'richiesto') {
          if (depsCompleted(d)) {
            d.status = 'iniziato';
            g.select('rect').attr('fill', statusColors[d.status]);
            updateTaskStatus(d.id, 'iniziato', { startDatetime: new Date().toISOString() });
          } else {
            const names = d.dependencies
              .map(tid => byTaskTemplate.get(tid))
              .filter(x => x && x.status !== 'terminato')
              .map(x => x.name).join(', ');
            showModal(`Per iniziare questo processo devi concludere prima i processi: ${names}`);
          }
        } else if (d.status === 'iniziato') {
          d.status = 'terminato';
          g.select('rect').attr('fill', statusColors[d.status]);
          forwardArrow.attr('fill', 'gray');
          updateTaskStatus(d.id, 'terminato', { endDatetime: new Date().toISOString() });
        }
      });

    // ◀ Freccia indietro
    g.append('text')
      .attr('x', ctx.x(d.start) + ctx.offsetX - 40)
      .attr('y', ctx.topPad + d.y + ctx.taskHeight / 2 + 40)
      .text('\u25C0')
      .attr('font-size', '27px')
      .style('cursor', 'pointer')
      .on('click', function() {
        // task che dipendono da d (template)
        const dependents = data.filter(t => (t.dependencies || []).includes(d.task_id));
        const anyActive = dependents.some(t => t.status !== 'non_iniziato');
        if (anyActive) {
          const names = dependents.map(t => t.name).join(', ');
          showModal(`Non puoi tornare indietro, ci sono task dipendenti iniziati: ${names}`);
          return;
        }

        if (d.status === 'terminato') {
          d.status = 'iniziato';
          updateTaskStatus(d.id, 'iniziato', { endDatetime: null }); // opzionale: pulizia end
        } else if (d.status === 'iniziato') {
          d.status = 'richiesto';
          updateTaskStatus(d.id, 'richiesto', { startDatetime: null });
        } else if (d.status === 'richiesto') {
          d.status = 'non_iniziato';
          updateTaskStatus(d.id, 'non_iniziato');
        } else {
          showModal('Il task è già nello stato iniziale.');
          return;
        }
        g.select('rect').attr('fill', statusColors[d.status]);
        forwardArrow.attr('fill', d.status === 'terminato' ? 'gray' : '#000');
      });
  });

  // Label colonna sinistra + background
  const minY = d3.min(data, d => d.y + ctx.taskHeight/2 + 20);
  const maxY = d3.max(data, d => d.y + ctx.taskHeight/2 + 50);
  ctx.svg.append('rect')
    .attr('class', 'label-background')
    .attr('x', 0).attr('y', ctx.topPad + minY - 20)
    .attr('width', 330).attr('height', maxY - minY + 320)
    .attr('fill', 'white').attr('rx', 10).attr('opacity', 0.8);

  const labels = ctx.svg.selectAll('.label')
    .data(data)
    .enter()
    .append('text')
    .classed('label', true)
    .attr('x', 10)
    .attr('y', d => ctx.topPad + d.y + ctx.taskHeight / 2 + 30)
    .attr('font-weight', 'bold')
    .attr('font-size', '18px')
    .text(d => d.name);

  // scroll orizzontale: mantieni le label ancorate
  window.addEventListener('scroll', () => {
    const scrollX = window.scrollX || window.pageXOffset;
    labels.attr('x', 10 + scrollX);
    ctx.svg.select('.label-background').attr('x', scrollX);
  });
}

/**********************
 * Update stato (istanza tgId) — con actor per logging
 **********************/
function updateTaskStatus(tgId, status, extra = {}) {
  const payload = { tgId, status, actor: getActor(), ...extra };
  return window.api.updateTask(payload).then(res => {
    if (!res.success || res.changes === 0) showModal("Errore nell'aggiornamento dello stato del task.");
  });
}

/**********************
 * Orchestratore
 **********************/
function renderGantt(startTime) {
  // cleanup orologio precedente
  if (CLOCK_CLEANUP) { try { CLOCK_CLEANUP(); } catch {} finally { CLOCK_CLEANUP = null; } }

  const ctx = createGanttContext(startTime);
  drawLegend(ctx);
  drawBackgroundBandsAndDayLabels(ctx);
  drawTimeGrid(ctx);
  draw18hMarker(ctx);
  CLOCK_CLEANUP = drawCurrentTimeTicker(ctx);

  fetchTasksForGantt()
    .then(rows => {
      // calcolo start/end in base alle dipendenze (template)
      const withTimes = scheduleTasksFromTemplates(rows, ctx.startTime);
      drawTasks(ctx, withTimes);
    })
    .catch(err => {
      console.error('[RENDERER] getTasks error:', err);
      showModal('Errore nel recupero dei task.');
    });
}
