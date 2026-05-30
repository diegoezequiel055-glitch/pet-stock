// =============================================
// stock-bolsas.js
// Módulo de stock de bolsas con sistema FIFO por lotes
// =============================================
// Estructura Firestore:
//   productos/{productoId}
//     nombre, marca, especie, unidadPeso, stockTotal
//     lotes/{loteId}
//       fechaCompra, cantidadInicial, cantidadRestante,
//       costoUnitario, proveedor, notas

// ---- ESTADO LOCAL ----
let productosCache = [];         // Lista de productos en memoria
let productoSeleccionadoId = ''; // ID del producto activo en modales

// =============================================
// CARGAR Y MOSTRAR PRODUCTOS
// =============================================
async function cargarProductos() {
  try {
    const snap = await db.collection('productos')
      .orderBy('marca')
      .get();

    productosCache = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderTablaProductos(productosCache);
  } catch (err) {
    console.error(err);
    mostrarAlerta('Error al cargar productos', 'error');
  }
}

function togglePanel(header) {
  var panel = header.nextElementSibling;
  var arrow = header.querySelector('.tw-arrow');
  var cerrado = panel.style.display === 'none' || panel.style.display === '';
  panel.style.display = cerrado ? 'block' : 'none';
  if (arrow) arrow.style.transform = cerrado ? 'rotate(180deg)' : '';
}

function renderTablaProductos(lista) {
  var contenedor = document.getElementById('tbody-productos');
  if (!contenedor) return;
  if (lista.length === 0) {
    contenedor.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:24px">No hay productos cargados</p>';
    return;
  }
  contenedor.innerHTML = lista.map(function(p) {
    var stock = p.stockTotal != null ? p.stockTotal : 0;
    var stockColor = stock <= 5 ? '#ef4444' : stock <= 15 ? '#f97316' : '#4ade80';
    var espBadge = p.especie
      ? '<span style="background:#374151;color:#d1d5db;padding:2px 8px;border-radius:5px;font-size:11px;font-weight:600">' + p.especie + '</span>'
      : '';
    var pesoBadge = p.unidadPeso
      ? '<span style="background:#0f172a;color:#4ade80;padding:2px 8px;border-radius:5px;font-size:11px;font-weight:600">' + p.unidadPeso + '</span>'
      : '';
    return '<div style="margin-bottom:8px;border-radius:10px;overflow:hidden">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:#1e293b;border:1px solid #1e3a5f;border-radius:10px;cursor:pointer" onclick="togglePanel(this)">'
        + '<div style="flex:1;min-width:0">'
          + '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:5px">'
            + '<span style="color:#fff;font-weight:700;font-size:14px">' + p.marca + '</span>'
            + '<span style="color:#94a3b8;font-size:14px">&mdash; ' + p.nombre + '</span>'
          + '</div>'
          + '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">'
            + espBadge + pesoBadge
            + '<span style="color:#94a3b8;font-size:11px;font-weight:600">Costo: ' + formatPrecio(p.ultimoCosto || 0) + '</span>'
          + '</div>'
        + '</div>'
        + '<div style="display:flex;align-items:center;gap:10px;flex-shrink:0">'
          + '<div style="display:flex;flex-direction:column;align-items:center;background:#0f172a;border:1px solid #334155;padding:4px 10px;border-radius:8px;min-width:46px">'
            + '<span style="font-size:9px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:.5px">Stock</span>'
            + '<span style="font-size:18px;font-weight:900;color:' + stockColor + ';line-height:1.2">' + stock + '</span>'
          + '</div>'
          + '<span class="tw-arrow" style="font-size:12px;color:#64748b;transition:transform .2s">&#9660;</span>'
        + '</div>'
      + '</div>'
      + '<div style="display:none;background:#131c2e;padding:12px 14px;border:1px solid #1e3a5f;border-top:none;border-radius:0 0 10px 10px">'
        + '<div style="display:flex;gap:8px">'
          + '<button class="btn btn-sm btn-verde" style="flex:1;justify-content:center" onclick="abrirModalLote(\'' + p.id + '\')">+ Lote</button>'
          + '<button class="btn btn-sm btn-gris"  style="flex:1;justify-content:center" onclick="verLotes(\'' + p.id + '\')">Ver lotes</button>'
        + '</div>'
      + '</div>'
    + '</div>';
  }).join('');
}

