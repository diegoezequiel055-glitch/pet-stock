// =============================================
// stock-bolsas.js — v23
// Stock de bolsas con agrupación por marca
// =============================================

let productosCache = [];
let productoSeleccionadoId = '';

// =============================================
// CARGAR Y MOSTRAR
// =============================================
async function cargarProductos() {
  var contenedor = document.getElementById('tbody-productos');
  try {
    var snap = await db.collection('productos').get();
    productosCache = snap.docs.map(function(doc) {
      return Object.assign({ id: doc.id }, doc.data());
    });
    productosCache.sort(function(a, b) {
      return (a.marca || '').localeCompare(b.marca || '');
    });
    renderTablaProductos(productosCache);
  } catch (err) {
    console.error('Error cargarProductos:', err);
    if (contenedor) {
      contenedor.innerHTML = '<p style="color:#ef4444;text-align:center;padding:24px">⚠️ Error al cargar: ' + (err.message || 'revisá tu conexión') + '</p>';
    }
    mostrarAlerta('Error al cargar productos', 'error');
  }
}

// =============================================
// TOGGLES
// =============================================
function toggleMarcaPanel(header) {
  var panel = header.nextElementSibling;
  var arrow = header.querySelector('.tw-marca-arrow');
  var cerrado = panel.style.display === 'none' || panel.style.display === '';
  panel.style.display = cerrado ? 'block' : 'none';
  header.style.borderRadius = cerrado ? '10px 10px 0 0' : '10px';
  header.style.borderBottom = cerrado ? 'none' : '1px solid #1e3a5f';
  if (arrow) {
    arrow.innerHTML = cerrado ? '&#9660;' : '&#9658;';
    arrow.style.color = cerrado ? '#4ade80' : '#64748b';
  }
}

function toggleSubPanel(header) {
  var panel = header.nextElementSibling;
  var arrow = header.querySelector('.tw-sub-arrow');
  var cerrado = panel.style.display === 'none' || panel.style.display === '';
  panel.style.display = cerrado ? 'block' : 'none';
  if (arrow) arrow.style.transform = cerrado ? 'rotate(180deg)' : '';
  header.style.background = cerrado ? '#162032' : '#1e293b';
}

