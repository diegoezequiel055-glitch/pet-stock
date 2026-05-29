// =============================================
// accesorios.js
// Módulo de accesorios, farmacia y otros productos
// =============================================
// Estructura Firestore:
//   accesorios/{id}
//     nombre, categoria, marca, costo,
//     precioVenta, stock, creadoEn

// ---- ESTADO LOCAL ----
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
  try {
    const snap = await db.collection('accesorios')
      .orderBy('categoria')
      .get();

    accesoriosCache = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderTablaAccesorios(accesoriosCache);
    actualizarResumen(accesoriosCache);
  } catch (err) {
    console.error(err);
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
  const totalItems  = lista.length;
  const sinStock    = lista.filter(a => a.stock <= 0).length;
  const valorTotal  = lista.reduce((s, a) => s + (a.costo * (a.stock || 0)), 0);

  document.getElementById('res-total-items')?.setAttribute('data-val', totalItems);
  document.getElementById('res-sin-stock')?.setAttribute('data-val', sinStock);
  document.getElementById('res-valor')?.setAttribute('data-val', formatPrecio(valorTotal));

  if (document.getElementById('res-total-items'))
    document.getElementById('res-total-items').textContent = totalItems;
  if (document.getElementById('res-sin-stock'))
    document.getElementById('res-sin-stock').textContent = sinStock;
  if (document.getElementById('res-valor'))
    document.getElementById('res-valor').textContent = formatPrecio(valorTotal);
}

// =============================================
// AGREGAR PRODUCTO NUEVO
// =============================================
async function agregarAccesorio(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;

  const data = {
    nombre:      document.getElementById('acc-nombre').value.trim(),
    marca:       document.getElementById('acc-marca').value.trim(),
    categoria:   document.getElementById('acc-categoria').value,
    costo:       parseFloat(document.getElementById('acc-costo').value) || 0,
    precioVenta: parseFloat(document.getElementById('acc-precio').value) || 0,
    stock:       parseInt(document.getElementById('acc-stock').value) || 0,
    creadoEn:    firebase.firestore.FieldValue.serverTimestamp()
  };

  if (!data.nombre || !data.categoria) {
    mostrarAlerta('Completá nombre y categoría', 'warning');
    btn.disabled = false;
    return;
  }

  try {
    await db.collection('accesorios').add(data);
    mostrarAlerta(`"${data.nombre}" agregado correctamente`, 'success');
    cerrarModal('modal-acc-nuevo');
    e.target.reset();
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
  const acc = accesoriosCache.find(a => a.id === id);
  document.getElementById('sum-acc-nombre').textContent = acc ? acc.nombre : '';
  document.getElementById('sum-stock-actual').textContent = acc ? acc.stock : 0;
  document.getElementById('sum-cantidad').value = '';
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

  try {
    await db.collection('accesorios').doc(accSeleccionadoId).update({
      stock: firebase.firestore.FieldValue.increment(cantidad)
    });
    mostrarAlerta(`+${cantidad} unidades sumadas al stock`, 'success');
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
// REGISTRAR VENTA DE ACCESORIO
// =============================================
function abrirModalVentaAcc(id) {
  accSeleccionadoId = id;
  const acc = accesoriosCache.find(a => a.id === id);
  document.getElementById('vacc-nombre').textContent    = acc ? acc.nombre : '';
  document.getElementById('vacc-stock-disp').textContent = acc ? acc.stock : 0;
  // Prellenar con precio de venta actual
  document.getElementById('vacc-precio').value = acc ? acc.precioVenta : '';
  document.getElementById('vacc-cantidad').value = '';
  document.getElementById('vacc-cliente').value  = '';
  abrirModal('modal-venta-acc');
}

async function registrarVentaAccesorio(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;

  const cantidad    = parseInt(document.getElementById('vacc-cantidad').value);
  const precioVenta = parseFloat(document.getElementById('vacc-precio').value);
  const cliente     = document.getElementById('vacc-cliente').value.trim();

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

    // Descontar stock
    const accRef = db.collection('accesorios').doc(accSeleccionadoId);
    batch.update(accRef, { stock: firebase.firestore.FieldValue.increment(-cantidad) });

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

    mostrarAlerta(
      `Venta registrada. Ganancia: ${formatPrecio(ganancia)}`,
      'success'
    );
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
// EDITAR PRODUCTO (precio / costo)
// =============================================
function abrirModalEditarAcc(id) {
  accSeleccionadoId = id;
  const acc = accesoriosCache.find(a => a.id === id);
  if (!acc) return;
  document.getElementById('edit-nombre').value      = acc.nombre;
  document.getElementById('edit-marca').value       = acc.marca || '';
  document.getElementById('edit-categoria').value   = acc.categoria;
  document.getElementById('edit-costo').value       = acc.costo;
  document.getElementById('edit-precio').value      = acc.precioVenta;
  abrirModal('modal-editar-acc');
}

async function guardarEdicionAcc(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;

  const updates = {
    nombre:      document.getElementById('edit-nombre').value.trim(),
    marca:       document.getElementById('edit-marca').value.trim(),
    categoria:   document.getElementById('edit-categoria').value,
    costo:       parseFloat(document.getElementById('edit-costo').value) || 0,
    precioVenta: parseFloat(document.getElementById('edit-precio').value) || 0,
  };

  try {
    await db.collection('accesorios').doc(accSeleccionadoId).update(updates);
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
  const texto     = normalizar(document.getElementById('buscador-acc').value);
  const categoria = document.getElementById('filtro-categoria').value;

  const filtrados = accesoriosCache.filter(a => {
    const coincideTexto = !texto || normalizar(a.nombre + ' ' + (a.marca || '')).includes(texto);
    const coincideCat   = !categoria || a.categoria === categoria;
    return coincideTexto && coincideCat;
  });

  renderTablaAccesorios(filtrados);
}

// =============================================
// INIT
// =============================================
document.addEventListener('DOMContentLoaded', () => {
  cargarAccesorios();

  document.getElementById('form-acc-nuevo')?.addEventListener('submit', agregarAccesorio);
  document.getElementById('form-sumar-stock')?.addEventListener('submit', sumarStock);
  document.getElementById('form-venta-acc')?.addEventListener('submit', registrarVentaAccesorio);
  document.getElementById('form-editar-acc')?.addEventListener('submit', guardarEdicionAcc);

  document.getElementById('buscador-acc')?.addEventListener('input', filtrarAccesorios);
  document.getElementById('filtro-categoria')?.addEventListener('change', filtrarAccesorios);
});