// =============================================
// AGREGAR PRODUCTO NUEVO
// =============================================
async function agregarProducto(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;

  const data = {
    nombre:     document.getElementById('prod-nombre').value.trim(),
    marca:      document.getElementById('prod-marca').value.trim(),
    especie:    document.getElementById('prod-especie').value,
    unidadPeso: document.getElementById('prod-peso').value.trim(),
    stockTotal: 0,
    ultimoCosto: 0,
    creadoEn:   firebase.firestore.FieldValue.serverTimestamp()
  };

  if (!data.nombre || !data.marca) {
    mostrarAlerta('Completá nombre y marca', 'warning');
    btn.disabled = false;
    return;
  }

  try {
    await db.collection('productos').add(data);
    mostrarAlerta(`Producto "${data.nombre}" creado`, 'success');
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
// AGREGAR LOTE DE COMPRA
// =============================================
function abrirModalLote(productoId) {
  productoSeleccionadoId = productoId;
  const prod = productosCache.find(p => p.id === productoId);
  document.getElementById('lote-prod-nombre').textContent = prod ? `${prod.marca} - ${prod.nombre}` : '';
  document.getElementById('lote-fecha').value = hoyISO();
  document.getElementById('form-lote').reset();
  document.getElementById('lote-fecha').value = hoyISO();
  abrirModal('modal-lote');
}

async function agregarLote(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;

  const cantidad   = parseInt(document.getElementById('lote-cantidad').value);
  const costo      = parseFloat(document.getElementById('lote-costo').value);
  const fecha      = document.getElementById('lote-fecha').value;
  const proveedor  = document.getElementById('lote-proveedor').value.trim();
  const notas      = document.getElementById('lote-notas').value.trim();

  if (!cantidad || cantidad <= 0 || !costo || costo <= 0 || !fecha) {
    mostrarAlerta('Completá cantidad, costo y fecha', 'warning');
    btn.disabled = false;
    return;
  }

  const loteData = {
    fechaCompra:       firebase.firestore.Timestamp.fromDate(new Date(fecha + 'T12:00:00')),
    cantidadInicial:   cantidad,
    cantidadRestante:  cantidad,
    costoUnitario:     costo,
    proveedor:         proveedor || '-',
    notas:             notas || '',
    creadoEn:          firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    const productoRef = db.collection('productos').doc(productoSeleccionadoId);

    // Transacción: agregar lote + actualizar stockTotal y ultimoCosto
    await db.runTransaction(async (t) => {
      const prodDoc = await t.get(productoRef);
      const stockActual = prodDoc.data().stockTotal || 0;

      const loteRef = productoRef.collection('lotes').doc();
      t.set(loteRef, loteData);
      t.update(productoRef, {
        stockTotal:  stockActual + cantidad,
        ultimoCosto: costo
      });
    });

    mostrarAlerta(`Lote de ${cantidad} unidades cargado correctamente`, 'success');
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
// REGISTRAR VENTA (FIFO)
// =============================================
function abrirModalVenta(productoId) {
  productoSeleccionadoId = productoId;
  const prod = productosCache.find(p => p.id === productoId);
  document.getElementById('venta-prod-nombre').textContent = prod ? `${prod.marca} - ${prod.nombre}` : '';
  document.getElementById('venta-stock-disp').textContent = prod ? prod.stockTotal : 0;
  document.getElementById('form-venta').reset();
  abrirModal('modal-venta');
}

async function registrarVenta(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;

  const cantidadVendida = parseInt(document.getElementById('venta-cantidad').value);
  const precioVenta     = parseFloat(document.getElementById('venta-precio').value);
  const cliente         = document.getElementById('venta-cliente').value.trim();

  if (!cantidadVendida || cantidadVendida <= 0 || !precioVenta || precioVenta <= 0) {
    mostrarAlerta('Completá cantidad y precio de venta', 'warning');
    btn.disabled = false;
    return;
  }

  const prod = productosCache.find(p => p.id === productoSeleccionadoId);
  if (!prod || prod.stockTotal < cantidadVendida) {
    mostrarAlerta('Stock insuficiente', 'error');
    btn.disabled = false;
    return;
  }

  try {
    const productoRef = db.collection('productos').doc(productoSeleccionadoId);

    // Traer lotes ordenados por fecha (FIFO = más viejo primero)
    // Nota: no se combina where() de desigualdad con orderBy() de otro campo (limitación Firestore)
    // El filtro de cantidadRestante > 0 se hace en JavaScript
    const lotesSnap = await productoRef.collection('lotes')
      .orderBy('fechaCompra', 'asc')
      .get();

    const lotes = lotesSnap.docs
      .map(d => ({ id: d.id, ref: d.ref, ...d.data() }))
      .filter(l => l.cantidadRestante > 0);

    // Calcular costo real FIFO y armar actualizaciones
    let restaPorDescontar = cantidadVendida;
    let costoTotalFIFO    = 0;
    const loteUpdates     = [];

    for (const lote of lotes) {
      if (restaPorDescontar <= 0) break;

      const tomados = Math.min(lote.cantidadRestante, restaPorDescontar);
      costoTotalFIFO    += tomados * lote.costoUnitario;
      restaPorDescontar -= tomados;

      loteUpdates.push({
        ref:               lote.ref,
        nuevaCantidad:     lote.cantidadRestante - tomados
      });
    }

    if (restaPorDescontar > 0) {
      mostrarAlerta('No hay suficiente stock en los lotes', 'error');
      btn.disabled = false;
      return;
    }

    const gananciaTotal = (precioVenta * cantidadVendida) - costoTotalFIFO;
    const gananciaUnitaria = gananciaTotal / cantidadVendida;

    // Guardar en Firestore (transacción)
    await db.runTransaction(async (t) => {
      // Actualizar cada lote
      for (const lu of loteUpdates) {
        t.update(lu.ref, { cantidadRestante: lu.nuevaCantidad });
      }

      // Actualizar stockTotal del producto
      t.update(productoRef, {
        stockTotal: firebase.firestore.FieldValue.increment(-cantidadVendida)
      });

      // Registrar venta en colección global
      const ventaRef = db.collection('ventas').doc();
      t.set(ventaRef, {
        productoId:      productoSeleccionadoId,
        nombreProducto:  `${prod.marca} - ${prod.nombre}`,
        cantidad:        cantidadVendida,
        precioVenta:     precioVenta,
        totalVenta:      precioVenta * cantidadVendida,
        costoFIFO:       costoTotalFIFO,
        ganancia:        gananciaTotal,
        gananciaUnit:    gananciaUnitaria,
        cliente:         cliente || '-',
        fecha:           firebase.firestore.FieldValue.serverTimestamp()
      });
    });

    mostrarAlerta(
      `Venta registrada. Ganancia: ${formatPrecio(gananciaTotal)} (${formatPrecio(gananciaUnitaria)}/u)`,
      'success'
    );
    cerrarModal('modal-venta');
    cargarProductos();

  } catch (err) {
    console.error(err);
    mostrarAlerta('Error al registrar la venta', 'error');
  } finally {
    btn.disabled = false;
  }
}

// =============================================
// VER LOTES DE UN PRODUCTO
// =============================================
async function verLotes(productoId) {
  productoSeleccionadoId = productoId;
  const prod = productosCache.find(p => p.id === productoId);
  document.getElementById('lotes-prod-nombre').textContent = prod ? `${prod.marca} - ${prod.nombre}` : '';

  try {
    const snap = await db.collection('productos').doc(productoId)
      .collection('lotes')
      .orderBy('fechaCompra', 'asc')
      .get();

    const tbody = document.getElementById('tbody-lotes');
    if (snap.empty) {
      tbody.innerHTML = '<tr><td colspan="6" class="sin-datos">Sin lotes cargados</td></tr>';
    } else {
      tbody.innerHTML = snap.docs.map(doc => {
        const l = doc.data();
        const agotado = l.cantidadRestante === 0;
        return `
          <tr class="${agotado ? 'lote-agotado' : ''}">
            <td data-label="Fecha">${formatFecha(l.fechaCompra)}</td>
            <td data-label="Stock">${l.cantidadRestante} / ${l.cantidadInicial}</td>
            <td data-label="Costo unit.">${formatPrecio(l.costoUnitario)}</td>
            <td data-label="Valor total">${formatPrecio(l.costoUnitario * l.cantidadRestante)}</td>
            <td data-label="Proveedor">${l.proveedor}</td>
            <td data-label="">
              <button onclick="eliminarLote('${productoId}','${doc.id}',${l.cantidadRestante})"
                style="background:none;border:none;font-size:18px;cursor:pointer;padding:2px 6px;color:#ef4444"
                title="Eliminar lote">🗑️</button>
            </td>
          </tr>`;
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
    const productoRef = db.collection('productos').doc(productoId);
    await db.runTransaction(async (t) => {
      const loteRef = productoRef.collection('lotes').doc(loteId);
      t.delete(loteRef);
      t.update(productoRef, {
        stockTotal: firebase.firestore.FieldValue.increment(-cantidadRestante)
      });
    });
    mostrarAlerta('Lote eliminado correctamente', 'success');
    verLotes(productoId);
    cargarProductos();
  } catch (err) {
    console.error(err);
    mostrarAlerta('Error al eliminar el lote', 'error');
  }
}

// =============================================
// BÚSQUEDA / FILTRO
// =============================================
function filtrarProductos() {
  const texto    = normalizar(document.getElementById('buscador').value);
  const especie  = document.getElementById('filtro-especie').value;

  const filtrados = productosCache.filter(p => {
    const coincideTexto   = !texto || normalizar(p.nombre + ' ' + p.marca).includes(texto);
    const coincideEspecie = !especie || p.especie === especie;
    return coincideTexto && coincideEspecie;
  });

  renderTablaProductos(filtrados);
}

// =============================================
// INIT
// =============================================
document.addEventListener('DOMContentLoaded', () => {
  cargarProductos();

  // Formularios
  document.getElementById('form-producto')?.addEventListener('submit', agregarProducto);
  document.getElementById('form-lote')?.addEventListener('submit', agregarLote);
  document.getElementById('form-venta')?.addEventListener('submit', registrarVenta);

  // Búsqueda en tiempo real
  document.getElementById('buscador')?.addEventListener('input', filtrarProductos);
  document.getElementById('filtro-especie')?.addEventListener('change', filtrarProductos);
});
