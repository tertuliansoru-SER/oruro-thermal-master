// === KILL SWITCH v2 ===
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    registrations.forEach(r => {
      r.unregister();
      console.log('[App] SW desregistrado:', r.scope);
    });
    
    if (registrations.length > 0 && !sessionStorage.getItem('sw-killed')) {
      sessionStorage.setItem('sw-killed', '1');
      console.log('[App] Recargando para limpiar...');
      window.location.reload();
    }
  });
}

// === ESTADO GLOBAL ===
let db = null;
let auth = null;
let currentUser = null;
let hornadaActiva = false;
let faseActual = 1;
let tempObjetivo = 200;
let rampaActual = 25;
let registros = [];
let turnoActual = null;
let lastInchTime = null;
let inchInterval = null;

// === INICIALIZACIÓN ===
document.addEventListener('DOMContentLoaded', () => {
  initFirebase();
  initUI();
  checkExistingSession();
  updateClock();
  setInterval(updateClock, 1000);
});

function initFirebase() {
  try {
    if (typeof firebase === 'undefined') {
      console.error('Firebase no cargado');
      updateConnectionStatus(false);
      return;
    }
    
    db = firebase.firestore();
    auth = firebase.auth();
    
    auth.onAuthStateChanged(user => {
      currentUser = user;
      console.log('Auth state:', user ? 'logueado' : 'anónimo');
    });
    
    auth.signInAnonymously().catch(err => {
      console.error('Auth error:', err);
      updateConnectionStatus(false);
    });
    
    db.collection('test').get().then(() => {
      updateConnectionStatus(true);
      loadData();
    }).catch(() => {
      updateConnectionStatus(false);
    });
    
  } catch (e) {
    console.error('Firebase init error:', e);
    updateConnectionStatus(false);
  }
}

function updateConnectionStatus(online) {
  const indicator = document.getElementById('sync-indicator');
  if (indicator) {
    indicator.textContent = online ? '● ONLINE' : '● OFFLINE';
    indicator.className = online ? 'connection-online' : 'connection-offline';
  }
}

function updateClock() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('es-BO', { hour12: false });
  const clockMain = document.getElementById('clock-main');
  const clockAdmin = document.getElementById('clock-admin');
  if (clockMain) clockMain.textContent = timeStr;
  if (clockAdmin) clockAdmin.textContent = timeStr;
}

// === NAVEGACIÓN ===
function showView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(viewId).classList.add('active');
}

// === TURNO ===
function iniciarTurno() {
  const nombre = document.getElementById('input-nombre-turno').value.trim();
  const hora = document.getElementById('input-hora-turno').value;
  const punta = document.getElementById('input-punta-turno').value;
  
  if (!nombre || !hora) {
    alert('Complete nombre y hora');
    return;
  }
  
  turnoActual = { nombre, hora, punta, inicio: new Date() };
  localStorage.setItem('turno-actual', JSON.stringify(turnoActual));
  
  updateTurnoUI();
  enableRegistro();
}

function cerrarTurno() {
  if (confirm('¿Cerrar turno actual?')) {
    turnoActual = null;
    localStorage.removeItem('turno-actual');
    document.getElementById('turno-form').classList.remove('hidden');
    document.getElementById('turno-activo').classList.add('hidden');
    document.getElementById('registro-section').classList.add('opacity-50', 'pointer-events-none');
  }
}

function updateTurnoUI() {
  if (!turnoActual) return;
  document.getElementById('turno-form').classList.add('hidden');
  document.getElementById('turno-activo').classList.remove('hidden');
  document.getElementById('display-operador').textContent = turnoActual.nombre;
  document.getElementById('display-hora').textContent = turnoActual.hora;
  document.getElementById('display-punta').textContent = turnoActual.punta + 'ra Punta';
}

function enableRegistro() {
  document.getElementById('registro-section').classList.remove('opacity-50', 'pointer-events-none');
  document.getElementById('registro-status').textContent = 'Listo para registrar';
  document.getElementById('registro-status').className = 'text-[10px] bg-lime-900/30 text-lime-400 px-2 py-1 rounded';
}

