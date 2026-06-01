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
let preciosCache    = [];
let precioEditId    = '';   // producto en edición inline
let marcaActualizar = ''; // marca en modal de aumento masivo
let productoAEliminar = null; // { id, nombre } para el modal de confirmación

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
        <div class="fr-min">${minStr}</div>
        <span class="fr-chevron">▾</span>
      </div>
      <div class="fr-detalle">
        <div class="fr-det-item">
          <span>Mayorista</span>
          <strong>${mayStr}</strong>
        </div>
        ${mMin > 0 ? `<div class="fr-det-item"><span>% Min.</span><strong>${mMin}%</strong></div>` : ''}
        ${mMay > 0 ? `<div class="fr-det-item"><span>% May.</span><strong>${mMay}%</strong></div>` : ''}
        ${p.costo > 0 ? `<div class="fr-det-item"><span>Costo</span><strong>${formatPrecio(p.costo)}</strong></div>` : ''}
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

// ---- Render agrupado por marca ----
function renderLista(lista) {
  const filtroEspecie = document.getElementById('filtro-especie-p')?.value || '';
  const textoBusq     = normalizar(document.getElementById('buscador-p')?.value || '');

  const filtrada = lista.filter(p => {
    const okEspecie = !filtroEspecie || p.especie === filtroEspecie;
    const okTexto   = !textoBusq || normalizar(`${p.marca} ${p.nombre}`).includes(textoBusq);
    return okEspecie && okTexto;
  });

  // Con texto de búsqueda → vista compacta de resultados
  if (textoBusq) {
    renderListaCompacta(filtrada);
    return;
  }

  // Agrupar por marca
  const porMarca = {};
  for (const p of filtrada) {
    if (!porMarca[p.marca]) porMarca[p.marca] = [];
    porMarca[p.marca].push(p);
  }

  const contenedor = document.getElementById('contenedor-precios');
  if (!contenedor) return;

  if (filtrada.length === 0) {
    contenedor.innerHTML = '<p class="sin-datos" style="padding:32px;text-align:center">No hay productos en la lista</p>';
    return;
  }

  contenedor.innerHTML = Object.entries(porMarca)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([marca, productos]) => renderBloqueMarca(marca, productos))
    .join('');
}

function renderBloqueMarca(marca, productos) {
  const ordenados = [...productos].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
  const marcaEsc  = marca.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const total     = productos.length;
  const isMobile  = window.innerWidth < 769;

  const cabecera = `
    <div class="bloque-marca">
      <div class="marca-header" onclick="toggleMarca(this)">
        <div class="marca-titulo">
          <span class="marca-icono">▾</span>
          <strong>${marca}</strong>
          <span class="marca-badge">${total} producto${total !== 1 ? 's' : ''}</span>
        </div>
        <button class="btn btn-sm btn-naranja"
          onclick="event.stopPropagation(); abrirModalActualizarMarca('${marcaEsc}')">
          📈 ${isMobile ? 'Costos' : 'Actualizar costos'}
        </button>
      </div>
      <div class="marca-contenido">`;

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
            <input type="checkbox" class="check-all-marca" data-marca="${marcaEsc}"
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

  // Desktop → edición inline en la fila
  if (precioEditId && precioEditId !== id) cerrarEdicionInline(precioEditId);
  precioEditId = id;
  const p = preciosCache.find(x => x.id === id);
  if (!p) return;

  const fila = document.getElementById('fila-' + id);
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
    p