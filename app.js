// === KILL SWITCH v2 ===
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    registrations.forEach(r => {
      r.unregister();
      console.log('[App] SW desregistrado:', r.scope);
    });
    
    // Recarga limpia si había SW viejo
    if (registrations.length > 0 && !sessionStorage.getItem('sw-killed')) {
      sessionStorage.setItem('sw-killed', '1');
      console.log('[App] Recargando para limpiar...');
      window.location.reload();
    }
  });
}

// === CONFIGURACIÓN ===
const CONFIG = {
  PIN_ADMIN: '120horas',
  FIREBASE_CONFIG: {
    apiKey: "AIzaSyCzUxfhj2wGFXDXHrmqi7sYkCUOPMFanzQ",
    authDomain: "otm-120h-oruro.firebaseapp.com",
    projectId: "otm-120h-oruro",
    storageBucket: "otm-120h-oruro.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abc123def456"
  }
};

// === INICIALIZACIÓN FIREBASE ===
firebase.initializeApp(CONFIG.FIREBASE_CONFIG);
const db = firebase.firestore();
const auth = firebase.auth();

// === ESTADO ONLINE/OFFLINE ===
let isOnline = false;

function updateOnlineStatus(status) {
  isOnline = status;
  const indicator = document.getElementById('online-indicator');
  if (indicator) {
    indicator.textContent = status ? '● ONLINE' : '● OFFLINE';
    indicator.className = status ? 'online' : 'offline';
  }
}

// Detectar conexión
window.addEventListener('online', () => updateOnlineStatus(true));
window.addEventListener('offline', () => updateOnlineStatus(false));

// Verificar conexión a Firebase
function checkFirebaseConnection() {
  try {
    db.collection('test').get().then(() => {
      updateOnlineStatus(true);
    }).catch(() => {
      updateOnlineStatus(false);
    });
  } catch (e) {
    updateOnlineStatus(false);
  }
}

// === SISTEMA DE TURNOS ===
const turnos = {
  lista: [],
  
  async cargar() {
    try {
      const snapshot = await db.collection('turnos').orderBy('timestamp', 'desc').get();
      this.lista = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      this.renderizar();
      updateOnlineStatus(true);
    } catch (error) {
      console.error('Error cargando turnos:', error);
      updateOnlineStatus(false);
    }
  },
  
  async guardar(turno) {
    try {
      await db.collection('turnos').add({
        ...turno,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });
      await this.cargar();
      return true;
    } catch (error) {
      console.error('Error guardando turno:', error);
      updateOnlineStatus(false);
      return false;
    }
  },
  
  renderizar() {
    const tabla = document.getElementById('tabla-turnos');
    if (!tabla) return;
    
    tabla.innerHTML = this.lista.map(t => `
      <tr>
        <td>${t.fecha || '-'}</td>
        <td>${t.turno || '-'}</td>
        <td>${t.operador || '-'}</td>
        <td>${t.horno || '-'}</td>
        <td>${t.observaciones || '-'}</td>
      </tr>
    `).join('');
  }
};

// === PANEL ADMIN ===
function mostrarPanelAdmin() {
  const pin = prompt('Ingrese PIN de administrador:');
  if (pin === CONFIG.PIN_ADMIN) {
    document.getElementById('panel-admin').style.display = 'block';
  } else {
    alert('PIN incorrecto');
  }
}

function exportarCSV() {
  if (turnos.lista.length === 0) {
    alert('No hay datos para exportar');
    return;
  }
  
  const headers = ['Fecha', 'Turno', 'Operador', 'Horno', 'Observaciones'];
  const rows = turnos.lista.map(t => [
    t.fecha, t.turno, t.operador, t.horno, t.observaciones
  ]);
  
  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${cell || ''}"`).join(','))
    .join('\n');
  
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `OTM-120H-Oruro-${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
}

// === EVENT LISTENERS ===
document.addEventListener('DOMContentLoaded', () => {
  // Registrar nuevo SW
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js')
      .then(reg => console.log('SW registrado:', reg))
      .catch(err => console.error('Error SW:', err));
  }
  
  // Cargar datos
  checkFirebaseConnection();
  turnos.cargar();
  
  // Formulario
  const form = document.getElementById('form-turno');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const turno = {
        fecha: document.getElementById('fecha').value,
        turno: document.getElementById('turno').value,
        operador: document.getElementById('operador').value,
        horno: document.getElementById('horno').value,
        observaciones: document.getElementById('observaciones').value
      };
      
      if (await turnos.guardar(turno)) {
        alert('Turno guardado correctamente');
        form.reset();
      } else {
        alert('Error al guardar. Verifique conexión.');
      }
    });
  }
  
  // Botón admin
  const btnAdmin = document.getElementById('btn-admin');
  if (btnAdmin) {
    btnAdmin.addEventListener('click', mostrarPanelAdmin);
  }
  
  // Botón exportar
  const btnExportar = document.getElementById('btn-exportar');
  if (btnExportar) {
    btnExportar.addEventListener('click', exportarCSV);
  }
});
