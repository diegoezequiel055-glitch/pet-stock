// =============================================
// ventas.js
// Historial de ventas — bolsas y accesorios
// =============================================
// Lee la colección 'ventas' que alimentan stock-bolsas.js y accesorios.js
// Campos esperados:
//   tipo, nombreProducto, cantidad, precioVenta, totalVenta,
//   costoFIFO | costo, ganancia, cliente, fecha (Timestamp)

// ---- ESTADO ----
let ventasCache = [];

// =============================================
// CARGAR VENTAS
// =============================================
async function cargarVentas() {
  const btnRecargar = document.getElementById('btn-recargar');
  if (btnRecargar) btnRecargar.disabled = true;

  try {
    // Traer las últimas 500 ventas ordenadas por fecha descendente
    const snap = await db.collection('ventas')
      .orderBy('fecha', 'desc')
      .limit(500)
      .get();

    ventasCache = snap.docs.map(doc => {
      const d = doc.data();
      return {
        id:       doc.id,
        tipo:     d.tipo || 'bolsa',
        nombre:   d.nombreProducto || '-',
        cantidad: d.cantidad || 0,
        precio:   d.precioVenta || 0,
        total:    d.totalVenta || 0,
        costo:    d.costoFIFO  || d.costo || 0,
        ganancia: d.ganancia   || 0,
        cliente:  d.cliente    || '-',
        audio:    d.origenAudio || false,
        fecha:    d.fecha       // Timestamp Firestore
      };
    });

    aplicarFiltros();
  } catch (err) {
    console.error(err);
    mostrarAlerta('Error al cargar las ventas', 'error');
  } finally {
    if (btnRecargar) btnRecargar.disabled = false;
  }
}

// =============================================
// FILTROS
// =============================================
function aplicarFiltros() {
  const tipo   = document.getElementById('filtro-tipo')?.value   || '';
  const desde  = document.getElementById('filtro-desde')?.value  || '';
  const hasta  = document.getElementById('filtro-hasta')?.value  || '';
  const texto  = normalizar(document.getElementById('buscador-v')?.value || '');

  const filtradas = ventasCache.filter(v => {
    // Tipo
    if (tipo && v.tipo !== tipo) return false;

    // Texto
    if (texto && !normalizar(v.nombre + ' ' + v.cliente).includes(texto)) return false;

    // Fechas
    if (v.fecha) {
      const fecha = v.fecha.toDate ? v.fecha.toDate() : new Date(v.fecha);
      if (desde) {
        const desdeDate = new Date(desde + 'T00:00:00');
        if (fecha < desdeDate) return false;
      }
      if (hasta) {
        const hastaDate = new Date(hasta + 'T23:59:59');
        if (fecha > hastaDate) return false;
      }
    }

    return true;
  });

  renderTablaVentas(filtradas);
  renderResumen(filtradas);
}

// =============================================
// RENDER TABLA
// =============================================
function renderTablaVentas(lista) {
  const tbody = document.getElementById('tbody-ventas');
  if (!tbody) return;

  if (lista.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="sin-datos">No hay ventas en el período seleccionado</td></tr>';
    return;
  }

  tbody.innerHTML = lista.map(v => {
    const margenPct = v.costo > 0
      ? Math.round(((v.total - v.costo) / v.costo) * 100)
      : 0;
    const gananciaClase = v.ganancia >= 0 ? 'ganancia-pos' : 'ganancia-neg';
    const tipoTag = v.tipo === 'bolsa'
      ? '<span class="tag tag-bolsa">📦 Bolsa</span>'
      : '<span class="tag tag-acc">🧸 Accesorio</span>';
    const audioTag = v.audio ? ' <span title="Registrado por voz">🎙️</span>' : '';

    return `<tr>
      <td data-label="Fecha">${formatFecha(v.fecha)}</td>
      <td data-label="Tipo">${tipoTag}</td>
      <td data-label="Producto">${v.nombre}${audioTag}</td>
      <td data-label="Cantidad" style="text-align:right">${v.cantidad}</td>
      <td data-label="Precio unit.">${formatPrecio(v.precio)}</td>
      <td data-label="Total"><strong>${formatPrecio(v.total)}</strong></td>
      <td data-label="Costo">${formatPrecio(v.costo)}</td>
      <td data-label="Ganancia" class="${gananciaClase}">
        <strong>${formatPrecio(v.ganancia)}</strong>
        <small>(${margenPct}%)</small>
      </td>
    </tr>`;
  }).join('');
}

