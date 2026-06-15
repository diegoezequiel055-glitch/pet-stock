// =============================================
// lista-precios.js
// Lista de precios por marca — perros y gatos
// =============================================
// Estructura Firestore:
//   precios/{id}
//     nombre, marca, especie, unidadPeso
//     costo, precioMinorista, precioMayorista
//     margenMinorista (%), margenMayorista (%)
//     ultimaActualizacion

// ---- ESTADO LOCAL ----
let preciosCache      = [];
let precioEditId      = '';   // producto en edición inline
let marcaActualizar   = '';   // marca en modal de aumento masivo
let productoAEliminar = null; // { id, nombre } para el modal de confirmación
let vistaActual       = 'interna'; // 'interna' | 'cliente'

// =============================================
// CARGAR Y MOSTRAR
// =============================================
async function cargarPrecios() {
  try {
    const snap = await db.collection('precios')
      .orderBy('marca')
      .get();

    preciosCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // No re-renderizar si hay una edición inline activa
    if (!precioEditId) {
      renderLista(preciosCache);
    }
  } catch (err) {
    console.error(err);
    mostrarAlerta('Error al cargar la lista de precios', 'error');
  }
}

// ── Vista compacta (modo búsqueda) ──────────────────────
function renderListaCompacta(lista) {
  const contenedor = document.getElementById('contenedor-precios');
  if (!contenedor) return;

  if (lista.length === 0) {
    contenedor.innerHTML = '<p class="sin-datos" style="padding:32px;text-align:center">Sin resultados</p>';
    return;
  }

  contenedor.innerHTML = lista.map(p => {
    const minStr  = p.precioMinorista > 0 ? formatPrecio(p.precioMinorista) : '—';
    const mayStr  = p.precioMayorista > 0 ? formatPrecio(p.precioMayorista) : '—';
    const mMin    = p.costo > 0 && p.precioMinorista > 0
                    ? Math.round(((p.precioMinorista - p.costo) / p.costo) * 100) : 0;
    const mMay    = p.costo > 0 && p.precioMayorista > 0
                    ? Math.round(((p.precioMayorista - p.costo) / p.costo) * 100) : 0;
    const pesoTag = p.unidadPeso
                    ? `<span class="fr-peso">${p.unidadPeso}</span>` : '';

    return `
      <div class="fila-rapida" onclick="toggleDetalleRapido(this)">
        <div class="fr-nombre">${p.nombre}</div>
        ${pesoTag}
        <button class="btn btn-sm btn-gris" onclick="event.stopPropagation();abrirEdicionInline('${p.id}')" title="Editar" style="padding:3px 10px;font-size:13px;flex-shrink:0;margin-left:auto">✏️</button>
        <div class="fr-min" style="margin-left:8px">${minStr}</div>
        <span class="fr-chevron">▾</span>
      </div>
      <div class="fr-detalle">
        <div class="fr-det-item">
          <span>Mayorista</span>
          <strong>${mayStr}</strong>
        </div>
        ${(mMin > 0 && vistaActual === 'interna') ? `<div class="fr-det-item"><span>% Min.</span><strong>${mMin}%</strong></div>` : ''}
        ${(mMay > 0 && vistaActual === 'interna') ? `<div class="fr-det-item"><span>% May.</span><strong>${mMay}%</strong></div>` : ''}
        ${(p.costo > 0 && vistaActual === 'interna') ? `<div class="fr-det-item"><span>Costo</span><strong>${formatPrecio(p.costo)}</strong></div>` : ''}
        <div class="fr-det-marca">📦 ${p.marca}</div>
      </div>`;
  }).join('');
}

function toggleDetalleRapido(fila) {
  // Cerrar el que estaba abierto (si es otro)
  const prevAbierta = document.querySelector('.fila-rapida.abierta');
  if (prevAbierta && prevAbierta !== fila) {
    prevAbierta.classList.remove('abierta');
    prevAbierta.nextElementSibling?.classList.remove('visible');
  }
  fila.classList.toggle('abierta');
  fila.nextElementSibling?.classList.toggle('visible');
}

// Orden fijo de bloques según el PDF
const ORDEN_BLOQUES = [
  'NESTLE - PURINA',
  'ROYAL CANIN',
  'VITAL CAT',
  'VITAL CAN',
  'EUKANUBA',
  'DR COSSIA Y PROVET',
  'ALIMENTOS VARIOS GATOS',
  'ALIMENTOS VARIOS PARA PERROS',
  'SANITARIOS',
  'CEREALES',
];