// === REGISTROS ===
function guardarRegistro() {
  if (!turnoActual) {
    alert('Inicie turno primero');
    return;
  }
  
  const temp = document.getElementById('input-temp').value;
  const draft = document.getElementById('input-draft').value;
  
  if (!temp || !draft) {
    alert('Complete temperatura y draft');
    return;
  }
  
  const registro = {
    timestamp: new Date(),
    horaReloj: document.getElementById('clock-main').textContent,
    operador: turnoActual.nombre,
    punta: turnoActual.punta,
    fase: faseActual,
    tempCasco: parseInt(temp),
    tempInt: parseInt(temp) - 15,
    draft: parseFloat(draft),
    origen: 'Operador'
  };
  
  saveToFirebase(registro);
  addToLog(registro);
  clearInputs();
}

function guardarAdmin() {
  const operador = document.getElementById('admin-operador').value || 'Ingeniero';
  const temp = document.getElementById('admin-temp').value;
  const draft = document.getElementById('admin-draft').value;
  
  if (!temp || !draft) {
    alert('Complete datos');
    return;
  }
  
  const registro = {
    timestamp: new Date(),
    horaReloj: document.getElementById('clock-admin').textContent,
    operador: operador,
    punta: '-',
    fase: faseActual,
    tempCasco: parseInt(temp),
    tempInt: parseInt(temp) - 15,
    draft: parseFloat(draft),
    origen: 'Admin'
  };
  
  saveToFirebase(registro);
  addToLog(registro);
  document.getElementById('admin-temp').value = '';
  document.getElementById('admin-draft').value = '';
}

function saveToFirebase(data) {
  if (!db) {
    alert('Firebase no disponible');
    return;
  }
  
  db.collection('registros').add(data)
    .then(() => {
      updateConnectionStatus(true);
      console.log('Guardado OK');
    })
    .catch(err => {
      console.error('Error guardando:', err);
      updateConnectionStatus(false);
      alert('Error de conexión');
    });
}

function addToLog(reg) {
  registros.unshift(reg);
  renderLog();
  renderTable();
}

function renderLog() {
  const container = document.getElementById('log-container');
  if (!container) return;
  
  if (registros.length === 0) {
    container.innerHTML = '<p class="text-slate-700 text-center mt-10 uppercase font-bold tracking-widest italic">Sin registros</p>';
    return;
  }
  
  container.innerHTML = registros.slice(0, 10).map(r => `
    <div class="bg-slate-900 p-3 rounded-xl border border-slate-800">
      <div class="flex justify-between items-center mb-1">
        <span class="font-bold text-lime-400 text-xs">${r.horaReloj}</span>
        <span class="text-[10px] bg-slate-800 px-2 py-1 rounded text-slate-400">${r.operador}</span>
      </div>
      <div class="flex justify-between text-[10px] text-slate-500">
        <span>T: ${r.tempCasco}°C | D: ${r.draft}</span>
        <span class="text-blue-400">F${r.fase}</span>
      </div>
    </div>
  `).join('');
}

function renderTable() {
  const tbody = document.getElementById('tabla-body');
  const totalSpan = document.getElementById('total-registros');
  if (!tbody) return;
  
  if (registros.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-slate-500 py-8">Sin datos registrados</td></tr>';
    if (totalSpan) totalSpan.textContent = '0';
    return;
  }
  
  if (totalSpan) totalSpan.textContent = registros.length;
  
  tbody.innerHTML = registros.map(r => `
    <tr>
      <td class="font-mono">${r.horaReloj}</td>
      <td>${r.operador}</td>
      <td>${r.punta}</td>
      <td>F${r.fase}</td>
      <td class="text-lime-400">${r.tempCasco}°C</td>
      <td>${r.tempInt}°C</td>
      <td class="text-sky-400">${r.draft}</td>
      <td class="text-[10px] text-slate-500">${r.origen}</td>
    </tr>
  `).join('');
}

function clearInputs() {
  document.getElementById('input-temp').value = '';
  document.getElementById('input-draft').value = '';
}

// === ADMIN ===
function showAdminLogin() {
  showView('view-login');
}

