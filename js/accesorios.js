// =============================================
// accesorios.js  —  Módulo Accesorios / Farmacia
// Estructura Firestore:
//   accesorios/{id}  → SIMPLE: nombre, marca, categoria, costo, precioVenta, stock
//                    → PADRE:  nombre, marca, categoria, tieneVariantes:true
//   accesorios/{padreId}/variantes/{id} → nombre_variante, costo, precioVenta, stock
// =============================================

let accesoriosCache = [];
let accSeleccionadoId = '';

const CATEGORIAS = {
  accesorio:  '🧸 Accesorio',
  farmacia:   '💊 Farmacia',
  plastico:   '🪣 Plástico',
  colchoneta: '🛏️ Colchoneta',
  higiene:    '🧴 Higiene',
  otro:       '📦 Otro'
};

// =============================================
// CARGAR Y MOSTRAR
// =============================================
async function cargarAccesorios() {
  const tbody = document.getElementById('tbody-accesorios');

  try {
    const snap = await db.collection('accesorios').get();
    const items = [];

    for (const doc of snap.docs) {
      try {
        const data = { id: doc.id, ...doc.data() };

        if (data.tieneVariantes) {
          // Fila PADRE
          items.push({
            id:             doc.id,
            _esPadre:       true,
            _esVariante:    false,
            nombre:         data.nombre || '(sin nombre)',
            marca:          data.marca  || '',
            categoria:      data.categoria || 'otro',
            tieneVariantes: true
          });

          // Variantes hijas
          try {
            const varSnap = await db.collection('accesorios')
              .doc(doc.id).collection('variantes').get();

            varSnap.docs.forEach(vDoc => {
              const v = vDoc.data();
              items.push({
                id:              vDoc.id,
                padreId:         doc.id,
                _esPadre:        false,
                _esVariante:     true,
                nombrePadre:     data.nombre || '',
                nombre:          (data.nombre || '') + ' — ' + (v.nombre_variante || ''),
                marca:           data.marca || '',
                categoria:       data.categoria || 'otro',
                costo:           v.costo       || 0,
                precioVenta:     v.precioVenta || 0,
                stock:           v.stock       || 0,
                nombre_variante: v.nombre_variante || ''
              });
            });
          } catch (errVar) {
            console.warn('No se pudieron cargar variantes del doc ' + doc.id, errVar);
          }

        } else {
          // Producto SIMPLE
          items.push({
            id:          doc.id,
            _esPadre:    false,
            _esVariante: false,
            nombre:      data.nombre   || '(sin nombre)',
            marca:       data.marca    || '',
            categoria:   data.categoria || 'otro',
            costo:       data.costo       || 0,
            precioVenta: data.precioVenta || 0,
            stock:       data.stock       || 0
          });
        }

      } catch (errDoc) {
        console.warn('Error procesando doc ' + doc.id + ', se omite:', errDoc);
      }
    }

    // Ordenar por categoría en JS (sin requerir índice Firestore)
    items.sort(function(a, b) {
      return (a.categoria || '').localeCompare(b.categoria || '');
    });

    accesoriosCache = items;
    renderTablaAccesorios(accesoriosCache);
    actualizarResumen(accesoriosCache);

  } catch (err) {
    console.error('Error cargando accesorios:', err);
    if (tbody) {
      tbody.innerHTML =
        '<tr><td colspan="7" class="sin-datos" style="color:var(--rojo)">' +
        '⚠️ Error al cargar: ' + (err.message || err.code || 'desconocido') +
        '. Revisá tu conexión y recargá la página.' +
        '</td></tr>';
    }
    mostrarAlerta('Error al cargar accesorios', 'error');
  }
}

// =============================================
// RENDER TABLA
// =============================================
function togglePanelAcc(header) {
  var panel = header.nextElementSibling;
  var arrow = header.querySelector('.tw-arrow');
  var cerrado = panel.style.display === 'none' || panel.style.display === '';
  panel.style.display = cerrado ? 'block' : 'none';
  if (arrow) arrow.style.transform = cerrado ? 'rotate(180deg)' : '';
}

