// app.js - OTM 120H Oruro (Firebase v9 Compat)

const CONFIG = {
    PIN_ADMIN: '120horas',
    FACTOR: 0.85,
    INCHING_LIMIT: 900,
    RAMPS: {
        phase1: { max: 1050, rate: 12 },
        phase2: { max: 1200, rate: 10 },
        phase3: { max: 1280, rate: 8 }
    }
};

const state = {
    running: false,
    startTime: null,
    pausedTime: 0,
    logs: [],
    lastInching: null,
    turnoActual: null,
    isOnline: false,
    inchingWarning: false
};

const HORNADA_DOC = db.collection('hornada').doc('current');
const LOGS_COLLECTION = db.collection('logs');
const INCHING_DOC = db.collection('inching').doc('last');

let unsubscribeHornada = null;
let unsubscribeLogs = null;

async function initFirebase() {
    try {
        console.log('🚀 Iniciando Firebase Auth...');
        
        await auth.signInAnonymously();
        console.log('✅ Autenticación anónima exitosa');
        
        auth.onAuthStateChanged((user) => {
            if (user) {
                console.log('👤 Usuario:', user.uid);
                setupRealtimeListeners();
                updateConnectionStatus(true);
            } else {
                console.log('👤 Usuario desconectado');
                updateConnectionStatus(false);
            }
        });
        
        window.addEventListener('online', () => updateConnectionStatus(true));
        window.addEventListener('offline', () => updateConnectionStatus(false));
        
    } catch (error) {
        console.error('❌ Error Firebase:', error);
        document.getElementById('sync-indicator').textContent = '● ERROR: ' + error.message;
    }
}

function updateConnectionStatus(online) {
    state.isOnline = online;
    const indicator = document.getElementById('sync-indicator');
    const led = document.getElementById('led-main');
    
    if (indicator) {
        indicator.textContent = online ? '● ONLINE' : '● OFFLINE';
        indicator.className = online ? 'text-[10px] connection-status connection-online' : 'text-[10px] connection-status connection-offline';
    }
    
    if (led) {
        led.className = online ? 'w-4 h-4 rounded-full bg-lime-500 led-lime' : 'w-4 h-4 rounded-full bg-red-600 led-red';
    }
}

function setupRealtimeListeners() {
    unsubscribeHornada = HORNADA_DOC.onSnapshot((doc) => {
        if (doc.exists) {
            const data = doc.data();
            state.running = data.running || false;
            state.startTime = data.startTime ? data.startTime.toMillis() : null;
            state.pausedTime = data.pausedTime || 0;
            updateUI();
            updateAdminUI();
            updateRegistroSection();
        }
    });

    const q = LOGS_COLLECTION.orderBy('timestamp', 'desc');
    unsubscribeLogs = q.onSnapshot((snapshot) => {
        state.logs = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            timestamp: doc.data().timestamp?.toMillis() || Date.now()
        }));
        updateUI();
        renderTabla();
    });

    INCHING_DOC.onSnapshot((doc) => {
        if (doc.exists) {
            const data = doc.data();
            state.lastInching = data.lastInching?.toMillis() || null;
            updateUI();
        }
    });
}

window.showView = function(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    if (viewId === 'view-tabla') renderTabla();
};

window.showAdminLogin = function() {
    showView('view-login');
    setTimeout(() => document.getElementById('admin-pin').focus(), 100);
};

window.checkAdminPin = function() {
    const pin = document.getElementById('admin-pin').value;
    if (pin === CONFIG.PIN_ADMIN) {
        document.getElementById('admin-pin').value = '';
        showView('view-admin');
        updateAdminUI();
    } else {
        alert('Credencial incorrecta');
        document.getElementById('admin-pin').value = '';
    }
};

window.logoutAdmin = function() {
    showView('view-public');
};

window.toggleHornada = async function() {
    if (!state.isOnline) {
        alert('Sin conexión. No se puede controlar la hornada.');
        return;
    }
    
    const newRunning = !state.running;
    let newStartTime = state.startTime;
    let newPausedTime = state.pausedTime;
    
    if (newRunning && !state.startTime) {
        newStartTime = firebase.firestore.FieldValue.serverTimestamp();
        newPausedTime = 0;
        await INCHING_DOC.set({ 
            lastInching: firebase.firestore.FieldValue.serverTimestamp(), 
            confirmedBy: auth.currentUser?.uid || 'admin' 
        });
    } else if (!newRunning) {
        newPausedTime = Date.now() - state.startTime;
    }
    
    await HORNADA_DOC.set({
        running: newRunning,
        startTime: newRunning ? newStartTime : state.startTime,
        pausedTime: newPausedTime,
        lastUpdate: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: auth.currentUser?.uid || 'unknown'
    });
};