function checkAdminPin() {
  const pin = document.getElementById('admin-pin').value;
  if (pin === '120horas') {
    showView('view-admin');
    document.getElementById('admin-pin').value = '';
  } else {
    alert('PIN incorrecto');
  }
}

function logoutAdmin() {
  showView('view-public');
}

function toggleHornada() {
  hornadaActiva = !hornadaActiva;
  const btn = document.getElementById('btn-master');
  const status = document.getElementById('status-badge');
  const led = document.getElementById('led-main');
  
  if (hornadaActiva) {
    btn.textContent = 'DETENER HORNADA';
    btn.className = 'w-full py-8 rounded-[2.5rem] bg-red-500 text-white font-black text-2xl uppercase mb-6 border-4 border-red-400 shadow-2xl shadow-red-500/20 active:scale-95 transition-all';
    status.textContent = 'Hornada en Curso';
    status.className = 'inline-block px-3 py-1 bg-lime-900/30 text-lime-400 rounded-full text-[10px] font-black uppercase tracking-widest';
    led.className = 'w-4 h-4 rounded-full bg-lime-500 led-lime';
    startInchTimer();
  } else {
    btn.textContent = 'INICIAR HORNADA';
    btn.className = 'w-full py-8 rounded-[2.5rem] bg-lime-500 text-black font-black text-2xl uppercase mb-6 border-4 border-lime-400 shadow-2xl shadow-lime-500/20 active:scale-95 transition-all';
    status.textContent = 'Hornada Detenida';
    status.className = 'inline-block px-3 py-1 bg-red-900/30 text-red-400 rounded-full text-[10px] font-black uppercase tracking-widest';
    led.className = 'w-4 h-4 rounded-full bg-red-600 led-red';
    stopInchTimer();
  }
}

// === INCHING ===
function startInchTimer() {
  lastInchTime = new Date();
  updateInchDisplay();
  inchInterval = setInterval(updateInchDisplay, 1000);
}

function stopInchTimer() {
  clearInterval(inchInterval);
  document.getElementById('inch-timer').textContent = '--:--';
}

function updateInchDisplay() {
  if (!lastInchTime) return;
  const now = new Date();
  const diff = Math.floor((now - lastInchTime) / 1000);
  const remaining = Math.max(0, 7200 - diff);
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  document.getElementById('inch-timer').textContent = 
    `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  
  if (remaining <= 0) {
    document.getElementById('alert-inching').classList.remove('hidden');
  }
}

function confirmInching() {
  lastInchTime = new Date();
  document.getElementById('alert-inching').classList.add('hidden');
  document.getElementById('last-inch').textContent = 
    lastInchTime.toLocaleTimeString('es-BO', { hour12: false, hour: '2-digit', minute: '2-digit' });
}

// === UTILIDADES ===
function checkExistingSession() {
  const saved = localStorage.getItem('turno-actual');
  if (saved) {
    turnoActual = JSON.parse(saved);
    updateTurnoUI();
    enableRegistro();
  }
}

function initUI() {
  document.getElementById('input-hora-turno').value = 
    new Date().toLocaleTimeString('es-BO', { hour12: false, hour: '2-digit', minute: '2-digit' });
}

function descargarCSV() {
  if (registros.length === 0) {
    alert('No hay datos');
    return;
  }
  
  const headers = ['FechaHora', 'HoraReloj', 'Operador', 'Punta', 'Fase', 'TempCasco', 'TempInt', 'Draft', 'Origen'];
  const rows = registros.map(r => [
    r.timestamp.toISOString(),
    r.horaReloj,
    r.operador,
    r.punta,
    r.fase,
    r.tempCasco,
    r.tempInt,
    r.draft,
    r.origen
  ]);
  
  const csv = [headers, ...rows]
    .map(row => row.map(c => `"${c}"`).join(','))
    .join('\n');
  
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `OTM-120H-${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
}

function resetSystem() {
  if (!confirm('¿REINICIAR TODO? Se perderán datos no guardados')) return;
  localStorage.clear();
  sessionStorage.clear();
  location.reload();
}

function loadData() {
  if (!db) return;
  db.collection('registros').orderBy('timestamp', 'desc').limit(50).get()
    .then(snapshot => {
      registros = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      renderLog();
      renderTable();
    });
}