function renderTablaAccesorios(lista) {
  var c = document.getElementById('tbody-accesorios');
  if (!c) return;
  if (lista.length === 0) { c.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:24px">No hay productos cargados</p>'; return; }

  var padres  = lista.filter(function(a) { return a._esPadre; });
  var simples = lista.filter(function(a) { return !a._esPadre && !a._esVariante; });
  var getV    = function(pid) { return lista.filter(function(a) { return a._esVariante && a.padreId === pid; }); };
  var ROW = 'display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:#1e293b;border:1px solid #1e3a5f;border-radius:10px;cursor:pointer';
  var PANEL = 'display:none;background:#131c2e;padding:12px 14px;border:1px solid #1e3a5f;border-top:none;border-radius:0 0 10px 10px';
  var BADGE = 'background:#374151;color:#d1d5db;padding:2px 8px;border-radius:5px;font-size:11px;font-weight:600';
  var html = '';

  padres.forEach(function(p) {
    var vars = getV(p.id);
    var nV = vars.length;
    var cat = CATEGORIAS[p.categoria] || p.categoria;
    var varsHtml = vars.map(function(v) {
      var stV = v.stock || 0;
      var scV = stV <= 2 ? '#ef4444' : stV <= 8 ? '#f97316' : '#4ade80';
      var mV  = v.costo > 0 ? Math.round(((v.precioVenta - v.costo) / v.costo) * 100) : 0;
      return '<div style="background:#1e293b;border:1px solid #334155;border-radius:8px;padding:10px 12px;margin-bottom:8px">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">'
          + '<span style="color:#fff;font-weight:700;font-size:13px">' + v.nombre_variante + '</span>'
          + '<span style="font-size:17px;font-weight:900;color:' + scV + '">' + stV + ' u.</span>'
        + '</div>'
        + '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px">'
          + '<span style="' + BADGE + '">Costo: ' + formatPrecio(v.costo) + '</span>'
          + '<span style="' + BADGE + '">Venta: ' + formatPrecio(v.precioVenta) + ' (+' + mV + '%)</span>'
        + '</div>'
        + '<div style="display:flex;gap:6px">'
          + '<button class="btn btn-sm btn-verde" style="flex:1;justify-content:center" onclick="abrirModalSumarStockVariante(\'' + p.id + '\',\'' + v.id + '\')">+ Stock</button>'
          + '<button class="btn btn-sm btn-gris"  style="flex:1;justify-content:center" onclick="abrirModalEditarVariante(\'' + p.id + '\',\'' + v.id + '\')">Editar</button>'
          + '<button class="btn btn-sm btn-rojo"  style="justify-content:center;padding:5px 10px" onclick="eliminarVariante(\'' + p.id + '\',\'' + v.id + '\')" title="Eliminar variante">🗑️</button>'
        + '</div>'
      + '</div>';
    }).join('');
    html += '<div style="margin-bottom:8px;border-radius:10px;overflow:hidden">'
      + '<div style="' + ROW + '" onclick="togglePanelAcc(this)">'
        + '<div style="flex:1;min-width:0">'
          + '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:5px">'
            + '<span style="color:#fff;font-weight:700;font-size:14px">' + p.nombre + '</span>'
            + (p.marca ? '<span style="color:#94a3b8;font-size:13px">' + p.marca + '</span>' : '')
          + '</div>'
          + '<div style="display:flex;gap:5px;flex-wrap:wrap">'
            + '<span style="' + BADGE + '">' + cat + '</span>'
            + '<span style="background:#1e3a5f;color:#93c5fd;padding:2px 8px;border-radius:5px;font-size:11px;font-weight:600">' + nV + ' variante' + (nV!==1?'s':'') + '</span>'
          + '</div>'
        + '</div>'
        + '<span class="tw-arrow" style="font-size:12px;color:#64748b;flex-shrink:0;transition:transform .2s">&#9660;</span>'
      + '</div>'
      + '<div style="' + PANEL + '">'
        + varsHtml
        + '<div style="display:flex;gap:8px;margin-top:4px">'
          + '<button class="btn btn-sm btn-gris" style="flex:1;justify-content:center" onclick="abrirModalEditarPadre(\'' + p.id + '\')">Editar grupo</button>'
          + '<button class="btn btn-sm btn-rojo" style="justify-content:center;padding:5px 10px" onclick="eliminarPadre(\'' + p.id + '\',\'' + p.nombre.replace(/'/g,"&#39;") + '\')" title="Eliminar grupo">🗑️</button>'
        + '</div>'
      + '</div>'
    + '</div>';
  });

  simples.forEach(function(a) {
    var stS = a.stock || 0;
    var scS = stS <= 2 ? '#ef4444' : stS <= 8 ? '#f97316' : '#4ade80';
    var cat = CATEGORIAS[a.categoria] || a.categoria;
    html += '<div style="margin-bottom:8px;border-radius:10px;overflow:hidden">'
      + '<div style="' + ROW + '" onclick="togglePanelAcc(this)">'
        + '<div style="flex:1;min-width:0">'
          + '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:5px">'
            + '<span style="color:#fff;font-weight:700;font-size:14px">' + a.nombre + '</span>'
            + (a.marca ? '<span style="color:#94a3b8;font-size:13px">' + a.marca + '</span>' : '')
          + '</div>'
          + '<div style="display:flex;gap:5px;flex-wrap:wrap">'
            + '<span style="' + BADGE + '">' + cat + '</span>'
            + '<span style="background:#0f172a;color:#4ade80;padding:2px 8px;border-radius:5px;font-size:11px;font-weight:600">' + formatPrecio(a.precioVenta) + '</span>'
          + '</div>'
        + '</div>'
        + '<div style="display:flex;align-items:center;gap:10px;flex-shrink:0">'
          + '<div style="display:flex;flex-direction:column;align-items:center;background:#0f172a;border:1px solid #334155;padding:4px 10px;border-radius:8px;min-width:46px">'
            + '<span style="font-size:9px;color:#94a3b8;font-weight:700;text-transform:uppercase">Stock</span>'
            + '<span style="font-size:18px;font-weight:900;color:' + scS + ';line-height:1.2">' + stS + '</span>'
          + '</div>'
          + '<span class="tw-arrow" style="font-size:12px;color:#64748b;flex-shrink:0;transition:transform .2s">&#9660;</span>'
        + '</div>'
      + '</div>'
      + '<div style="' + PANEL + '">'
        + '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px">'
          + '<span style="' + BADGE + '">Costo: ' + formatPrecio(a.costo) + '</span>'
          + '<span style="' + BADGE + '">Venta: ' + formatPrecio(a.precioVenta) + '</span>'
        + '</div>'
        + '<div style="display:flex;gap:8px">'
          + '<button class="btn btn-sm btn-verde" style="flex:1;justify-content:center" onclick="abrirModalSumarStock(\'' + a.id + '\')">+ Stock</button>'
          + '<button class="btn btn-sm btn-gris"  style="flex:1;justify-content:center" onclick="abrirModalEditarAcc(\'' + a.id + '\')">Editar</button>'
          + '<button class="btn btn-sm btn-rojo" style="justify-content:center;padding:5px 10px" onclick="eliminarSimple(\'' + a.id + '\',\'' + a.nombre.replace(/'/g,"&#39;") + '\')" title="Eliminar">🗑️</button>'
        + '</div>'
      + '</div>'
    + '</div>';
  });

  c.innerHTML = html;
}


function actualizarResumen(lista) {
  var items      = lista.filter(function(a) { return !a._esPadre; });
  var totalItems = items.length;
  var sinStock   = items.filter(function(a) { return (a.stock || 0) <= 0; }).length;
  var valorTotal = items.reduce(function(s, a) { return s + (a.costo * (a.stock || 0)); }, 0);

  var elTotal = document.getElementById('res-total-items');
  var elSin   = document.getElementById('res-sin-stock');
  var elValor = document.getElementById('res-valor');

  if (elTotal) elTotal.textContent = totalItems;
  if (elSin)   elSin.textContent   = sinStock;
  if (elValor) elValor.textContent  = formatPrecio(valorTotal);
}

// =============================================
// AGREGAR PRODUCTO NUEVO
// =============================================
function toggleVariantes() {
  var check   = document.getElementById('acc-tiene-variantes');
  var simples = document.getElementById('campos-simples');
  var varDiv  = document.getElementById('campos-variantes');
  if (check.checked) {
    simples.style.display = 'none';
    varDiv.style.display  = 'block';
  } else {
    simples.style.display = 'block';
    varDiv.style.display  = 'none';
  }
}

function agregarRenglonVariante() {
  var contenedor = document.getElementById('variantes-lista');
  var div = document.createElement('div');
  div.className = 'variante-renglon';
  div.style.cssText = 'border:1px solid #ddd;border-radius:8px;padding:10px;margin-bottom:8px;position:relative';
  div.innerHTML =
    '<button type="button" onclick="this.parentElement.remove()" ' +
      'style="position:absolute;top:6px;right:8px;background:none;border:none;font-size:18px;cursor:pointer;color:#c00">×</button>' +
    '<div class="form-fila">' +
      '<div class="form-grupo"><label>Variante *</label>' +
        '<input type="text" class="var-nombre" placeholder="Ej: 4-10kg" required></div>' +
      '<div class="form-grupo"><label>Costo ($)</label>' +
        '<input type="number" class="var-costo" min="0" step="0.01" placeholder="0"></div>' +
      '<div class="form-grupo"><label>Precio venta ($)</label>' +
        '<input type="number" class="var-precio" min="0" step="0.01" placeholder="0"></div>' +
      '<div class="form-grupo"><label>Stock</label>' +
        '<input type="number" class="var-stock" min="0" value="0"></div>' +
    '</div>';
  contenedor.appendChild(div);
}

async function agregarAccesorio(e) {
  e.preventDefault();
  var btn      = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;

  var nombre    = document.getElementById('acc-nombre').value.trim();
  var marca     = document.getElementById('acc-marca').value.trim();
  var categoria = document.getElementById('acc-categoria').value;
  var tieneVar  = document.getElementById('acc-tiene-variantes').checked;

  if (!nombre || !categoria) {
    mostrarAlerta('Completá nombre y categoría', 'warning');
    btn.disabled = false;
    return;
  }

  try {
    if (tieneVar) {
      var renglones = document.querySelectorAll('#variantes-lista .variante-renglon');
      if (renglones.length === 0) {
        mostrarAlerta('Agregá al menos una variante', 'warning');
        btn.disabled = false;
        return;
      }
      for (var i = 0; i < renglones.length; i++) {
        if (!renglones[i].querySelector('.var-nombre').value.trim()) {
          mostrarAlerta('Completá el nombre de todas las variantes', 'warning');
          btn.disabled = false;
          return;
        }
      }

      var padreRef = await db.collection('accesorios').add({
        nombre:         nombre,
        marca:          marca,
        categoria:      categoria,
        tieneVariantes: true,
        creadoEn:       firebase.firestore.FieldValue.serverTimestamp()
      });

      var batch = db.batch();
      renglones.forEach(function(r) {
        var varRef = db.collection('accesorios').doc(padreRef.id).collection('variantes').doc();
        batch.set(varRef, {
          padreId:         padreRef.id,
          nombre_variante: r.querySelector('.var-nombre').value.trim(),
          costo:           parseFloat(r.querySelector('.var-costo').value)  || 0,
          precioVenta:     parseFloat(r.querySelector('.var-precio').value) || 0,
          stock:           parseInt(r.querySelector('.var-stock').value)    || 0
        });
      });
      await batch.commit();
      mostrarAlerta('"' + nombre + '" con variantes guardado', 'success');

    } else {
      await db.collection('accesorios').add({
        nombre:      nombre,
        marca:       marca,
        categoria:   categoria,
        costo:       parseFloat(document.getElementById('acc-costo').value)  || 0,
        precioVenta: parseFloat(document.getElementById('acc-precio').value) || 0,
        stock:       parseInt(document.getElementById('acc-stock').value)    || 0,
        creadoEn:    firebase.firestore.FieldValue.serverTimestamp()
      });
      mostrarAlerta('"' + nombre + '" agregado correctamente', 'success');
    }

    cerrarModal('modal-acc-nuevo');
    e.target.reset();
    document.getElementById('variantes-lista').innerHTML    = '';
    document.getElementById('campos-simples').style.display = 'block';
    document.getElementById('campos-variantes').style.display = 'none';
    document.getElementById('acc-tiene-variantes').checked  = false;
    cargarAccesorios();

  } catch (err) {
    console.error(err);
    mostrarAlerta('Error al guardar', 'error');
  } finally {
    btn.disabled = false;
  }
}

// =============================================
// SUMAR STOCK
// =============================================
function abrirModalSumarStock(id) {
  accSeleccionadoId = id;
  var acc = accesoriosCache.find(function(a) { return a.id === id; });
  document.getElementById('sum-acc-nombre').textContent   = acc ? acc.nombre : '';
  document.getElementById('sum-stock-actual').textContent = acc ? acc.stock  : 0;
  document.getElementById('sum-cantidad').value = '';
  document.getElementById('modal-sumar-stock').dataset.padreId = '';
  abrirModal('modal-sumar-stock');
}

function abrirModalSumarStockVariante(padreId, varId) {
  accSeleccionadoId = varId;
  var acc = accesoriosCache.find(function(a) { return a.id === varId && a._esVariante; });
  document.getElementById('sum-acc-nombre').textContent   = acc ? acc.nombre : '';
  document.getElementById('sum-stock-actual').textContent = acc ? acc.stock  : 0;
  document.getElementById('sum-cantidad').value = '';
  document.getElementById('modal-sumar-stock').dataset.padreId = padreId;
  abrirModal('modal-sumar-stock');
}

async function sumarStock(e) {
  e.preventDefault();
  var btn      = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;

  var cantidad = parseInt(document.getElementById('sum-cantidad').value);
  if (!cantidad || cantidad <= 0) {
    mostrarAlerta('Ingresá una cantidad válida', 'warning');
    btn.disabled = false;
    return;
  }

  var padreId = document.getElementById('modal-sumar-stock').dataset.padreId;

  try {
    if (padreId) {
      await db.collection('accesorios').doc(padreId)
        .collection('variantes').doc(accSeleccionadoId)
        .update({ stock: firebase.firestore.FieldValue.increment(cantidad) });
    } else {
      await db.collection('accesorios').doc(accSeleccionadoId)
        .update({ stock: firebase.firestore.FieldValue.increment(cantidad) });
    }
    mostrarAlerta('+' + cantidad + ' unidades sumadas', 'success');
    cerrarModal('modal-sumar-stock');
    cargarAccesorios();
  } catch (err) {
    console.error(err);
    mostrarAlerta('Error al actualizar el stock', 'error');
  } finally {
    btn.disabled = false;
  }
}

// =============================================
// EDITAR
// =============================================
function abrirModalEditarAcc(id) {
  accSeleccionadoId = id;
  var acc = accesoriosCache.find(function(a) { return a.id === id; });
  if (!acc) return;
  document.getElementById('edit-nombre').value    = acc.nombre;
  document.getElementById('edit-marca').value     = acc.marca || '';
  document.getElementById('edit-categoria').value = acc.categoria;
  document.getElementById('edit-costo').value     = acc.costo;
  document.getElementById('edit-precio').value    = acc.precioVenta;
  document.getElementById('modal-editar-acc').dataset.padreId = '';
  abrirModal('modal-editar-acc');
}

function abrirModalEditarVariante(padreId, varId) {
  accSeleccionadoId = varId;
  var acc = accesoriosCache.find(function(a) { return a.id === varId && a._esVariante; });
  if (!acc) return;
  document.getElementById('edit-nombre').value    = acc.nombre_variante;
  document.getElementById('edit-marca').value     = acc.marca || '';
  document.getElementById('edit-categoria').value = acc.categoria;
  document.getElementById('edit-costo').value     = acc.costo;
  document.getElementById('edit-precio').value    = acc.precioVenta;
  document.getElementById('modal-editar-acc').dataset.padreId = padreId;
  abrirModal('modal-editar-acc');
}

function abrirModalEditarPadre(id) {
  accSeleccionadoId = id;
  var acc = accesoriosCache.find(function(a) { return a.id === id && a._esPadre; });
  if (!acc) return;
  document.getElementById('edit-nombre').value    = acc.nombre;
  document.getElementById('edit-marca').value     = acc.marca || '';
  document.getElementById('edit-categoria').value = acc.categoria;
  document.getElementById('edit-costo').value     = '';
  document.getElementById('edit-precio').value    = '';
  document.getElementById('modal-editar-acc').dataset.padreId = 'PADRE';
  abrirModal('modal-editar-acc');
}

async function guardarEdicionAcc(e) {
  e.preventDefault();
  var btn      = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;

  var padreId = document.getElementById('modal-editar-acc').dataset.padreId;

  try {
    if (padreId === 'PADRE') {
      await db.collection('accesorios').doc(accSeleccionadoId).update({
        nombre:    document.getElementById('edit-nombre').value.trim(),
        marca:     document.getElementById('edit-marca').value.trim(),
        categoria: document.getElementById('edit-categoria').value
      });

    } else if (padreId) {
      await db.collection('accesorios').doc(padreId)
        .collection('variantes').doc(accSeleccionadoId).update({
          nombre_variante: document.getElementById('edit-nombre').value.trim(),
          costo:           parseFloat(document.getElementById('edit-costo').value)  || 0,
          precioVenta:     parseFloat(document.getElementById('edit-precio').value) || 0
        });

    } else {
      await db.collection('accesorios').doc(accSeleccionadoId).update({
        nombre:      document.getElementById('edit-nombre').value.trim(),
        marca:       document.getElementById('edit-marca').value.trim(),
        categoria:   document.getElementById('edit-categoria').value,
        costo:       parseFloat(document.getElementById('edit-costo').value)  || 0,
        precioVenta: parseFloat(document.getElementById('edit-precio').value) || 0
      });
    }
    mostrarAlerta('Cambios guardados', 'success');
    cerrarModal('modal-editar-acc');
    cargarAccesorios();
  } catch (err) {
    console.error(err);
    mostrarAlerta('Error al guardar cambios', 'error');
  } finally {
    btn.disabled = false;
  }
}

// =============================================
// ELIMINAR
// =============================================
async function eliminarVariante(padreId, varId) {
  if (!confirm('\u00bfEliminar esta variante? No se puede deshacer.')) return;
  try {
    await db.collection('accesorios').doc(padreId)
      .collection('variantes').doc(varId).delete();
    mostrarAlerta('Variante eliminada', 'success');
    cargarAccesorios();
  } catch (err) {
    console.error(err);
    mostrarAlerta('Error al eliminar la variante', 'error');
  }
}

async function eliminarPadre(id, nombre) {
  if (!confirm('\u00bfEliminar el grupo "' + nombre + '" y todas sus variantes? No se puede deshacer.')) return;
  try {
    var varSnap = await db.collection('accesorios').doc(id).collection('variantes').get();
    var batch = db.batch();
    varSnap.docs.forEach(function(d) { batch.delete(d.ref); });
    batch.delete(db.collection('accesorios').doc(id));
    await batch.commit();
    mostrarAlerta('Grupo eliminado', 'success');
    cargarAccesorios();
  } catch (err) {
    console.error(err);
    mostrarAlerta('Error al eliminar el grupo', 'error');
  }
}

async function eliminarSimple(id, nombre) {
  if (!confirm('\u00bfEliminar "' + nombre + '"? No se puede deshacer.')) return;
  try {
    await db.collection('accesorios').doc(id).delete();
    mostrarAlerta('"' + nombre + '" eliminado', 'success');
    cargarAccesorios();
  } catch (err) {
    console.error(err);
    mostrarAlerta('Error al eliminar', 'error');
  }
}

// =============================================
// INIT
// =============================================
document.addEventListener('DOMContentLoaded', function() {
  cargarAccesorios();
  var formNuevo  = document.getElementById('form-acc-nuevo');
  var formEditar = document.getElementById('form-editar-acc');
  var formSumar  = document.getElementById('form-sumar-stock');
  if (formNuevo)  formNuevo.addEventListener('submit',  agregarAccesorio);
  if (formEditar) formEditar.addEventListener('submit', guardarEdicionAcc);
  if (formSumar)  formSumar.addEventListener('submit',  sumarStock);
});