window.iniciarTurno = function() {
    const nombre = document.getElementById('input-nombre-turno').value.trim();
    const hora = document.getElementById('input-hora-turno').value;
    const punta = document.getElementById('input-punta-turno').value;
    
    if (!nombre) return alert('Ingrese su nombre');
    if (!hora) return alert('Ingrese hora de ingreso');
    
    state.turnoActual = { 
        nombre: nombre.toUpperCase(), 
        hora: hora, 
        punta: punta, 
        inicio: Date.now() 
    };
    
    document.getElementById('display-operador').textContent = state.turnoActual.nombre;
    document.getElementById('display-hora').textContent = state.turnoActual.hora;
    document.getElementById('display-punta').textContent = state.turnoActual.punta + 'ra Punta';
    document.getElementById('turno-form').classList.add('hidden');
    document.getElementById('turno-activo').classList.remove('hidden');
    updateRegistroSection();
};

window.cerrarTurno = function() {
    state.turnoActual = null;
    document.getElementById('input-nombre-turno').value = '';
    document.getElementById('input-hora-turno').value = '';
    document.getElementById('turno-activo').classList.add('hidden');
    document.getElementById('turno-form').classList.remove('hidden');
    updateRegistroSection();
};

function updateRegistroSection() {
    const section = document.getElementById('registro-section');
    const status = document.getElementById('registro-status');
    const inputs = section.querySelectorAll('input');
    const btn = document.getElementById('btn-guardar');
    
    const puedeRegistrar = state.running && state.turnoActual !== null;
    
    if (puedeRegistrar) {
        section.classList.remove('opacity-50', 'pointer-events-none');
        status.textContent = '✓ Listo para registrar';
        status.className = 'text-[10px] bg-lime-900/30 text-lime-400 px-2 py-1 rounded';
        inputs.forEach(inp => inp.disabled = false);
        btn.disabled = false;
    } else {
        section.classList.add('opacity-50', 'pointer-events-none');
        status.textContent = !state.running ? 'Esperando hornada' : 'Inicie turno primero';
        status.className = 'text-[10px] bg-slate-800 text-slate-500 px-2 py-1 rounded';
        inputs.forEach(inp => { inp.disabled = true; inp.value = ''; });
        btn.disabled = true;
    }
}

window.guardarRegistro = async function() {
    if (!state.isOnline) { 
        alert('Sin conexión. Intente nuevamente.'); 
        return; 
    }
    
    const temp = parseFloat(document.getElementById('input-temp').value);
    const draft = parseFloat(document.getElementById('input-draft').value) || 0;
    
    if (!temp || isNaN(temp)) return alert('Ingrese temperatura válida');
    if (!state.turnoActual) return alert('Error: No hay turno activo');
    
    await crearLogFirebase(state.turnoActual.nombre, temp, draft, 'operador');
    
    document.getElementById('input-temp').value = '';
    document.getElementById('input-draft').value = '';
    
    const btn = document.getElementById('btn-guardar');
    btn.textContent = '✓ GUARDADO';
    btn.classList.add('bg-green-600');
    setTimeout(() => { 
        btn.textContent = 'Guardar Registro'; 
        btn.classList.remove('bg-green-600'); 
    }, 1500);
};

window.guardarAdmin = async function() {
    if (!state.isOnline) { 
        alert('Sin conexión. Intente nuevamente.'); 
        return; 
    }
    
    const operador = document.getElementById('admin-operador').value.trim() || 'Ingeniero';
    const temp = parseFloat(document.getElementById('admin-temp').value);
    const draft = parseFloat(document.getElementById('admin-draft').value) || 0;
    
    if (!temp || isNaN(temp)) return alert('Ingrese temperatura válida');
    
    await crearLogFirebase(operador, temp, draft, 'admin');
    
    document.getElementById('admin-temp').value = '';
    document.getElementById('admin-draft').value = '';
    
    const btn = event.target;
    btn.textContent = '✓ GUARDADO';
    setTimeout(() => btn.textContent = 'Guardar Registro', 1500);
};

async function crearLogFirebase(operador, temp, draft, origen) {
    const elapsed = state.startTime ? Math.floor((Date.now() - state.startTime) / 1000) : 0;
    const hours = elapsed / 3600;
    let phase = 1;
    if (hours > 80) phase = 3;
    else if (hours > 40) phase = 2;
    
    const tiempoReloj = document.getElementById('clock-main').textContent;
    
    const logData = {
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        tiempoReloj: tiempoReloj,
        elapsed: elapsed,
        phase: phase,
        operador: operador,
        tempCasco: temp,
        tempInterna: Math.round(temp * CONFIG.FACTOR),
        draft: draft,
        origen: origen,
        punta: state.turnoActual ? state.turnoActual.punta : '-',
        horaIngreso: state.turnoActual ? state.turnoActual.hora : '-',
        inching: false,
        deviceId: auth.currentUser?.uid || 'unknown'
    };
    
    await LOGS_COLLECTION.add(logData);
}

