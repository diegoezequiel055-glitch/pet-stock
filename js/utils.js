// =============================================
// utils.js
// Funciones utilitarias compartidas por todos los módulos
// =============================================

// --- Formateo de moneda argentina ---
function formatPrecio(valor) {
  if (valor === null || valor === undefined || isNaN(valor)) return '$ 0';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(valor);
}

// --- Formateo de fecha desde Firestore Timestamp o Date ---
function formatFecha(timestamp) {
  if (!timestamp) return '-';
  const fecha = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return fecha.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

// --- Mostrar alerta visual en pantalla ---
// tipo: 'success' | 'error' | 'warning'
function mostrarAlerta(mensaje, tipo = 'success') {
  let alerta = document.getElementById('alerta-global');
  if (!alerta) {
    alerta = document.createElement('div');
    alerta.id = 'alerta-global';
    document.body.appendChild(alerta);
  }
  alerta.textContent = mensaje;
  alerta.className = `alerta alerta-${tipo}`;
  alerta.style.display = 'block';
  clearTimeout(alerta._timeout);
  alerta._timeout = setTimeout(() => {
    alerta.style.display = 'none';
  }, 3500);
}

// --- Abrir/cerrar modal ---
function abrirModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.style.display = 'flex';
}

function cerrarModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.style.display = 'none';
}

// Cerrar modal al hacer clic fuera del contenido
document.addEventListener('click', function (e) {
  if (e.target.classList.contains('modal')) {
    e.target.style.display = 'none';
  }
});

// --- Sanitizar texto para búsqueda (sin tildes, minúsculas) ---
function normalizar(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

// --- Obtener fecha actual como string YYYY-MM-DD (para inputs date) ---
function hoyISO() {
  return new Date().toISOString().split('T')[0];
}