// =============================================
// RENDER — DOBLE ACORDEÓN POR MARCA
// =============================================
function renderTablaProductos(lista) {
  var contenedor = document.getElementById('tbody-productos');
  if (!contenedor) return;
  if (lista.length === 0) {
    contenedor.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:24px">No hay productos cargados</p>';
    return;
  }

  // Agrupar por marca
  var grupos = {};
  lista.forEach(function(p) {
    var m = p.marca || 'Sin marca';
    if (!grupos[m]) grupos[m] = [];
    grupos[m].push(p);
  });

  var marcas = Object.keys(grupos).sort(function(a, b) { return a.localeCompare(b); });

  contenedor.innerHTML = marcas.map(function(marca) {
    var prods = grupos[marca];
    var totalStock = prods.reduce(function(s, p) { return s + (p.stockTotal || 0); }, 0);
    var totalColor = totalStock <= 5 ? '#ef4444' : totalStock <= 20 ? '#f97316' : '#4ade80';

    var productosHTML = prods.map(function(p) {
      var stock  = p.stockTotal != null ? p.stockTotal : 0;
      var minimo = p.stockMinimo || 0;
      var stockBajo  = minimo > 0 && stock > 0 && stock < minimo;
      var stockColor = stock === 0 ? '#ef4444' : stockBajo ? '#fb923c' : '#4ade80';
      var bajoBadge  = stockBajo
        ? ' <span style="background:#431407;color:#fb923c;font-size:9px;font-weight:700;padding:1px 6px;border-radius:3px">⚡ bajo</span>'
        : '';
      var espBadge = p.especie
        ? '<span style="background:#374151;color:#d1d5db;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:600">' + p.especie + '</span>'
        : '';
      var pesoBadge = p.unidadPeso
        ? '<span style="background:#0f172a;color:#4ade80;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:600;border:1px solid #334155">' + p.unidadPeso + '</span>'
        : '';
      var costoStr = p.ultimoCosto
        ? '<span style="color:#64748b;font-size:10px">Costo: ' + formatPrecio(p.ultimoCosto) + '</span>'
        : '';
      var safeNombre = (p.marca + ' ' + p.nombre).replace(/'/g, "&#39;");

      return '<div style="border-bottom:1px solid #1e3a5f">'
        + '<div style="display:flex;align-items:center;justify-content:space-between;padding:9px 14px;cursor:pointer;background:#1e293b;transition:background .12s" onclick="toggleSubPanel(this)">'
          + '<div style="flex:1;min-width:0">'
            + '<div style="color:#e2e8f0;font-size:13px;font-weight:600;margin-bottom:4px">' + (p.nombre || '') + bajoBadge + '</div>'
            + '<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">'
              + espBadge + pesoBadge + costoStr
            + '</div>'
          + '</div>'
          + '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0">'
            + '<div style="text-align:center;background:#0f172a;border:1px solid #334155;padding:3px 8px;border-radius:6px;min-width:40px">'
              + '<div style="font-size:8px;color:#64748b;text-transform:uppercase;letter-spacing:.4px">Stock</div>'
              + '<div style="font-size:17px;font-weight:900;color:' + stockColor + ';line-height:1.1">' + stock + '</div>'
            + '</div>'
            + '<span class="tw-sub-arrow" style="font-size:11px;color:#475569;transition:transform .2s">&#9660;</span>'
          + '</div>'
        + '</div>'
        + '<div style="display:none;background:#0d1625;padding:10px 14px;border-top:1px solid #0f172a">'
          + '<div style="display:flex;gap:6px;flex-wrap:wrap">'
            + '<button style="flex:1;min-width:70px;padding:7px 8px;background:#15803d;color:#dcfce7;border:none;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer" onclick="abrirModalLote(\'' + p.id + '\')">+ Lote</button>'
            + '<button style="flex:1;min-width:70px;padding:7px 8px;background:#1d4ed8;color:#dbeafe;border:none;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer" onclick="verLotes(\'' + p.id + '\')">📋 Lotes</button>'
            + '<button style="flex:1;min-width:70px;padding:7px 8px;background:#c2410c;color:#ffedd5;border:none;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer" onclick="abrirModalAjuste(\'' + p.id + '\')">± Ajuste</button>'
            + '<button style="padding:7px 11px;background:#334155;color:#cbd5e1;border:none;border-radius:7px;font-size:13px;cursor:pointer" onclick="abrirModalEditarProducto(\'' + p.id + '\')" title="Editar producto">✏️</button>'
            + '<button style="padding:7px 11px;background:#7f1d1d;color:#fca5a5;border:none;border-radius:7px;font-size:13px;cursor:pointer" onclick="eliminarProducto(\'' + p.id + '\',\'' + safeNombre + '\')" title="Eliminar producto">🗑️</button>'
          + '</div>'
        + '</div>'
      + '</div>';
    }).join('');

    return '<div style="margin-bottom:8px;border-radius:10px;overflow:hidden">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;padding:11px 14px;background:#162032;border:1px solid #1e3a5f;border-radius:10px;cursor:pointer" onclick="toggleMarcaPanel(this)">'
        + '<div style="display:flex;align-items:center;gap:8px">'
          + '<span class="tw-marca-arrow" style="font-size:12px;color:#64748b">&#9658;</span>'
          + '<span style="color:#f1f5f9;font-size:14px;font-weight:700">' + marca + '</span>'
          + '<span style="background:#334155;color:#94a3b8;font-size:11px;padding:1px 8px;border-radius:10px">' + prods.length + ' prod.</span>'
        + '</div>'
        + '<span style="color:#64748b;font-size:11px;flex-shrink:0">Stock: <strong style="color:' + totalColor + '">' + totalStock + '</strong></span>'
      + '</div>'
      + '<div style="display:none;border:1px solid #1e3a5f;border-top:none;border-radius:0 0 10px 10px;overflow:hidden">'
        + productosHTML
      + '</div>'
    + '</div>';
  }).join('');
}

// =============================================
// AGREGAR PRODUCTO
// =============================================
async function agregarProducto(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  const data = {
    nombre:      document.getElementById('prod-nombre').value.trim(),
    marca:       document.getElementById('prod-marca').value.trim(),
    especie:     document.getElementById('prod-especie').value,
    unidadPeso:  document.getElementById('prod-peso').value.trim(),
    stockTotal:  0,
    ultimoCosto: 0,
    creadoEn:    firebase.firestore.FieldValue.serverTimestamp()
  };
  if (!data.nombre || !data.marca) {
    mostrarAlerta('Completá nombre y marca', 'warning');
    btn.disabled = false;
    return;
  }
  try {
    await db.collection('productos').add(data);
    mostrarAlerta('Producto "' + data.nombre + '" creado', 'success');
    cerrarModal('modal-producto');
    e.target.reset();
    cargarProductos();
  } catch (err) {
    console.error(err);
    mostrarAlerta('Error al guardar el producto', 'error');
  } finally {
    btn.disabled = false;
  }
}

// =============================================
// AGREGAR LOTE
// =============================================
function abrirModalLote(productoId) {
  productoSeleccionadoId = productoId;
  const prod = productosCache.find(p => p.id === productoId);
  document.getElementById('lote-prod-nombre').textContent = prod ? prod.marca + ' - ' + prod.nombre : '';
  document.getElementById('lote-fecha').value = hoyISO();
  document.getElementById('form-lote').reset();
  document.getElementById('lote-fecha').value = hoyISO();
  abrirModal('modal-lote');
}

async function agregarLote(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  const cantidad  = parseInt(document.getElementById('lote-cantidad').value);
  const costo     = parseFloat(document.getElementById('lote-costo').value);
  const fecha     = document.getElementById('lote-fecha').value;
  const proveedor = document.getElementById('lote-proveedor').value.trim();
  const notas     = document.getElementById('lote-notas').value.trim();
  if (!cantidad || cantidad <= 0 || !costo || costo <= 0 || !fecha) {
    mostrarAlerta('Completá cantidad, costo y fecha', 'warning');
    btn.disabled = false;
    return;
  }
  const loteData = {
    fechaCompra:      firebase.firestore.Timestamp.fromDate(new Date(fecha + 'T12:00:00')),
    cantidadInicial:  cantidad,
    cantidadRestante: cantidad,
    costoUnitario:    costo,
    proveedor:        proveedor || '-',
    notas:            notas || '',
    creadoEn:         firebase.firestore.FieldValue.serverTimestamp()
  };
  try {
    const ref = db.collection('productos').doc(productoSeleccionadoId);
    await db.runTransaction(async (t) => {
      const doc = await t.get(ref);
      const loteRef = ref.collection('lotes').doc();
      t.set(loteRef, loteData);
      t.update(ref, { stockTotal: (doc.data().stockTotal || 0) + cantidad, ultimoCosto: costo });
    });
    mostrarAlerta('Lote de ' + cantidad + ' unidades cargado', 'success');
    cerrarModal('modal-lote');
    cargarProductos();
  } catch (err) {
    console.error(err);
    mostrarAlerta('Error al guardar el lote', 'error');
  } finally {
    btn.disabled = false;
  }
}

// =============================================
// VER LOTES
// =============================================
async function verLotes(productoId) {
  productoSeleccionadoId = productoId;
  const prod = productosCache.find(p => p.id === productoId);
  document.getElementById('lotes-prod-nombre').textContent = prod ? prod.marca + ' - ' + prod.nombre : '';
  try {
    const snap = await db.collection('productos').doc(productoId)
      .collection('lotes').orderBy('fechaCompra', 'asc').get();
    const tbody = document.getElementById('tbody-lotes');
    if (snap.empty) {
      tbody.innerHTML = '<tr><td colspan="6" class="sin-datos">Sin lotes cargados</td></tr>';
    } else {
      tbody.innerHTML = snap.docs.map(doc => {
        const l = doc.data();
        const agotado = l.cantidadRestante === 0;
        return '<tr class="' + (agotado ? 'lote-agotado' : '') + '">'
          + '<td data-label="Fecha">' + formatFecha(l.fechaCompra) + '</td>'
          + '<td data-label="Stock">' + l.cantidadRestante + ' / ' + l.cantidadInicial + '</td>'
          + '<td data-label="Costo unit.">' + formatPrecio(l.costoUnitario) + '</td>'
          + '<td data-label="Valor total">' + formatPrecio(l.costoUnitario * l.cantidadRestante) + '</td>'
          + '<td data-label="Proveedor">' + l.proveedor + '</td>'
          + '<td><button onclick="eliminarLote(\'' + productoId + '\',\'' + doc.id + '\',' + l.cantidadRestante + ')" style="background:none;border:none;font-size:18px;cursor:pointer;color:#ef4444">🗑️</button></td>'
          + '</tr>';
      }).join('');
    }
    abrirModal('modal-ver-lotes');
  } catch (err) {
    console.error(err);
    mostrarAlerta('Error al cargar los lotes', 'error');
  }
}

// =============================================
// ELIMINAR LOTE
// =============================================
async function eliminarLote(productoId, loteId, cantidadRestante) {
  if (!confirm('¿Eliminar este lote? Se descontarán ' + cantidadRestante + ' unidades del stock total.')) return;
  try {
    const ref = db.collection('productos').doc(productoId);
    await db.runTransaction(async (t) => {
      t.delete(ref.collection('lotes').doc(loteId));
      t.update(ref, { stockTotal: firebase.firestore.FieldValue.increment(-cantidadRestante) });
    });
    mostrarAlerta('Lote eliminado', 'success');
    verLotes(productoId);
    cargarProductos();
  } catch (err) {
    console.error(err);
    mostrarAlerta('Error al eliminar el lote', 'error');
  }
}

// =============================================
// FILTRAR
// =============================================
function filtrarProductos() {
  const texto   = normalizar(document.getElementById('buscador').value);
  const especie = document.getElementById('filtro-especie').value;
  const filtrados = productosCache.filter(p => {
    const coincideTexto   = !texto || normalizar(p.nombre + ' ' + p.marca).includes(texto);
    const coincideEspecie = !especie || p.especie === especie;
    return coincideTexto && coincideEspecie;
  });
  renderTablaProductos(filtrados);
}

// =============================================
// EDITAR PRODUCTO
// =============================================
function abrirModalEditarProducto(id) {
  productoSeleccionadoId = id;
  var p = productosCache.find(x => x.id === id);
  if (!p) return;
  document.getElementById('edit-prod-marca').value    = p.marca || '';
  document.getElementById('edit-prod-nombre').value   = p.nombre || '';
  document.getElementById('edit-prod-peso').value     = p.unidadPeso || '';
  document.getElementById('edit-prod-minimo').value   = p.stockMinimo || '';
  abrirModal('modal-editar-producto');
}

async function guardarEdicionProducto(e) {
  e.preventDefault();
  var btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    var minimoVal = parseInt(document.getElementById('edit-prod-minimo').value, 10);
    await db.collection('productos').doc(productoSeleccionadoId).update({
      marca:       document.getElementById('edit-prod-marca').value.trim(),
      nombre:      document.getElementById('edit-prod-nombre').value.trim(),
      unidadPeso:  document.getElementById('edit-prod-peso').value.trim(),
      stockMinimo: isNaN(minimoVal) ? 0 : minimoVal
    });
    mostrarAlerta('Producto actualizado', 'success');
    cerrarModal('modal-editar-producto');
    cargarProductos();
  } catch (err) {
    console.error(err);
    mostrarAlerta('Error al guardar', 'error');
  } finally {
    btn.disabled = false;
  }
}

