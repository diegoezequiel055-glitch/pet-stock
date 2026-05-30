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
function renderTablaAccesorios(lista) {
  const tbody = document.getElementById('tbody-accesorios');
  if (!tbody) return;

  if (lista.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="sin-datos">No hay productos cargados todavía</td></tr>';
    return;
  }

  tbody.innerHTML = lista.map(function(a) {

    // Fila PADRE
    if (a._esPadre) {
      return '<tr style="background:var(--verde-claro,#e8f5e9)">' +
        '<td data-label="Categoría">' + (CATEGORIAS[a.categoria] || a.categoria) + '</td>' +
        '<td data-label="Nombre" colspan="3"><strong>📦 ' + a.nombre + '</strong>' +
          '<small style="color:#666;margin-left:6px">con variantes</small></td>' +
        '<td data-label="Precio venta">—</td>' +
        '<td data-label="Stock">—</td>' +
        '<td class="acciones">' +
          '<button class="btn btn-sm btn-gris" onclick="abrirModalEditarPadre(\'' + a.id + '\')">Editar</button>' +
        '</td>' +
        '</tr>';
    }

    // Fila VARIANTE
    if (a._esVariante) {
      var stockClaseV = a.stock <= 2 ? 'stock-bajo' : a.stock <= 8 ? 'stock-medio' : 'stock-ok';
      var gananciaV   = a.precioVenta - a.costo;
      var margenV     = a.costo > 0 ? Math.round((gananciaV / a.costo) * 100) : 0;
      return '<tr style="background:#fafafa">' +
        '<td data-label="Categoría" style="padding-left:24px;color:#888;font-size:12px">↳ variante</td>' +
        '<td data-label="Nombre" style="padding-left:24px">' + a.nombre_variante + '</td>' +
        '<td data-label="Marca">' + (a.marca || '-') + '</td>' +
        '<td data-label="Costo">' + formatPrecio(a.costo) + '</td>' +
        '<td data-label="Precio venta">' + formatPrecio(a.precioVenta) +
          '<small style="color:#888"> (+' + margenV + '%)</small></td>' +
        '<td data-label="Stock" class="' + stockClaseV + '"><strong>' + (a.stock || 0) + '</strong></td>' +
        '<td class="acciones">' +
          '<button class="btn btn-sm btn-verde" onclick="abrirModalSumarStockVariante(\'' + a.padreId + '\',\'' + a.id + '\')">+ Stock</button> ' +
          '<button class="btn btn-sm btn-gris"  onclick="abrirModalEditarVariante(\'' + a.padreId + '\',\'' + a.id + '\')">Editar</button>' +
        '</td>' +
        '</tr>';
    }

    // Fila SIMPLE
    var stockClase = a.stock <= 2 ? 'stock-bajo' : a.stock <= 8 ? 'stock-medio' : 'stock-ok';
    var ganancia   = a.precioVenta - a.costo;
    var margen     = a.costo > 0 ? Math.round((ganancia / a.costo) * 100) : 0;
    return '<tr>' +
      '<td data-label="Categoría">' + (CATEGORIAS[a.categoria] || a.categoria) + '</td>' +
      '<td data-label="Nombre">' + a.nombre + '</td>' +
      '<td data-label="Marca">' + (a.marca || '-') + '</td>' +
      '<td data-label="Costo">' + formatPrecio(a.costo) + '</td>' +
      '<td data-label="Precio venta">' + formatPrecio(a.precioVenta) +
        '<small style="color:#888"> (+' + margen + '%)</small></td>' +
      '<td data-label="Stock" class="' + stockClase + '"><strong>' + (a.stock || 0) + '</strong></td>' +
      '<td class="acciones">' +
        '<button class="btn btn-sm btn-verde" onclick="abrirModalSumarStock(\'' + a.id + '\')">+ Stock</button> ' +
        '<button class="btn btn-sm btn-gris"  onclick="abrirModalEditarAcc(\'' + a.id + '\')">Editar</button>' +
      '</td>' +
      '</tr>';

  }).join('');
}

// =============================================
// RESUMEN
// =============================================
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

    mostrarAlerta('Producto actualizado', 'success');
    cerrarModal('modal-editar-acc');
    cargarAccesorios();

  } catch (err) {
    console.error(err);
    mostrarAlerta('Error al actualizar', 'error');
  } finally {
    btn.disabled = false;
  }
}

// =============================================
// BÚSQUEDA / FILTRO
// =============================================
function filtrarAccesorios() {
  var texto     = normalizar(document.getElementById('buscador-acc').value);
  var categoria = document.getElementById('filtro-categoria').value;

  var filtrados = accesoriosCache.filter(function(a) {
    var coincideTexto = !texto || normalizar(a.nombre + ' ' + (a.marca || '')).includes(texto);
    var coincideCat   = !categoria || a.categoria === categoria;
    return coincideTexto && coincideCat;
  });

  renderTablaAccesorios(filtrados);
}

// =============================================
// INIT
// =============================================
document.addEventListener('DOMContentLoaded', function() {
  cargarAccesorios();

  var formNuevo  = document.getElementById('form-acc-nuevo');
  var formStock  = document.getElementById('form-sumar-stock');
  var formEditar = document.getElementById('form-editar-acc');

  if (formNuevo)  formNuevo.addEventListener('submit',  agregarAccesorio);
  if (formStock)  formStock.addEventListener('submit',  sumarStock);
  if (formEditar) formEditar.addEventListener('submit', guardarEdicionAcc);

  var buscador  = document.getElementById('buscador-acc');
  var filtroCat = document.getElementById('filtro-categoria');

  if (buscador)  buscador.addEventListener('input',   filtrarAccesorios);
  if (filtroCat) filtroCat.addEventListener('change', filtrarAccesorios);
});
