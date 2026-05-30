// =============================================
// accesorios.js  —  Módulo Accesorios / Farmacia
// Soporta productos simples Y productos con variantes (padre-hijo)
// =============================================
// Estructura Firestore:
//   accesorios/{id}
//     SIMPLE:   nombre, marca, categoria, costo, precioVenta, stock, creadoEn
//     PADRE:    nombre, marca, categoria, tieneVariantes:true, creadoEn
//   accesorios/{padreId}/variantes/{id}
//     nombre_variante, costo, precioVenta, stock, padreId
// =============================================

// ---- ESTADO LOCAL ----
let accesoriosCache = [];   // productos simples + padres expandidos
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
    // Sin orderBy para evitar requerir índice compuesto en Firestore — ordenamos en JS
    const snap = await db.collection('accesorios').get();
    const items = [];

    for (const doc of snap.docs) {
      try {
        const data = { id: doc.id, ...doc.data() };

        if (data.tieneVariantes) {
          // ── Fila PADRE primero ──────────────────────────────
          items.push({
            id:             doc.id,
            _esPadre:       true,
            _esVariante:    false,
            nombre:         data.nombre || '(sin nombre)',
            marca:          data.marca || '',
            categoria:      data.categoria || 'otro',
            tieneVariantes: true
          });

          // ── Luego las VARIANTES hijas ───────────────────────
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
                nombre:          `${data.nombre} — ${v.nombre_variante || ''}`,
                marca:           data.marca || '',
                categoria:       data.categoria || 'otro',
                costo:           v.costo || 0,
                precioVenta:     v.precioVenta || 0,
                stock:           v.stock || 0,
                nombre_variante: v.nombre_variante || ''
              });
            });
          } catch (errVar) {
            console.warn(`No se pudieron cargar variantes del doc ${doc.id}:`, errVar);
          }

        } else {
          // ── Producto SIMPLE ─────────────────────────────────
          items.push({
            ...data,
            _esPadre:    false,
            _esVariante: false,
            nombre:      data.nombre || '(sin nombre)',
            categoria:   data.categoria || 'otro',
            stock:       data.stock || 0,
            costo:       data.costo || 0,
            precioVenta: data.precioVenta || 0
          });
        }

      } catch (errDoc) {
        console.warn(`Error procesando doc ${doc.id}, se omite:`, errDoc);
      }
    }

    // Ordenar por categoría en JS (evita índice Firestore)
    items.sort((a, b) => (a.categoria || '').localeCompare(b.categoria || ''));

    accesoriosCache = items;
    renderTablaAccesorios(accesoriosCache);
    actualizarResumen(accesoriosCache);

  } catch (err) {
    console.error('Error cargando accesorios:', err);
    // Mostrar error en tabla en lugar de dejarla en "Cargando..."
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="7" class="sin-datos" style="color:var(--rojo)">
        ⚠️ Error al cargar. Revisá tu conexión y recargá la página.
      </td></tr>`;
    }
    mostrarAlerta('Error al cargar accesorios', 'error');
  }
}

function renderTablaAccesorios(lista) {
  const tbody = document.getElementById('tbody-accesorios');
  if (!tbody) return;

  if (lista.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="sin-datos">No hay productos cargados todavía</td></tr>';
    return;
  }

  tbody.innerHTML = lista.map(a => {

    // ---- Fila PADRE (encabezado visual de grupo) ----
    if (a._esPadre) {
      return `
        <tr style="background:var(--verde-claro,#e8f5e9)">
          <td data-label="Categoría">${CATEGORIAS[a.categoria] || a.categoria}</td>
          <td data-label="Nombre" colspan="3">
            <strong>📦 ${a.nombre}</strong>
            <small style="color:#666;margin-left:6px">con variantes</small>
          </td>
          <td data-label="Precio venta">—</td>
          <td data-label="Stock">—</td>
          <td class="acciones">
            <button class="btn btn-sm btn-gris" onclick="abrirModalEditarPadre('${a.id}')">Editar</button>
          </td>
        </tr>`;
    }

    // ---- Fila VARIANTE ----
    if (a._esVariante) {
      const stockClase = a.stock <= 2 ? 'stock-bajo' : a.stock <= 8 ? 'stock-medio' : 'stock-ok';
      const ganancia   = a.precioVenta - a.costo;
      const margen     = a.costo > 0 ? Math.round((ganancia / a.costo) * 100) : 0;
      return `
        <tr style="background:#fafafa">
          <td data-label="Categoría" style="padding-left:24px;color:#888;font-size:12px">↳ variante</td>
          <td data-label="Nombre" style="padding-left:24px">${a.nombre_variante}</td>
          <td data-label="Marca">${a.marca || '-'}</td>
          <td data-label="Costo">${formatPrecio(a.costo)}</td>
          <td data-label="Precio venta">${formatPrecio(a.precioVenta)}
            <small style="color:#888"> (+${margen}%)</small>
          </td>
          <td data-label="Stock" class="${stockClase}"><strong>${a.stock ?? 0}</strong></td>
          <td class="acciones">
            <button class="btn btn-sm btn-verde" onclick="abrirModalSumarStockVariante('${a.padreId}','${a.id}')">+ Stock</button>
            <button class="btn btn-sm btn-azul"  onclick="abrirModalVentaVariante('${a.padreId}','${a.id}')">Vender</button>
            <button class="btn btn-sm btn-gris"  onclick="abrirModalEditarVariante('${a.padreId}','${a.id}')">Editar</button>
          </td>
        </tr>`;
    }

    // ---- Fila SIMPLE ----
    const stockClase = a.stock <= 2 ? 'stock-bajo' : a.stock <= 8 ? 'stock-medio' : 'stock-ok';
    const ganancia   = a.precioVenta - a.costo;
    const margen     = a.costo > 0 ? Math.round((ganancia / a.costo) * 100) : 0;
    return `
      <tr>
        <td data-label="Categoría">${CATEGORIAS[a.categoria] || a.categoria}</td>
        <td data-label="Nombre">${a.nombre}</td>
        <td data-label="Marca">${a.marca || '-'}</td>
        <td data-label="Costo">${formatPrecio(a.costo)}</td>
        <td data-label="Precio venta">${formatPrecio(a.precioVenta)}
          <small style="color:#888"> (+${margen}%)</small>
        </td>
        <td data-label="Stock" class="${stockClase}"><strong>${a.stock ?? 0}</strong></td>
        <td class="acciones">
          <button class="btn btn-sm btn-verde" onclick="abrirModalSumarStock('${a.id}')">+ Stock</button>
          <button class="btn btn-sm btn-azul"  onclick="abrirModalVentaAcc('${a.id}')">Vender</button>
          <button class="btn btn-sm btn-gris"  onclick="abrirModalEditarAcc('${a.id}')">Editar</button>
        </td>
      </tr>`;
  }).join('');
}

function actualizarResumen(lista) {
  // Solo contar items que tienen stock propio (simples o variantes)
  const items     = lista.filter(a => !a._esPadre);
  const totalItems  = items.length;
  const sinStock    = items.filter(a => (a.stock ?? 0) <= 0).length;
  const valorTotal  = items.reduce((s, a) => s + (a.costo * (a.stock || 0)), 0);

  if (document.getElementById('res-total-items'))
    document.getElementById('res-total-items').textContent = totalItems;
  if (document.getElementById('res-sin-stock'))
    document.getElementById('res-sin-stock').textContent = sinStock;
  if (document.getElementById('res-valor'))
    document.getElementById('res-valor').textContent = formatPrecio(valorTotal);
}

// =============================================
// AGREGAR PRODUCTO NUEVO (simple o con variantes)
// =============================================

// -- Toggle del switch de variantes en el formulario --
function toggleVariantes() {
  const check         = document.getElementById('acc-tiene-variantes');
  const camposSimples = document.getElementById('campos-simples');
  const camposVar     = document.getElementById('campos-variantes');

  if (check.checked) {
    camposSimples.style.display = 'none';
    camposVar.style.display     = 'block';
  } else {
    camposSimples.style.display = 'block';
    camposVar.style.display     = 'none';
  }
}

// -- Agregar renglón de variante en el formulario --
function agregarRenglonVariante() {
  const contenedor = document.getElementById('variantes-lista');
  const idx        = contenedor.children.length;
  const div        = document.createElement('div');
  div.className    = 'variante-renglon';
  div.style.cssText = 'border:1px solid #ddd;border-radius:8px;padding:10px;margin-bottom:8px;position:relative';
  div.innerHTML = `
    <button type="button" onclick="this.parentElement.remove()"
      style="position:absolute;top:6px;right:8px;background:none;border:none;font-size:18px;cursor:pointer;color:#c00">×</button>
    <div class="form-fila">
      <div class="form-grupo">
        <label>Variante *</label>
        <input type="text" class="var-nombre" placeholder="Ej: 4-10kg" required>
      </div>
      <div class="form-grupo">
        <label>Costo ($)</label>
        <input type="number" class="var-costo" min="0" step="0.01" placeholder="0">
      </div>
      <div class="form-grupo">
        <label>Precio venta ($)</label>
        <input type="number" class="var-precio" min="0" step="0.01" placeholder="0">
      </div>
      <div class="form-grupo">
        <label>Stock</label>
        <input type="number" class="var-stock" min="0" value="0">
      </div>
    </div>`;
  contenedor.appendChild(div);
}

async function agregarAccesorio(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;

  const nombre    = document.getElementById('acc-nombre').value.trim();
  const marca     = document.getElementById('acc-marca').value.trim();
  const categoria = document.getElementById('acc-categoria').value;
  const tieneVar  = document.getElementById('acc-tiene-variantes').checked;

  if (!nombre || !categoria) {
    mostrarAlerta('Completá nombre y categoría', 'warning');
    btn.disabled = false;
    return;
  }

  try {
    if (tieneVar) {
      // ---- GUARDAR PADRE ----
      const renglones = document.querySelectorAll('#variantes-lista .variante-renglon');
      if (renglones.length === 0) {
        mostrarAlerta('Agregá al menos una variante', 'warning');
        btn.disabled = false;
        return;
      }

      // Validar que todos los renglones tengan nombre
      for (const r of renglones) {
        if (!r.querySelector('.var-nombre').value.trim()) {
          mostrarAlerta('Completá el nombre de todas las variantes', 'warning');
          btn.disabled = false;
          return;
        }
      }

      const padreRef = await db.collection('accesorios').add({
        nombre,
        marca,
        categoria,
        tieneVariantes: true,
        creadoEn: firebase.firestore.FieldValue.serverTimestamp()
      });

      // ---- GUARDAR HIJOS ----
      const batch = db.batch();
      renglones.forEach(r => {
        const varRef = db.collection('accesorios').doc(padreRef.id)
          .collection('variantes').doc();
        batch.set(varRef, {
          padreId:        padreRef.id,
          nombre_variante: r.querySelector('.var-nombre').value.trim(),
          costo:           parseFloat(r.querySelector('.var-costo').value) || 0,
          precioVenta:     parseFloat(r.querySelector('.var-precio').value) || 0,
          stock:           parseInt(r.querySelector('.var-stock').value) || 0
        });
      });
      await batch.commit();
      mostrarAlerta(`"${nombre}" con variantes guardado`, 'success');

    } else {
      // ---- GUARDAR PRODUCTO SIMPLE ----
      await db.collection('accesorios').add({
        nombre,
        marca,
        categoria,
        costo:       parseFloat(document.getElementById('acc-costo').value) || 0,
        precioVenta: parseFloat(document.getElementById('acc-precio').value) || 0,
        stock:       parseInt(document.getElementById('acc-stock').value) || 0,
        creadoEn:    firebase.firestore.FieldValue.serverTimestamp()
      });
      mostrarAlerta(`"${nombre}" agregado correctamente`, 'success');
    }

    cerrarModal('modal-acc-nuevo');
    e.target.reset();
    // Limpiar renglones de variantes
    document.getElementById('variantes-lista').innerHTML = '';
    document.getElementById('campos-simples').style.display = 'block';
    document.getElementById('campos-variantes').style.display = 'none';
    document.getElementById('acc-tiene-variantes').checked = false;
    cargarAccesorios();

  } catch (err) {
    console.error(err);
    mostrarAlerta('Error al guardar', 'error');
  } finally {
    btn.disabled = false;
  }
}

// =============================================
// SUMAR STOCK — PRODUCTO SIMPLE
// =============================================
function abrirModalSumarStock(id) {
  accSeleccionadoId = id;
  const acc = accesoriosCache.find(a => a.id === id);
  document.getElementById('sum-acc-nombre').textContent  = acc ? acc.nombre : '';
  document.getElementById('sum-stock-actual').textContent = acc ? acc.stock : 0;
  document.getElementById('sum-cantidad').value = '';
  // Guardamos si es variante
  document.getElementById('modal-sumar-stock').dataset.padreId = '';
  abrirModal('modal-sumar-stock');
}

// SUMAR STOCK — VARIANTE
function abrirModalSumarStockVariante(padreId, varId) {
  accSeleccionadoId = varId;
  const acc = accesoriosCache.find(a => a.id === varId && a._esVariante);
  document.getElementById('sum-acc-nombre').textContent  = acc ? acc.nombre : '';
  document.getElementById('sum-stock-actual').textContent = acc ? acc.stock : 0;
  document.getElementById('sum-cantidad').value = '';
  document.getElementById('modal-sumar-stock').dataset.padreId = padreId;
  abrirModal('modal-sumar-stock');
}

async function sumarStock(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;

  const cantidad = parseInt(document.getElementById('sum-cantidad').value);
  if (!cantidad || cantidad <= 0) {
    mostrarAlerta('Ingresá una cantidad válida', 'warning');
    btn.disabled = false;
    return;
  }

  const padreId = document.getElementById('modal-sumar-stock').dataset.padreId;

  try {
    if (padreId) {
      // Es variante
      await db.collection('accesorios').doc(padreId)
        .collection('variantes').doc(accSeleccionadoId)
        .update({ stock: firebase.firestore.FieldValue.increment(cantidad) });
    } else {
      await db.collection('accesorios').doc(accSeleccionadoId)
        .update({ stock: firebase.firestore.FieldValue.increment(cantidad) });
    }
    mostrarAlerta(`+${cantidad} unidades sumadas`, 'success');
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
// REGISTRAR VENTA — PRODUCTO SIMPLE
// =============================================
function abrirModalVentaAcc(id) {
  accSeleccionadoId = id;
  const acc = accesoriosCache.find(a => a.id === id);
  document.getElementById('vacc-nombre').textContent     = acc ? acc.nombre : '';
  document.getElementById('vacc-stock-disp').textContent = acc ? acc.stock : 0;
  document.getElementById('vacc-precio').value           = acc ? acc.precioVenta : '';
  document.getElementById('vacc-cantidad').value         = '';
  document.getElementById('vacc-cliente').value          = '';
  document.getElementById('modal-venta-acc').dataset.padreId = '';
  abrirModal('modal-venta-acc');
}

// REGISTRAR VENTA — VARIANTE
function abrirModalVentaVariante(padreId, varId) {
  accSeleccionadoId = varId;
  const acc = accesoriosCache.find(a => a.id === varId && a._esVariante);
  document.getElementById('vacc-nombre').textContent     = acc ? acc.nombre : '';
  document.getElementById('vacc-stock-disp').textContent = acc ? acc.stock : 0;
  document.getElementById('vacc-precio').value           = acc ? acc.precioVenta : '';
  document.getElementById('vacc-cantidad').value         = '';
  document.getElementById('vacc-cliente').value          = '';
  document.getElementById('modal-venta-acc').dataset.padreId = padreId;
  abrirModal('modal-venta-acc');
}

async function registrarVentaAccesorio(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;

  const cantidad    = parseInt(document.getElementById('vacc-cantidad').value);
  const precioVenta = parseFloat(document.getElementById('vacc-precio').value);
  const cliente     = document.getElementById('vacc-cliente').value.trim();
  const padreId     = document.getElementById('modal-venta-acc').dataset.padreId;

  const acc = accesoriosCache.find(a => a.id === accSeleccionadoId);

  if (!cantidad || cantidad <= 0 || !precioVenta) {
    mostrarAlerta('Completá cantidad y precio', 'warning');
    btn.disabled = false;
    return;
  }
  if (!acc || acc.stock < cantidad) {
    mostrarAlerta('Stock insuficiente', 'error');
    btn.disabled = false;
    return;
  }

  const ganancia = (precioVenta - acc.costo) * cantidad;

  try {
    const batch = db.batch();

    // Descontar stock según si es variante o simple
    if (padreId) {
      const varRef = db.collection('accesorios').doc(padreId)
        .collection('variantes').doc(accSeleccionadoId);
      batch.update(varRef, { stock: firebase.firestore.FieldValue.increment(-cantidad) });
    } else {
      const accRef = db.collection('accesorios').doc(accSeleccionadoId);
      batch.update(accRef, { stock: firebase.firestore.FieldValue.increment(-cantidad) });
    }

    // Registrar en ventas generales
    const ventaRef = db.collection('ventas').doc();
    batch.set(ventaRef, {
      tipo:           'accesorio',
      productoId:     accSeleccionadoId,
      nombreProducto: acc.nombre,
      categoria:      acc.categoria,
      cantidad,
      precioVenta,
      totalVenta:     precioVenta * cantidad,
      costo:          acc.costo * cantidad,
      ganancia,
      cliente:        cliente || '-',
      fecha:          firebase.firestore.FieldValue.serverTimestamp()
    });

    await batch.commit();
    mostrarAlerta(`Venta registrada. Ganancia: ${formatPrecio(ganancia)}`, 'success');
    cerrarModal('modal-venta-acc');
    cargarAccesorios();
  } catch (err) {
    console.error(err);
    mostrarAlerta('Error al registrar la venta', 'error');
  } finally {
    btn.disabled = false;
  }
}

// =============================================
// EDITAR — PRODUCTO SIMPLE
// =============================================
function abrirModalEditarAcc(id) {
  accSeleccionadoId = id;
  const acc = accesoriosCache.find(a => a.id === id);
  if (!acc) return;
  document.getElementById('edit-nombre').value    = acc.nombre;
  document.getElementById('edit-marca').value     = acc.marca || '';
  document.getElementById('edit-categoria').value = acc.categoria;
  document.getElementById('edit-costo').value     = acc.costo;
  document.getElementById('edit-precio').value    = acc.precioVenta;
  document.getElementById('modal-editar-acc').dataset.padreId = '';
  abrirModal('modal-editar-acc');
}

// EDITAR — VARIANTE
function abrirModalEditarVariante(padreId, varId) {
  accSeleccionadoId = varId;
  const acc = accesoriosCache.find(a => a.id === varId && a._esVariante);
  if (!acc) return;
  document.getElementById('edit-nombre').value    = acc.nombre_variante;
  document.getElementById('edit-marca').value     = acc.marca || '';
  document.getElementById('edit-categoria').value = acc.categoria;
  document.getElementById('edit-costo').value     = acc.costo;
  document.getElementById('edit-precio').value    = acc.precioVenta;
  document.getElementById('modal-editar-acc').dataset.padreId = padreId;
  abrirModal('modal-editar-acc');
}

// EDITAR — PADRE (solo nombre/marca/categoría)
function abrirModalEditarPadre(id) {
  accSeleccionadoId = id;
  const acc = accesoriosCache.find(a => a.id === id && a._esPadre);
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
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;

  const padreId = document.getElementById('modal-editar-acc').dataset.padreId;

  try {
    if (padreId === 'PADRE') {
      // Editar doc padre (nombre/marca/categoria solamente)
      await db.collection('accesorios').doc(accSeleccionadoId).update({
        nombre:    document.getElementById('edit-nombre').value.trim(),
        marca:     document.getElementById('edit-marca').value.trim(),
        categoria: document.getElementById('edit-categoria').value
      });
    } else if (padreId) {
      // Editar variante
      await db.collection('accesorios').doc(padreId)
        .collection('variantes').doc(accSeleccionadoId).update({
          nombre_variante: document.getElementById('edit-nombre').value.trim(),
          costo:           parseFloat(document.getElementById('edit-costo').value) || 0,
          precioVenta:     parseFloat(document.getElementById('edit-precio').value) || 0
        });
    } else {
      // Editar producto simple
      await db.collection('accesorios').doc(accSeleccionadoId).update({
        nombre:      document.getElementById('edit-nombre').value.trim(),
        marca:       document.getElementById('edit-marca').value.trim(),
        categoria:   document.getElementById('edit-categoria').value,
        costo:       parseFloat(document.getElementById('edit-costo').value) || 0,
        precioVenta: parseFloat(document.getElementById('edit-precio').value) || 0
      });
    }

    mostrarAlerta('Producto actualizado', 'success');
    cerrarModal('modal-editar-acc');
    cargarAccesorio