// ---- Render agrupado por bloque ----
function renderLista(lista) {
  const filtroEspecie = document.getElementById('filtro-especie-p')?.value || '';
  const textoBusq     = normalizar(document.getElementById('buscador-p')?.value || '');

  const filtrada = lista.filter(p => {
    const okEspecie = !filtroEspecie || p.especie === filtroEspecie;
    const okTexto   = !textoBusq || normalizar(`${p.bloque || p.marca} ${p.nombre}`).includes(textoBusq);
    return okEspecie && okTexto;
  });

  // Con texto de búsqueda → vista compacta de resultados
  if (textoBusq) {
    renderListaCompacta(filtrada);
    return;
  }

  // Agrupar por bloque (con fallback a marca)
  const porBloque = {};
  for (const p of filtrada) {
    const clave = p.bloque || p.marca;
    if (!porBloque[clave]) porBloque[clave] = [];
    porBloque[clave].push(p);
  }

  const contenedor = document.getElementById('contenedor-precios');
  if (!contenedor) return;

  if (filtrada.length === 0) {
    contenedor.innerHTML = '<p class="sin-datos" style="padding:32px;text-align:center">No hay productos en la lista</p>';
    return;
  }

  // Ordenar según ORDEN_BLOQUES, los que no estén van al final
  const bloques = Object.keys(porBloque).sort((a, b) => {
    const ia = ORDEN_BLOQUES.indexOf(a);
    const ib = ORDEN_BLOQUES.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  contenedor.innerHTML = bloques
    .map(bloque =>
      vistaActual === 'cliente'
        ? renderBloqueMarcaCliente(bloque, porBloque[bloque])
        : renderBloqueMarca(bloque, porBloque[bloque])
    )
    .join('');
}

function renderBloqueMarca(bloque, productos) {
  const ordenados = [...productos].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
  const bloqueEsc = bloque.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const total     = productos.length;
  const isMobile  = window.innerWidth < 769;

  const cabecera = `
    <div class="bloque-marca">
      <div class="marca-header" onclick="toggleMarca(this)">
        <div class="marca-titulo">
          <span class="marca-icono">▸</span>
          <strong>${bloque}</strong>
          <span class="marca-badge">${total} producto${total !== 1 ? 's' : ''}</span>
        </div>
        <div style="display:flex;gap:5px;flex-shrink:0">
          <button class="btn btn-sm btn-naranja"
            onclick="event.stopPropagation(); abrirModalActualizarMarca('${bloqueEsc}')">
            📈 ${isMobile ? 'Costos' : 'Actualizar costos'}
          </button>
          <button class="btn btn-sm" style="background:#25d366;color:white;border-color:#25d366"
            onclick="event.stopPropagation(); compartirMarcaWA('${bloqueEsc}')" title="WhatsApp">
            📲 WA
          </button>
        </div>
      </div>
      <div class="marca-contenido" style="display:none">`;

  const cierre = `</div></div>`;

  if (isMobile) {
    // ── MOBILE: tarjetas verticales ───────────────────────
    const cards = ordenados.map(p => {
      const mMin    = p.costo > 0 && p.precioMinorista > 0
                      ? Math.round(((p.precioMinorista - p.costo) / p.costo) * 100) : null;
      const mColor  = mMin === null ? '' : mMin < 20 ? '#ef4444' : mMin < 40 ? '#f97316' : '#4ade80';
      const nEsc    = p.nombre.replace(/'/g, '&#39;').replace(/"/g, '&quot;');
      return `
        <div style="background:#1e293b;border:1px solid #1e3a5f;border-radius:10px;padding:12px 14px;margin:0 10px 8px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
            <div style="flex:1;min-width:0">
              <div style="color:#fff;font-weight:700;font-size:14px;margin-bottom:4px">${p.nombre}</div>
              <div style="display:flex;gap:5px;flex-wrap:wrap">
                ${p.especie  ? `<span style="background:#374151;color:#d1d5db;padding:1px 7px;border-radius:5px;font-size:11px;font-weight:600">${p.especie}</span>` : ''}
                ${p.unidadPeso ? `<span style="background:#0f172a;color:#4ade80;padding:1px 7px;border-radius:5px;font-size:11px;font-weight:600">${p.unidadPeso}</span>` : ''}
              </div>
            </div>
            <div style="text-align:right;flex-shrink:0;margin-left:10px">
              <div style="font-size:18px;font-weight:900;color:#4ade80;line-height:1.1">${formatPrecio(p.precioMinorista)}</div>
              <div style="font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase">Minorista</div>
            </div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
            ${p.precioMayorista > 0 ? `<span style="background:#0f172a;color:#94a3b8;padding:2px 9px;border-radius:5px;font-size:12px">May: ${formatPrecio(p.precioMayorista)}</span>` : ''}
            ${mMin !== null ? `<span style="background:#0f172a;color:${mColor};padding:2px 9px;border-radius:5px;font-size:12px;font-weight:700">${mMin}% margen</span>` : ''}
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-sm btn-gris" style="flex:1;justify-content:center" onclick="abrirEdicionInline('${p.id}')">✏️ Editar</button>
            <button class="btn btn-sm btn-rojo" style="padding:5px 12px;justify-content:center" onclick="confirmarEliminar('${p.id}','${nEsc}')">🗑</button>
          </div>
        </div>`;
    }).join('');
    return cabecera + cards + cierre;
  }

  // ── DESKTOP: tabla compacta ───────────────────────────
  const filas = ordenados.map(p => renderFilaProducto(p)).join('');
  return cabecera + `
    <table class="tabla-precios">
      <thead>
        <tr>
          <th class="check-col">
            <input type="checkbox" class="check-all-marca" data-marca="${bloqueEsc}"
              onchange="seleccionarTodaMarca(this)" title="Seleccionar todos">
          </th>
          <th>Producto</th><th>Especie</th><th>Peso</th><th>Costo</th>
          <th>Minorista</th><th>% Min.</th><th>Mayorista</th><th>% May.</th><th></th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>` + cierre;
}

function renderFilaProducto(p) {
  const margenMin = p.costo > 0
    ? Math.round(((p.precioMinorista - p.costo) / p.costo) * 100)
    : 0;
  const margenMay = p.costo > 0
    ? Math.round(((p.precioMayorista - p.costo) / p.costo) * 100)
    : 0;
  const margenClase = margenMin < 20 ? 'margen-bajo' : margenMin < 40 ? 'margen-medio' : 'margen-ok';
  const nombreEsc = p.nombre.replace(/'/g, '&#39;').replace(/"/g, '&quot;');

  const margenMayClase = margenMay < 20 ? 'margen-bajo' : margenMay < 40 ? 'margen-medio' : 'margen-ok';

  return `
    <tr id="fila-${p.id}">
      <td class="check-col">
        <input type="checkbox" class="check-producto" value="${p.id}" onchange="actualizarBarraSeleccion()">
      </td>
      <td data-label="Producto">${p.nombre}</td>
      <td data-label="Especie"><span class="tag tag-${p.especie}">${p.especie}</span></td>
      <td data-label="Peso">${p.unidadPeso || '-'}</td>
      <td data-label="Costo" class="celda-costo">${formatPrecio(p.costo)}</td>
      <td data-label="Minorista">${formatPrecio(p.precioMinorista)}</td>
      <td data-label="% Min." class="${margenClase}">
        <strong>${margenMin}%</strong>
      </td>
      <td data-label="Mayorista">${formatPrecio(p.precioMayorista)}</td>
      <td data-label="% May." class="${margenMayClase}">
        <strong>${margenMay}%</strong>
      </td>
      <td class="acciones">
        <button class="btn btn-sm btn-gris" onclick="abrirEdicionInline('${p.id}')">Editar</button>
        <button class="btn btn-sm btn-rojo" onclick="confirmarEliminar('${p.id}', '${nombreEsc}')" title="Eliminar">🗑</button>
      </td>
    </tr>`;
}

// =============================================
// EXPANDIR / COLAPSAR MARCAS
// =============================================
function toggleMarca(header) {
  const contenido = header.nextElementSibling;
  const icono     = header.querySelector('.marca-icono');
  const colapsado = contenido.style.display === 'none';
  contenido.style.display = colapsado ? 'block' : 'none';
  icono.textContent = colapsado ? '▾' : '▸';
}

// =============================================
// AGREGAR PRODUCTO NUEVO
// =============================================
async function agregarPrecio(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;

  const costo      = parseFloat(document.getElementById('np-costo').value)      || 0;
  const precioMin  = parseFloat(document.getElementById('np-precio-min').value) || 0;
  const precioMay  = parseFloat(document.getElementById('np-precio-may').value) || 0;
  // Si se ingresa costo + margen, los precios ya vienen calculados en los campos.
  // El margen se recalcula a la inversa si hay costo.
  const margenMi   = costo > 0 && precioMin > 0 ? Math.round(((precioMin - costo) / costo) * 100) : 0;
  const margenMa   = costo > 0 && precioMay > 0 ? Math.round(((precioMay - costo) / costo) * 100) : 0;

  const data = {
    nombre:           document.getElementById('np-nombre').value.trim(),
    marca:            document.getElementById('np-marca').value.trim(),
    especie:          document.getElementById('np-especie').value,
    unidadPeso:       document.getElementById('np-peso').value.trim(),
    costo,
    margenMinorista:  margenMi,
    margenMayorista:  margenMa,
    precioMinorista:  precioMin,
    precioMayorista:  precioMay,
    ultimaActualizacion: firebase.firestore.FieldValue.serverTimestamp()
  };

  if (!data.nombre || !data.marca || !data.especie) {
    mostrarAlerta('Completá nombre, marca y especie', 'warning');
    btn.disabled = false;
    return;
  }
  if (data.precioMinorista <= 0) {
    mostrarAlerta('Ingresá al menos el precio minorista', 'warning');
    btn.disabled = false;
    return;
  }

  try {
    await db.collection('precios').add(data);
    mostrarAlerta(`"${data.nombre}" agregado a la lista`, 'success');
    cerrarModal('modal-nuevo-precio');
    e.target.reset();
    cargarPrecios();
  } catch (err) {
    console.error(err);
    mostrarAlerta('Error al guardar', 'error');
  } finally {
    btn.disabled = false;
  }
}

// Previsualizar márgenes mientras escribís los precios
function calcularPreviewNuevo() {
  const costo    = parseFloat(document.getElementById('np-costo').value)      || 0;
  const precioMi = parseFloat(document.getElementById('np-precio-min').value) || 0;
  const precioMa = parseFloat(document.getElementById('np-precio-may').value) || 0;
  const box      = document.getElementById('np-preview-box');
  if (!box) return;
  if (costo > 0 && (precioMi > 0 || precioMa > 0)) {
    box.style.display = 'flex';
    const mMin = precioMi > 0 ? Math.round(((precioMi - costo) / costo) * 100) : 0;
    const mMay = precioMa > 0 ? Math.round(((precioMa - costo) / costo) * 100) : 0;
    document.getElementById('np-preview-min').textContent = mMin + '%';
    document.getElementById('np-preview-may').textContent = mMay + '%';
  } else {
    box.style.display = 'none';
  }
}

// =============================================
// EDICIÓN — detecta mobile vs desktop
// =============================================
function abrirEdicionInline(id) {
  // En mobile (< 769px) → modal limpio
  if (window.innerWidth < 769) {
    abrirModalEdicionMobile(id);
    return;
  }

  // Desktop → edición inline en la fila (si existe); si no, usar modal
  const fila = document.getElementById('fila-' + id);
  if (!fila) {
    // Vista compacta (búsqueda): no hay fila de tabla, abrir modal
    abrirModalEdicionMobile(id);
    return;
  }

  if (precioEditId && precioEditId !== id) cerrarEdicionInline(precioEditId);
  precioEditId = id;
  const p = preciosCache.find(x => x.id === id);
  if (!p) return;
  fila.classList.add('fila-editando');
  fila.innerHTML =
    '<td class="check-col"></td>' +
    '<td><input class="input-inline" id="ei-nombre" value="' + p.nombre.replace(/"/g,'&quot;') + '" style="min-width:120px"></td>' +
    '<td><select class="input-inline" id="ei-especie">' +
      '<option value="perros"' + (p.especie==='perros'?' selected':'') + '>🐶 Perros</option>' +
      '<option value="gatos"'  + (p.especie==='gatos' ?' selected':'') + '>🐱 Gatos</option>'  +
      '<option value="ambos"'  + (p.especie==='ambos' ?' selected':'') + '>Ambos</option>'  +
    '</select></td>' +
    '<td><input class="input-inline" id="ei-peso" value="' + (p.unidadPeso||'') + '" style="width:60px"></td>' +
    '<td><input class="input-inline" id="ei-costo" type="number" value="' + (p.costo||0) + '" oninput="recalcularInline()" style="width:80px"></td>' +
    '<td><input class="input-inline" id="ei-precio-min" type="number" value="' + (p.precioMinorista||0) + '" oninput="recalcularInline()" style="width:85px"></td>' +
    '<td id="ei-mrg-min" class="margen-ok" style="font-size:12px;white-space:nowrap"></td>' +
    '<td><input class="input-inline" id="ei-precio-may" type="number" value="' + (p.precioMayorista||0) + '" oninput="recalcularInline()" style="width:85px"></td>' +
    '<td id="ei-mrg-may" class="margen-ok" style="font-size:12px;white-space:nowrap"></td>' +
    '<td class="acciones">' +
      '<button class="btn btn-sm btn-verde" onclick="guardarEdicionInline(\'' + id + '\')">✓</button>' +
      '<button class="btn btn-sm btn-outline" onclick="cerrarEdicionInline(\'' + id + '\')">✕</button>' +
    '</td>';

  recalcularInline();
}

function recalcularInline() {
  const costo    = parseFloat(document.getElementById('ei-costo')?.value)     || 0;
  const precioMi = parseFloat(document.getElementById('ei-precio-min')?.value) || 0;
  const precioMa = parseFloat(document.getElementById('ei-precio-may')?.value) || 0;

  const mrgMin = costo > 0 && precioMi > 0 ? Math.round(((precioMi - costo) / costo) * 100) : null;
  const mrgMay = costo > 0 && precioMa > 0 ? Math.round(((precioMa - costo) / costo) * 100) : null;

  const elMin = document.getElementById('ei-mrg-min');
  const elMay = document.getElementById('ei-mrg-may');
  if (elMin) {
    elMin.textContent = mrgMin !== null ? mrgMin + '%' : '';
    elMin.className = mrgMin === null ? '' : mrgMin < 20 ? 'margen-bajo' : mrgMin < 40 ? 'margen-medio' : 'margen-ok';
  }
  if (elMay) {
    elMay.textContent = mrgMay !== null ? mrgMay + '%' : '';
    elMay.className = mrgMay === null ? '' : mrgMay < 20 ? 'margen-bajo' : mrgMay < 40 ? 'margen-medio' : 'margen-ok';
  }
}

async function guardarEdicionInline(id) {
  const costo      = parseFloat(document.getElementById('ei-costo').value)     || 0;
  const precioMin  = parseFloat(document.getElementById('ei-precio-min').value) || 0;
  const precioMay  = parseFloat(document.getElementById('ei-precio-may').value) || 0;
  const margenMi   = costo > 0 && precioMin > 0 ? Math.round(((precioMin - costo) / costo) * 100) : 0;
  const margenMa   = costo > 0 && precioMay > 0 ? Math.round(((precioMay - costo) / costo) * 100) : 0;

  const updates = {
    nombre:           document.getElementById('ei-nombre').value.trim(),
    especie:          document.getElementById('ei-especie').value,
    unidadPeso:       document.getElementById('ei-peso').value.trim(),
    costo,
    precioMinorista:  precioMin,
    precioMayorista:  precioMay,
    margenMinorista:  margenMi,
    margenMayorista:  margenMa,
    ultimaActualizacion: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    await db.collection('precios').doc(id).update(updates);
    mostrarAlerta('Precios actualizados', 'success');
    precioEditId = '';
    cargarPrecios();
  } catch (err) {
    console.error(err);
    mostrarAlerta('Error al guardar', 'error');
  }
}

function cerrarEdicionInline(id) {
  precioEditId = '';
  cargarPrecios();
}

// =============================================
// EDICIÓN MODAL (mobile o cuando se requiere)
// =============================================
let _editModalId = '';

function abrirModalEdicionMobile(id) {
  _editModalId = id;
  const p = preciosCache.find(x => x.id === id);
  if (!p) return;

  document.getElementById('edit-precio-titulo').textContent = p.marca + ' — ' + p.nombre;
  document.getElementById('epm-nombre').value     = p.nombre;
  document.getElementById('epm-especie').value    = p.especie;
  document.getElementById('epm-peso').value       = p.unidadPeso || '';
  document.getElementById('epm-costo').value      = p.costo || '';
  document.getElementById('epm-precio-min').value = p.precioMinorista || '';
  document.getElementById('epm-precio-may').value = p.precioMayorista || '';
  recalcularModal();
  abrirModal('modal-editar-precio');
}

function recalcularModal() {
  const costo    = parseFloat(document.getElementById('epm-costo')?.value)      || 0;
  const precioMi = parseFloat(document.getElementById('epm-precio-min')?.value) || 0;
  const precioMa = parseFloat(document.getElementById('epm-precio-may')?.value) || 0;

  const mMin = costo > 0 && precioMi > 0 ? Math.round(((precioMi - costo) / costo) * 100) : null;
  const mMay = costo > 0 && precioMa > 0 ? Math.round(((precioMa - costo) / costo) * 100) : null;

  const box = document.getElementById('epm-margenes');
  if (box) {
    box.style.display = (mMin !== null || mMay !== null) ? 'flex' : 'none';
    const elMin = document.getElementById('epm-mrg-min');
    const elMay = document.getElementById('epm-mrg-may');
    if (elMin) { elMin.textContent = mMin !== null ? mMin + '%' : '—'; elMin.className = mMin === null ? '' : mMin < 20 ? 'margen-bajo' : mMin < 40 ? 'margen-medio' : 'margen-ok'; }
    if (elMay) { elMay.textContent = mMay !== null ? mMay + '%' : '—'; elMay.className = mMay === null ? '' : mMay < 20 ? 'margen-bajo' : mMay < 40 ? 'margen-medio' : 'margen-ok'; }
  }
}

async function guardarDesdeModal() {
  const id = _editModalId;
  if (!id) return;
  const costo     = parseFloat(document.getElementById('epm-costo').value)      || 0;
  const precioMin = parseFloat(document.getElementById('epm-precio-min').value) || 0;
  const precioMay = parseFloat(document.getElementById('epm-precio-may').value) || 0;
  const margenMi  = costo > 0 && precioMin > 0 ? Math.round(((precioMin - costo) / costo) * 100) : 0;
  const margenMa  = costo > 0 && precioMay > 0 ? Math.round(((precioMay - costo) / costo) * 100) : 0;

  const updates = {
    nombre:          document.getElementById('epm-nombre').value.trim(),
    especie:         document.getElementById('epm-especie').value,
    unidadPeso:      document.getElementById('epm-peso').value.trim(),
    costo,
    precioMinorista: precioMin,
    precioMayorista: precioMay,
    margenMinorista: margenMi,
    margenMayorista: margenMa,
    ultimaActualizacion: firebase.firestore.FieldValue.serverTimestamp()
  };

  if (!updates.nombre) { mostrarAlerta('El nombre no puede estar vacío', 'warning'); return; }
  if (precioMin <= 0)   { mostrarAlerta('Ingresá un precio minorista válido', 'warning'); return; }

  try {
    await db.collection('precios').doc(id).update(updates);
    mostrarAlerta('Precios actualizados', 'success');
    cerrarModalEdicion();
    cargarPrecios();
  } catch (err) {
    console.error(err);
    mostrarAlerta('Error al guardar', 'error');
  }
}

function cerrarModalEdicion() {
  _editModalId = '';
  cerrarModal('modal-editar-precio');
}

// =============================================
// ELIMINAR PRODUCTO INDIVIDUAL
// =============================================
function confirmarEliminar(id, nombre) {
  productoAEliminar = { id, nombre };
  const texto = document.getElementById('texto-confirmar-eliminar');
  if (texto) texto.textContent = `¿Seguro que querés eliminar "${nombre}"? Esta acción no se puede deshacer.`;
  abrirModal('modal-confirmar-eliminar');
}

async function ejecutarEliminar() {
  if (!productoAEliminar) return;
  const btn = document.getElementById('btn-confirmar-eliminar');
  btn.disabled = true;

  try {
    await db.collection('precios').doc(productoAEliminar.id).delete();
    mostrarAlerta(`"${productoAEliminar.nombre}" eliminado`, 'success');
    cerrarModal('modal-confirmar-eliminar');
    productoAEliminar = null;
    cargarPrecios();
  } catch (err) {
    console.error(err);
    mostrarAlerta('Error al eliminar', 'error');
  } finally {
    btn.disabled = false;
  }
}

// =============================================
// SELECCIÓN MÚLTIPLE Y ELIMINACIÓN EN LOTE
// =============================================
function obtenerSeleccionados() {
  return [...document.querySelectorAll('.check-producto:checked')].map(cb => cb.value);
}

function actualizarBarraSeleccion() {
  const ids = obtenerSeleccionados();
  const barra = document.getElementById('barra-seleccion');
  const texto = document.getElementById('texto-seleccion');
  if (!barra) return;
  if (ids.length > 0) {
    barra.classList.add('visible');
    if (texto) texto.textContent = ids.length + ' producto' + (ids.length !== 1 ? 's' : '') + ' seleccionado' + (ids.length !== 1 ? 's' : '');
  } else {
    barra.classList.remove('visible');
  }
}

function seleccionarTodaMarca(checkbox) {
  const tabla = checkbox.closest('table');
  if (!tabla) return;
  tabla.querySelectorAll('.check-producto').forEach(cb => { cb.checked = checkbox.checked; });
  actualizarBarraSeleccion();
}

function deseleccionarTodo() {
  document.querySelectorAll('.check-producto, .check-all-marca').forEach(cb => { cb.checked = false; });
  actualizarBarraSeleccion();
}

async function eliminarSeleccionados() {
  const ids = obtenerSeleccionados();
  if (ids.length === 0) return;
  if (!confirm('¿Eliminar ' + ids.length + ' producto' + (ids.length !== 1 ? 's' : '') + '? Esta acción no se puede deshacer.')) return;
  const btn = document.getElementById('btn-eliminar-seleccionados');
  if (btn) btn.disabled = true;
  try {
    const batch = db.batch();
    ids.forEach(id => batch.delete(db.collection('precios').doc(id)));
    await batch.commit();
    mostrarAlerta(ids.length + ' producto' + (ids.length !== 1 ? 's' : '') + ' eliminado' + (ids.length !== 1 ? 's' : ''), 'success');
    deseleccionarTodo();
    cargarPrecios();
  } catch (err) {
    console.error(err);
    mostrarAlerta('Error al eliminar', 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// =============================================
// ACTUALIZAR COSTOS DE UNA MARCA COMPLETA
// =============================================
function abrirModalActualizarMarca(marca) {
  marcaActualizar = marca;
  const el = document.getElementById('upd-marca-nombre');
  if (el) el.textContent = marca;
  const inp = document.getElementById('upd-porcentaje');
  if (inp) inp.value = '';
  const prev = document.getElementById('upd-preview');
  if (prev) prev.innerHTML = '';
  abrirModal('modal-actualizar-marca');
}

function previewActualizarMarca() {
  const pct      = parseFloat(document.getElementById('upd-porcentaje').value) || 0;
  const productos = preciosCache.filter(p => (p.bloque || p.marca) === marcaActualizar);
  const preview   = document.getElementById('upd-preview');
  if (!pct || !productos.length) { if (preview) preview.innerHTML = ''; return; }
  preview.innerHTML =
    '<table class="tabla-precios" style="margin-top:12px;min-width:0"><thead><tr>' +
    '<th>Producto</th><th>Costo actual</th><th>Costo nuevo</th><th>Min. nuevo</th><th>May. nuevo</th>' +
    '</tr></thead><tbody>' +
    productos.map(p => {
      const nc  = Math.round(p.costo * (1 + pct / 100));
      const nm  = Math.round(nc * (1 + (p.margenMinorista || 0) / 100));
      const nma = Math.round(nc * (1 + (p.margenMayorista || 0) / 100));
      return '<tr><td>' + p.nombre + '</td><td>' + formatPrecio(p.costo) + '</td>' +
             '<td class="margen-ok"><strong>' + formatPrecio(nc) + '</strong></td>' +
             '<td>' + formatPrecio(nm) + '</td><td>' + formatPrecio(nma) + '</td></tr>';
    }).join('') +
    '</tbody></table>';
}

async function confirmarActualizarMarca() {
  const pct = parseFloat(document.getElementById('upd-porcentaje').value);
  if (!pct || isNaN(pct)) { mostrarAlerta('Ingresá un porcentaje válido', 'warning'); return; }
  const productos = preciosCache.filter(p => (p.bloque || p.marca) === marcaActualizar);
  const btn = document.getElementById('btn-confirmar-marca');
  if (btn) btn.disabled = true;
  try {
    const batch = db.batch();
    for (const p of productos) {
      const nc  = Math.round(p.costo * (1 + pct / 100));
      const nm  = Math.round(nc * (1 + (p.margenMinorista || 0) / 100));
      const nma = Math.round(nc * (1 + (p.margenMayorista || 0) / 100));
      batch.update(db.collection('precios').doc(p.id), {
        costo: nc, precioMinorista: nm, precioMayorista: nma,
        ultimaActualizacion: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
    await batch.commit();
    mostrarAlerta('✅ ' + productos.length + ' productos de ' + marcaActualizar + ' actualizados (+' + pct + '%)', 'success');
    cerrarModal('modal-actualizar-marca');
    cargarPrecios();
  } catch (err) {
    console.error(err);
    mostrarAlerta('Error al actualizar la marca', 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// =============================================
// BÚSQUEDA / FILTRO
// =============================================
function filtrarPrecios() {
  renderLista(preciosCache);
}

// =============================================
// TOGGLE VISTA INTERNA / CLIENTE
// =============================================
function setVista(v) {
  vistaActual = v;
  const btnI = document.getElementById('btn-vista-interna');
  const btnC = document.getElementById('btn-vista-cliente');
  if (btnI) { btnI.className = v === 'interna' ? 'activo-interna' : ''; }
  if (btnC) { btnC.className = v === 'cliente' ? 'activo-cliente' : ''; }

  const leyenda = document.getElementById('leyenda-margenes');
  const nota    = document.getElementById('nota-cliente-bar');
  const busq    = document.getElementById('buscador-p');
  const hayBusq = busq && busq.value.length > 0;

  if (leyenda) leyenda.style.display = (v === 'interna' && !hayBusq) ? 'flex' : 'none';
  if (nota)    nota.classList.toggle('visible', v === 'cliente');

  renderLista(preciosCache);
}

// =============================================
// RENDER VISTA CLIENTE (tabla sin costo ni %)
// =============================================
function renderBloqueMarcaCliente(marca, productos) {
  const ordenados = [...productos].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
  const total     = productos.length;
  const isMobile  = window.innerWidth < 769;
  const marcaEsc  = marca.replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const cabecera = `
    <div class="bloque-marca">
      <div class="marca-header" onclick="toggleMarca(this)">
        <div class="marca-titulo">
          <span class="marca-icono">▸</span>
          <strong>${marca}</strong>
          <span class="marca-badge">${total} producto${total !== 1 ? 's' : ''}</span>
        </div>
        <button class="btn btn-sm" style="background:#25d366;color:white;border-color:#25d366;flex-shrink:0"
          onclick="event.stopPropagation(); compartirMarcaWA('${marcaEsc}')" title="WhatsApp">
          📲 WA
        </button>
      </div>
      <div class="marca-contenido" style="display:none">`;
  const cierre = `</div></div>`;

  if (isMobile) {
    // Mobile: tarjetas sin botones de edición ni margen
    const cards = ordenados.map(p => `
      <div style="background:#1e293b;border:1px solid #1e3a5f;border-radius:10px;padding:12px 14px;margin:0 10px 8px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
          <div style="flex:1;min-width:0">
            <div style="color:#fff;font-weight:700;font-size:14px;margin-bottom:4px">${p.nombre}</div>
            <div style="display:flex;gap:5px;flex-wrap:wrap">
              ${p.especie   ? `<span style="background:#374151;color:#d1d5db;padding:1px 7px;border-radius:5px;font-size:11px;font-weight:600">${p.especie}</span>` : ''}
              ${p.unidadPeso ? `<span style="background:#0f172a;color:#4ade80;padding:1px 7px;border-radius:5px;font-size:11px;font-weight:600">${p.unidadPeso}</span>` : ''}
            </div>
          </div>
          <div style="text-align:right;flex-shrink:0;margin-left:10px">
            <div style="font-size:18px;font-weight:900;color:#4ade80;line-height:1.1">${formatPrecio(p.precioMinorista)}</div>
            <div style="font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase">Minorista</div>
          </div>
        </div>
        ${p.precioMayorista > 0 ? `
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <span style="background:#0f172a;color:#94a3b8;padding:2px 9px;border-radius:5px;font-size:12px">Mayorista: ${formatPrecio(p.precioMayorista)}</span>
        </div>` : ''}
      </div>`).join('');
    return cabecera + cards + cierre;
  }

  // Desktop: tabla sin costo, sin %, sin checkbox, sin acciones
  const filas = ordenados.map(p => `
    <tr>
      <td data-label="Producto">${p.nombre}</td>
      <td data-label="Especie"><span class="tag tag-${p.especie}">${p.especie || '-'}</span></td>
      <td data-label="Peso">${p.unidadPeso || '-'}</td>
      <td data-label="Minorista">${formatPrecio(p.precioMinorista)}</td>
      <td data-label="Mayorista">${formatPrecio(p.precioMayorista)}</td>
    </tr>`).join('');

  return cabecera + `
    <table class="tabla-precios" style="min-width:420px">
      <thead>
        <tr>
          <th>Producto</th><th>Especie</th><th>Peso</th><th>Minorista</th><th>Mayorista</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>` + cierre;
}

// =============================================
// HELPER: LISTA FILTRADA PARA EXPORTAR
// =============================================
function _getListaFiltrada() {
  const filtroEspecie = document.getElementById('filtro-especie-p')?.value || '';
  const textoBusq     = normalizar(document.getElementById('buscador-p')?.value || '');
  return preciosCache.filter(p => {
    const okEspecie = !filtroEspecie || p.especie === filtroEspecie;
    const okTexto   = !textoBusq || normalizar(`${p.marca} ${p.nombre}`).includes(textoBusq);
    return okEspecie && okTexto;
  }).sort((a, b) => a.marca.localeCompare(b.marca) || (a.nombre || '').localeCompare(b.nombre || ''));
}

// =============================================
// EXPORTAR PDF — dos columnas gatos | perros (landscape A4, ~3-4 páginas)
// =============================================
function exportarPDF() {
  try {
    if (!window.jspdf) { mostrarAlerta('Librería PDF cargando, intentá en un segundo', 'warning'); return; }
    var jsPDF = window.jspdf.jsPDF;
    var esCliente = vistaActual === 'cliente';
    var doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    var fecha = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });

    doc.setFontSize(12); doc.setTextColor(30, 41, 59);
    doc.text(esCliente ? 'Lista de Precios — Pet Stock' : 'Lista de Precios Interna — Pet Stock', 10, 11);
    doc.setFontSize(7.5); doc.setTextColor(100, 116, 139);
    doc.text('Fecha: ' + fecha, 10, 17);

    var lista = _getListaFiltrada();

    // Agrupar por bloque, luego por especie
    var porBloque = {};
    lista.forEach(function(p) {
      var b = p.bloque || p.marca;
      if (!porBloque[b]) porBloque[b] = { gatos: [], perros: [] };
      if (p.especie === 'gatos' || p.especie === 'ambos') porBloque[b].gatos.push(p);
      if (p.especie === 'perros' || p.especie === 'ambos') porBloque[b].perros.push(p);
    });

    var bloqueOrdenados = Object.keys(porBloque).sort(function(a, b) {
      var ia = ORDEN_BLOQUES.indexOf(a), ib = ORDEN_BLOQUES.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1; if (ib === -1) return -1; return ia - ib;
    });

    // Columnas: cliente = 4+4, interna = 5+5 (con separador central)
    var numCols = esCliente ? 9 : 11;
    var headRow = esCliente
      ? [
          { content: '🐱  GATOS', colSpan: 4, styles: { halign: 'center', fillColor: [45, 26, 60], textColor: [255,255,255] } },
          { content: '', styles: { fillColor: [30,30,30] } },
          { content: '🐶  PERROS', colSpan: 4, styles: { halign: 'center', fillColor: [20, 40, 80], textColor: [255,255,255] } }
        ]
      : [
          { content: '🐱  GATOS', colSpan: 5, styles: { halign: 'center', fillColor: [45, 26, 60], textColor: [255,255,255] } },
          { content: '', styles: { fillColor: [30,30,30] } },
          { content: '🐶  PERROS', colSpan: 5, styles: { halign: 'center', fillColor: [20, 40, 80], textColor: [255,255,255] } }
        ];
    var subHead = esCliente
      ? ['Producto', 'Peso', 'Minorista', 'Mayorista', '', 'Producto', 'Peso', 'Minorista', 'Mayorista']
      : ['Producto', 'Peso', 'Costo', 'Minorista', '% Min.', '', 'Producto', 'Peso', 'Costo', 'Minorista', '% Min.'];

    var body = [];
    var SEP_STYLE = { fillColor: [50, 50, 50] };

    bloqueOrdenados.forEach(function(bloque) {
      var g = porBloque[bloque].gatos;
      var p = porBloque[bloque].perros;
      if (!g.length && !p.length) return;
      // Fila separadora de bloque (span total)
      body.push([{ content: bloque, colSpan: numCols,
        styles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 6.5,
                  cellPadding: { top: 2, bottom: 2, left: 4, right: 4 } } }]);
      var maxLen = Math.max(g.length, p.length);
      for (var i = 0; i < maxLen; i++) {
        var gi = g[i], pi = p[i];
        var mGMin = gi && gi.costo > 0 && gi.precioMinorista > 0 ? Math.round(((gi.precioMinorista - gi.costo) / gi.costo) * 100) + '%' : '—';
        var mPMin = pi && pi.costo > 0 && pi.precioMinorista > 0 ? Math.round(((pi.precioMinorista - pi.costo) / pi.costo) * 100) + '%' : '—';
        if (esCliente) {
          body.push([
            gi ? gi.nombre : '', gi ? gi.unidadPeso || '-' : '', gi ? formatPrecio(gi.precioMinorista) : '', gi ? formatPrecio(gi.precioMayorista) : '',
            { content: '', styles: SEP_STYLE },
            pi ? pi.nombre : '', pi ? pi.unidadPeso || '-' : '', pi ? formatPrecio(pi.precioMinorista) : '', pi ? formatPrecio(pi.precioMayorista) : ''
          ]);
        } else {
          body.push([
            gi ? gi.nombre : '', gi ? gi.unidadPeso || '-' : '', gi ? formatPrecio(gi.costo) : '', gi ? formatPrecio(gi.precioMinorista) : '', mGMin,
            { content: '', styles: SEP_STYLE },
            pi ? pi.nombre : '', pi ? pi.unidadPeso || '-' : '', pi ? formatPrecio(pi.costo) : '', pi ? formatPrecio(pi.precioMinorista) : '', mPMin
          ]);
        }
      }
    });

    // Anchos de columna (landscape A4 = 277mm útiles)
    var colStyles = esCliente
      ? { 0:{cellWidth:60}, 1:{cellWidth:11}, 2:{cellWidth:24}, 3:{cellWidth:24}, 4:{cellWidth:3,fillColor:[220,220,220]}, 5:{cellWidth:60}, 6:{cellWidth:11}, 7:{cellWidth:24}, 8:{cellWidth:24} }
      : { 0:{cellWidth:51}, 1:{cellWidth:10}, 2:{cellWidth:18}, 3:{cellWidth:20}, 4:{cellWidth:13}, 5:{cellWidth:3,fillColor:[220,220,220]}, 6:{cellWidth:51}, 7:{cellWidth:10}, 8:{cellWidth:18}, 9:{cellWidth:20}, 10:{cellWidth:13} };

    doc.autoTable({
      startY: 20,
      head: [headRow, subHead],
      body: body,
      styles:             { fontSize: 6, cellPadding: 0.9, overflow: 'ellipsize' },
      headStyles:         { fillColor: [51, 65, 85], textColor: [255, 255, 255], fontSize: 6.5, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles:       colStyles,
      margin:             { left: 10, right: 10, top: 10 },
    });

    doc.save('precios-' + (esCliente ? 'cliente' : 'interna') + '-' + fecha.replace(/\//g, '-') + '.pdf');
    mostrarAlerta('\u2705 PDF descargado', 'success');
  } catch (err) { console.error(err); mostrarAlerta('Error al generar el PDF', 'error'); }
}


// =============================================
// EXPORTAR EXCEL — hoja con bloques separados
// =============================================
function exportarExcel() {
  try {
    if (!window.XLSX) { mostrarAlerta('Librería Excel cargando, intentá en un segundo', 'warning'); return; }
    const esCliente = vistaActual === 'cliente';
    const lista     = _getListaFiltrada();
    const porBloque = {};
    lista.forEach(p => { const b = p.bloque || p.marca; if (!porBloque[b]) porBloque[b] = []; porBloque[b].push(p); });

    const bloqueOrdenados = Object.keys(porBloque).sort((a, b) => {
      const ia = ORDEN_BLOQUES.indexOf(a), ib = ORDEN_BLOQUES.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1; if (ib === -1) return -1;
      return ia - ib;
    });

    const headers = esCliente
      ? ['Producto', 'Especie', 'Peso', 'Precio Minorista', 'Precio Mayorista']
      : ['Producto', 'Especie', 'Peso', 'Costo', 'Precio Minorista', '% Margen Min.', 'Precio Mayorista', '% Margen May.'];

    const filas = [];

    bloqueOrdenados.forEach(bloque => {
      // Fila de título del bloque
      filas.push([bloque]);
      // Encabezados de columna
      filas.push(headers);
      // Productos
      porBloque[bloque].forEach(p => {
        const mMin = p.costo > 0 && p.precioMinorista > 0
          ? Math.round(((p.precioMinorista - p.costo) / p.costo) * 100) : 0;
        const mMay = p.costo > 0 && p.precioMayorista > 0
          ? Math.round(((p.precioMayorista - p.costo) / p.costo) * 100) : 0;
        filas.push(esCliente
          ? [p.nombre, p.especie || '', p.unidadPeso || '', p.precioMinorista || 0, p.precioMayorista || 0]
          : [p.nombre, p.especie || '', p.unidadPeso || '', p.costo || 0, p.precioMinorista || 0, mMin, p.precioMayorista || 0, mMay]);
      });
      // Fila vacía separadora
      filas.push([]);
    });

    const ws = XLSX.utils.aoa_to_sheet(filas);
    ws['!cols'] = esCliente
      ? [{ wch: 45 }, { wch: 10 }, { wch: 8 }, { wch: 18 }, { wch: 18 }]
      : [{ wch: 45 }, { wch: 10 }, { wch: 8 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 14 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, esCliente ? 'Lista Cliente' : 'Lista Interna');

    const fecha = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
    XLSX.writeFile(wb, 'precios-' + (esCliente ? 'cliente' : 'interna') + '-' + fecha + '.xlsx');
    mostrarAlerta('\u2705 Excel descargado', 'success');
  } catch (err) {
    console.error(err);
    mostrarAlerta('Error al generar el Excel', 'error');
  }
}

// =============================================
// HELPER: LISTA FILTRADA PARA EXPORTAR
// =============================================
function _getListaFiltrada() {
  const filtroEspecie = document.getElementById('filtro-especie-p')?.value || '';
  const textoBusq     = normalizar(document.getElementById('buscador-p')?.value || '');
  return preciosCache.filter(p => {
    const okEspecie = !filtroEspecie || p.especie === filtroEspecie;
    const okTexto   = !textoBusq || normalizar(`${p.marca} ${p.nombre}`).includes(textoBusq);
    return okEspecie && okTexto;
  }).sort((a, b) => a.marca.localeCompare(b.marca) || (a.nombre || '').localeCompare(b.nombre || ''));
}

// =============================================

// =============================================
// COMPARTIR MARCA POR WHATSAPP
// =============================================
function compartirMarcaWA(bloque) {
  var filtroEspecie = (document.getElementById('filtro-especie-p') || {}).value || '';
  var esCliente     = vistaActual === 'cliente';

  var productos = preciosCache
    .filter(function(p) {
      var okBloque  = (p.bloque || p.marca) === bloque;
      var okEspecie = !filtroEspecie || p.especie === filtroEspecie || p.especie === 'ambos';
      return okBloque && okEspecie;
    })
    .sort(function(a, b) { return (a.nombre || '').localeCompare(b.nombre || ''); });

  if (productos.length === 0) {
    mostrarAlerta('No hay productos para compartir con el filtro activo', 'warning');
    return;
  }

  var fecha       = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  var especieTag  = filtroEspecie === 'perros' ? ' 🐶 Perros' : filtroEspecie === 'gatos' ? ' 🐱 Gatos' : ' 🐾';
  var texto       = '*' + bloque + '*' + especieTag + '\nPet Stock · ' + fecha + '\n────────────────\n';

  productos.forEach(function(p) {
    var peso  = p.unidadPeso ? ' ' + p.unidadPeso : '';
    var linea = '• ' + p.nombre + peso + '\n';
    if (esCliente) {
      linea += '  Min: ' + formatPrecio(p.precioMinorista) + '\n';
    } else {
      linea += '  Min: ' + formatPrecio(p.precioMinorista);
      if (p.precioMayorista > 0) linea += ' / May: ' + formatPrecio(p.precioMayorista);
      linea += '\n';
    }
    texto += linea;
  });

  var url = 'https://wa.me/?text=' + encodeURIComponent(texto);
  window.open(url, '_blank');
}

// INIT
// =============================================
function _initPrecios() {
  cargarPrecios();
  document.getElementById('form-nuevo-precio')?.addEventListener('submit', agregarPrecio);
  document.getElementById('buscador-p')?.addEventListener('input', filtrarPrecios);
  document.getElementById('filtro-especie-p')?.addEventListener('change', filtrarPrecios);
  ['np-costo','np-precio-min','np-precio-may'].forEach(function(id) {
    document.getElementById(id)?.addEventListener('input', calcularPreviewNuevo);
  });
  document.getElementById('upd-porcentaje')?.addEventListener('input', previewActualizarMarca);
  ['epm-costo','epm-precio-min','epm-precio-may'].forEach(function(id) {
    document.getElementById(id)?.addEventListener('input', recalcularModal);
  });
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _initPrecios);
} else {
  _initPrecios();
}