// =============================================
// ELIMINAR PRODUCTO
// =============================================
async function eliminarProducto(id, nombre) {
  if (!confirm('¿Eliminar "' + nombre + '"? Se eliminarán también todos sus lotes.')) return;
  try {
    var lotesSnap = await db.collection('productos').doc(id).collection('lotes').get();
    var batch = db.batch();
    lotesSnap.docs.forEach(d => batch.delete(d.ref));
    batch.delete(db.collection('productos').doc(id));
    await batch.commit();
    mostrarAlerta('"' + nombre + '" eliminado', 'success');
    cargarProductos();
  } catch (err) {
    console.error(err);
    mostrarAlerta('Error al eliminar', 'error');
  }
}

// =============================================
// AJUSTE MANUAL
// =============================================
function abrirModalAjuste(productoId) {
  productoSeleccionadoId = productoId;
  var prod = productosCache.find(p => p.id === productoId);
  if (!prod) return;
  document.getElementById('ajuste-prod-nombre').textContent = prod.marca + ' — ' + prod.nombre;
  document.getElementById('ajuste-stock-actual').textContent = 'Stock actual: ' + (prod.stockTotal || 0) + ' unidades';
  document.getElementById('form-ajuste').reset();
  abrirModal('modal-ajuste');
}

async function confirmarAjuste(e) {
  e.preventDefault();
  var btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  var cantidad = parseInt(document.getElementById('ajuste-cantidad').value);
  var motivo   = document.getElementById('ajuste-motivo').value.trim() || 'Ajuste manual';
  if (!cantidad || cantidad === 0) {
    mostrarAlerta('Ingresá una cantidad distinta de 0', 'warning');
    btn.disabled = false;
    return;
  }
  var prod = productosCache.find(p => p.id === productoSeleccionadoId);
  if (!prod) { btn.disabled = false; return; }
  var stockActual = prod.stockTotal || 0;
  if (cantidad < 0 && Math.abs(cantidad) > stockActual) {
    mostrarAlerta('No podés descontar más que el stock actual (' + stockActual + ')', 'error');
    btn.disabled = false;
    return;
  }
  try {
    var ref = db.collection('productos').doc(productoSeleccionadoId);
    if (cantidad > 0) {
      var loteRef = ref.collection('lotes').doc();
      await db.runTransaction(async t => {
        t.set(loteRef, {
          fechaCompra:      firebase.firestore.Timestamp.now(),
          cantidadInicial:  cantidad,
          cantidadRestante: cantidad,
          costoUnitario:    prod.ultimoCosto || 0,
          proveedor:        motivo,
          notas:            'Ajuste manual',
          creadoEn:         firebase.firestore.FieldValue.serverTimestamp()
        });
        t.update(ref, { stockTotal: firebase.firestore.FieldValue.increment(cantidad) });
      });
    } else {
      var cantPorDescontar = Math.abs(cantidad);
      var lotesSnap = await ref.collection('lotes').orderBy('fechaCompra', 'asc').get();
      var lotes = lotesSnap.docs
        .map(d => ({ ref: d.ref, data: d.data() }))
        .filter(l => l.data.cantidadRestante > 0);
      var updates = [];
      for (var i = 0; i < lotes.length && cantPorDescontar > 0; i++) {
        var tomados = Math.min(lotes[i].data.cantidadRestante, cantPorDescontar);
        cantPorDescontar -= tomados;
        updates.push({ ref: lotes[i].ref, nueva: lotes[i].data.cantidadRestante - tomados });
      }
      await db.runTransaction(async t => {
        updates.forEach(u => t.update(u.ref, { cantidadRestante: u.nueva }));
        t.update(ref, { stockTotal: firebase.firestore.FieldValue.increment(cantidad) });
      });
    }
    mostrarAlerta('Stock ajustado: ' + (cantidad > 0 ? '+' : '') + cantidad + ' unidades', 'success');
    cerrarModal('modal-ajuste');
    cargarProductos();
  } catch (err) {
    console.error(err);
    mostrarAlerta('Error al ajustar el stock', 'error');
  } finally {
    btn.disabled = false;
  }
}

// =============================================
// INIT
// =============================================
function _initBolsas() {
  cargarProductos();
  var fp   = document.getElementById('form-producto');
  var fl   = document.getElementById('form-lote');
  var fe   = document.getElementById('form-editar-producto');
  var faj  = document.getElementById('form-ajuste');
  var bus  = document.getElementById('buscador');
  var filt = document.getElementById('filtro-especie');
  if (fp)   fp.addEventListener('submit', agregarProducto);
  if (fl)   fl.addEventListener('submit', agregarLote);
  if (fe)   fe.addEventListener('submit', guardarEdicionProducto);
  if (faj)  faj.addEventListener('submit', confirmarAjuste);
  if (bus)  bus.addEventListener('input', filtrarProductos);
  if (filt) filt.addEventListener('change', filtrarProductos);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _initBolsas);
} else {
  _initBolsas();
}