window.confirmInching = async function() {
    if (!state.isOnline) { 
        alert('Sin conexión'); 
        return; 
    }
    
    await INCHING_DOC.set({
        lastInching: firebase.firestore.FieldValue.serverTimestamp(),
        confirmedBy: state.turnoActual ? state.turnoActual.nombre : 'Admin',
        confirmedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    state.inchingWarning = false;
    document.getElementById('alert-inching').classList.add('hidden');
};

window.renderTabla = function() {
    const tbody = document.getElementById('tabla-body');
    const totalSpan = document.getElementById('total-registros');
    
    totalSpan.textContent = state.logs.length;
    
    if (state.logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-slate-500 py-8">Sin datos registrados</td></tr>';
        return;
    }
    
    tbody.innerHTML = state.logs.map(log => `
        <tr>
            <td class="mono text-lime-400">${log.tiempoReloj}</td>
            <td class="font-bold">${log.operador}</td>
            <td>${log.punta}ra</td>
            <td>Fase ${log.phase}</td>
            <td class="mono">${log.tempCasco}°C</td>
            <td class="mono text-lime-400">${log.tempInterna}°C</td>
            <td class="mono text-sky-400">${log.draft}</td>
            <td><span class="px-2 py-1 rounded text-[10px] ${log.origen === 'admin' ? 'bg-red-900/30 text-red-400' : 'bg-blue-900/30 text-blue-400'}">${log.origen}</span></td>
        </tr>
    `).join('');
};

window.descargarCSV = function() {
    if (state.logs.length === 0) { 
        alert('No hay datos para exportar'); 
        return; 
    }
    
    const headers = ['Fecha_Hora', 'Tiempo_Hornada', 'Fase', 'Operador', 'Punta', 'Hora_Ingreso_Operador', 'Temp_Casco_C', 'Temp_Interna_C', 'Draft_mmca', 'Origen', 'Inching'];
    
    const rows = state.logs.map(log => [
        new Date(log.timestamp).toLocaleString(),
        log.tiempoReloj,
        log.phase,
        log.operador,
        log.punta,
        log.horaIngreso,
        log.tempCasco,
        log.tempInterna,
        log.draft,
        log.origen,
        log.inching ? 'SI' : 'NO'
    ]);
    
    let csvContent = '\uFEFF' + headers.join(';') + '\n';
    rows.forEach(row => { csvContent += row.join(';') + '\n'; });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `OTM120H_Oruro_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    alert(`✓ ${state.logs.length} registros descargados`);
};

window.resetSystem = async function() {
    if (!confirm('⚠️ ¿REINICIAR TODO?\n\nSe borrarán todos los datos de Firebase.')) return;
    if (!confirm('¿ESTÁ ABSOLUTAMENTE SEGURO?')) return;
    if (!state.isOnline) { 
        alert('Se requiere conexión para reiniciar'); 
        return; 
    }
    
    try {
        const snapshot = await LOGS_COLLECTION.get();
        const deletePromises = snapshot.docs.map(doc => doc.ref.delete());
        await Promise.all(deletePromises);
        
        await HORNADA_DOC.set({ 
            running: false, 
            startTime: null, 
            pausedTime: 0, 
            lastUpdate: firebase.firestore.FieldValue.serverTimestamp() 
        });
        
        await INCHING_DOC.set({ lastInching: null });
        
        state.running = false;
        state.startTime = null;
        state.pausedTime = 0;
        state.lastInching = null;
        state.logs = [];
        state.turnoActual = null;
        state.inchingWarning = false;
        
        document.getElementById('input-nombre-turno').value = '';
        document.getElementById('input-hora-turno').value = '';
        document.getElementById('turno-form').classList.remove('hidden');
        document.getElementById('turno-activo').classList.add('hidden');
        
        updateUI();
        updateAdminUI();
        showView('view-public');
        
        alert('Sistema reiniciado correctamente');
    } catch (error) {
        console.error('Error al reiniciar:', error);
        alert('Error al reiniciar: ' + error.message);
    }
};

function updateUI() {
    const led = document.getElementById('led-main');
    const status = document.getElementById('status-badge');
    
    if (state.running) {
        led.className = 'w-4 h-4 rounded-full bg-lime-500 led-lime';
        status.textContent = 'Hornada en Curso';
        status.className = 'inline-block px-3 py-1 bg-lime-900/30 text-lime-400 rounded-full text-[10px] font-black uppercase tracking-widest';
    } else {
        led.className = 'w-4 h-4 rounded-full bg-red-600 led-red';
        status.textContent = 'Hornada Detenida';
        status.className = 'inline-block px-3 py-1 bg-red-900/30 text-red-400 rounded-full text-[10px] font-black uppercase tracking-widest';
    }
    
    const elapsed = state.startTime ? (Date.now() - state.startTime) / 1000 : 0;
    const hours = elapsed / 3600;
    let phase = 1, ramp = CONFIG.RAMPS.phase1.rate;
    
    if (hours > 80) { phase = 3; ramp = CONFIG.RAMPS.phase3.rate; }
    else if (hours > 40) { phase = 2; ramp = CONFIG.RAMPS.phase2.rate; }
    
    document.getElementById('phase-badge').textContent = `Fase ${phase}`;
    document.getElementById('current-ramp').textContent = ramp;
    
    if (state.logs.length > 0) {
        const last = state.logs[0];
        document.getElementById('val-temp').textContent = last.tempInterna + '°C';
        document.getElementById('val-press').textContent = last.draft.toFixed(1);
    }
    
    if (state.running && state.lastInching) {
        const sinceInch = Math.floor((Date.now() - state.lastInching) / 1000);
        const remaining = Math.max(0, CONFIG.INCHING_LIMIT - sinceInch);
        const min = Math.floor(remaining / 60).toString().padStart(2, '0');
        const sec = (remaining % 60).toString().padStart(2, '0');
        
        document.getElementById('inch-timer').textContent = `${min}:${sec}`;
        
        if (remaining === 0 && !state.inchingWarning) {
            state.inchingWarning = true;
            document.getElementById('alert-inching').classList.remove('hidden');
            document.getElementById('stopped-time').textContent = `${min}:${sec}`;
        }
    } else {
        document.getElementById('inch-timer').textContent = state.running ? '15:00' : '--:--';
    }
    
    renderLogs();
    updateRegistroSection();
}

function renderLogs() {
    const container = document.getElementById('log-container');
    
    if (state.logs.length === 0) {
        container.innerHTML = '<p class="text-slate-700 text-center mt-10 uppercase font-bold tracking-widest italic">Sin registros</p>';
        return;
    }
    
    container.innerHTML = state.logs.slice(0, 10).map(log => {
        const inchMark = log.inching ? '<span class="text-orange-400">↻</span>' : '';
        const origenIcon = log.origen === 'admin' ? '🔒' : '👷';
        return `
            <div class="p-3 bg-slate-900 rounded-xl border border-slate-800">
                <div class="flex justify-between items-center mb-1">
                    <span class="text-[9px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded mono">${log.tiempoReloj}</span>
                    <span class="text-[9px] text-blue-400 font-bold">${log.operador}</span>
                </div>
                <div class="flex justify-between items-center">
                    <div class="text-sky-400 font-black text-lg">${log.draft.toFixed(1)} <span class="text-[8px] text-slate-500">mmca</span></div>
                    <div class="text-right">
                        <span class="text-xl font-black text-white mono">${log.tempCasco}°C</span>
                        ${origenIcon} ${inchMark}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function updateAdminUI() {
    const btn = document.getElementById('btn-master');
    const status = document.getElementById('admin-phase');
    
    if (state.running) {
        btn.textContent = 'PAUSAR HORNADA';
        btn.className = 'w-full py-8 rounded-[2.5rem] bg-red-500 text-white font-black text-2xl uppercase mb-6 border-4 border-red-400 shadow-2xl shadow-red-500/20 active:scale-95 transition-all';
        status.textContent = '🔥 Hornada Activa';
        status.className = 'text-[10px] font-black text-lime-400 uppercase tracking-[0.3em]';
    } else {
        btn.textContent = 'INICIAR HORNADA';
        btn.className = 'w-full py-8 rounded-[2.5rem] bg-lime-500 text-black font-black text-2xl uppercase mb-6 border-4 border-lime-400 shadow-2xl shadow-lime-500/20 active:scale-95 transition-all';
        status.textContent = 'Sistema en Espera';
        status.className = 'text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]';
    }
}

function updateClock() {
    const elapsed = state.startTime ? (Date.now() - state.startTime) : 0;
    const hours = Math.floor(elapsed / 3600000);
    const minutes = Math.floor((elapsed % 3600000) / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    document.getElementById('clock-main').textContent = timeStr;
    document.getElementById('clock-admin').textContent = timeStr;
    
    if (state.running && state.lastInching) {
        const sinceInch = Math.floor((Date.now() - state.lastInching) / 1000);
        const remaining = Math.max(0, CONFIG.INCHING_LIMIT - sinceInch);
        const min = Math.floor(remaining / 60).toString().padStart(2, '0');
        const sec = (remaining % 60).to