// =============================================
// RENDER RESUMEN (TARJETAS)
// =============================================
function renderResumen(lista) {
  const totalVentas   = lista.length;
  const totalFacturado = lista.reduce((s, v) => s + v.total, 0);
  const totalCosto    = lista.reduce((s, v) => s + v.costo, 0);
  const totalGanancia = lista.reduce((s, v) => s + v.ganancia, 0);
  const margenGlobal  = totalCosto > 0
    ? Math.round((totalGanancia / totalCosto) * 100)
    : 0;

  set('res-v-cantidad',   totalVentas);
  set('res-v-facturado',  formatPrecio(totalFacturado));
  set('res-v-costo',      formatPrecio(totalCosto));
  set('res-v-ganancia',   formatPrecio(totalGanancia));
  set('res-v-margen',     `${margenGlobal}%`);

  // Color de ganancia
  const ganEl = document.getElementById('res-v-ganancia');
  if (ganEl) ganEl.className = `valor ${totalGanancia >= 0 ? 'ganancia-pos' : 'ganancia-neg'}`;
}

function set(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// =============================================
// ATAJOS DE FILTRO RÁPIDO
// =============================================
function filtroRapido(periodo) {
  const hoy   = new Date();
  const desde = document.getElementById('filtro-desde');
  const hasta = document.getElementById('filtro-hasta');

  hasta.value = hoyISO();

  if (periodo === 'hoy') {
    desde.value = hoyISO();
  } else if (periodo === 'semana') {
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - hoy.getDay() + 1);
    desde.value = lunes.toISOString().split('T')[0];
  } else if (periodo === 'mes') {
    desde.value = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`;
  } else if (periodo === 'todo') {
    desde.value = '';
    hasta.value = '';
  }

  aplicarFiltros();
}

// =============================================
// EXPORTAR A CSV
// =============================================
function exportarCSV() {
  const tipo   = document.getElementById('filtro-tipo')?.value || '';
  const desde  = document.getElementById('filtro-desde')?.value || '';
  const hasta  = document.getElementById('filtro-hasta')?.value || '';

  const filtradas = ventasCache.filter(v => {
    if (tipo && v.tipo !== tipo) return false;
    if (v.fecha) {
      const fecha = v.fecha.toDate ? v.fecha.toDate() : new Date(v.fecha);
      if (desde && fecha < new Date(desde + 'T00:00:00')) return false;
      if (hasta && fecha > new Date(hasta + 'T23:59:59')) return false;
    }
    return true;
  });

  if (filtradas.length === 0) {
    mostrarAlerta('No hay datos para exportar', 'warning');
    return;
  }

  const encabezado = ['Fecha','Tipo','Producto','Cantidad','Precio unit.','Total','Costo','Ganancia','Cliente'];
  const filas = filtradas.map(v => [
    formatFecha(v.fecha),
    v.tipo,
    `"${v.nombre}"`,
    v.cantidad,
    v.precio,
    v.total,
    v.costo,
    v.ganancia,
    `"${v.cliente}"`
  ].join(','));

  const csv = [encabezado.join(','), ...filas].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `ventas_${hoyISO()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  mostrarAlerta('Exportación lista', 'success');
}

// =============================================
// INIT
// =============================================
document.addEventListener('DOMContentLoaded', () => {
  // Filtro por defecto: mes actual
  filtroRapido('mes');
  cargarVentas();

  document.getElementById('buscador-v')?.addEventListener('input', aplicarFiltros);
  document.getElementById('filtro-tipo')?.addEventListener('change', aplicarFiltros);
  document.getElementById('filtro-desde')?.addEventListener('change', aplicarFiltros);
  document.getElementById('filtro-hasta')?.addEventListener('change', aplicarFiltros);
});
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 