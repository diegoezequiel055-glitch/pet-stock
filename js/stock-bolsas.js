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
  panel.classList.toggle('hidden');
  if (arrow) arrow.style.transform = panel.classList.contains('hidden') ? '' : 'rotate(180deg)';
}

function renderTablaProductos(lista) {
  var contenedor = document.getElementById('tbody-productos');
  if (!contenedor) return;
  if (lista.length === 0) {
    contenedor.innerHTML = '<p class="text-center text-gray-400 py-8">No hay productos cargados</p>';
    return;
  }
  contenedor.innerHTML = lista.map(function(p) {
    var stock = p.stockTotal != null ? p.stockTotal : 0;
    var stockColor = stock <= 5 ? 'text-red-500' : stock <= 15 ? 'text-orange-500' : 'text-emerald-400';
    var espBadge = p.especie
      ? '<span class="bg-gray-700 text-gray-300 px-2 py-0.5 rounded">' + p.especie + '</span>'
      : '';
    var pesoBadge = p.unidadPeso
      ? '<span class="bg-slate-900 text-emerald-400 px-2 py-0.5 rounded font-medium">' + p.unidadPeso + '</span>'
      : '';
    var costoStr = formatPrecio(p.ultimoCosto || 0);
    return '<div class="mb-2 rounded-lg overflow-hidden">'
      + '<div class="flex items-center justify-between p-3 bg-[#1e293b] border border-gray-800 rounded-lg cursor-pointer hover:bg-slate-800 transition-colors" onclick="togglePanel(this)">'
        + '<div class="flex flex-col space-y-1">'
          + '<div class="flex items-center space-x-2 flex-wrap">'
            + '<span class="text-white font-bold text-sm">' + p.marca + '</span>'
            + '<span class="text-gray-300 text-sm">&mdash; ' + p.nombre + '</span>'
          + '</div>'
          + '<div class="flex items-center space-x-2 text-xs flex-wrap">'
            + espBadge
            + pesoBadge
            + '<span class="text-gray-400 font-semibold ml-2">Costo: ' + costoStr + '</span>'
          + '</div>'
        + '</div>'
        + '<div class="flex items-center space-x-3 pr-1">'
          + '<div class="flex flex-col items-center justify-center bg-slate-900 border border-gray-700 px-3 py-1 rounded-md min-w-[50px]">'
            + '<span class="text-gray-400 uppercase tracking-wider font-bold" style="font-size:9px">Stock</span>'
            + '<span class="text-base font-black ' + stockColor + '">' + stock + '</span>'
          + '</div>'
          + '<span class="text-gray-500 text-xs tw-arrow transition-transform duration-200">&#9660;</span>'
        + '</div>'
      + '</div>'
      + '<div class="hidden bg-[#131c2e] p-3 border-x border-b border-gray-800 rounded-b-lg">'
        + '<div class="flex gap-2">'
          + '<button class="btn btn-sm btn-verde flex-1" onclick="abrirModalLote(\'' + p.id + '\')">+ Lote</button>'
          + '<button class="btn btn-sm btn-gris flex-1" onclick="verLotes(\'' + p.id + '\')">Ver lotes</button>'
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
      tbody.innerHTML = '<tr><td colspan="5" class="sin-datos">Sin lotes cargados</td></tr>';
    } else {
      tbody.innerHTML = snap.docs.map(doc => {
        const l = doc.data();
        const agotado = l.cantidadRestante === 0;
        return `
          <tr class="${agotado ? 'lote-agotado' : ''}">
            <td>${formatFecha(l.fechaCompra)}</td>
            <td>${l.cantidadRestante} / ${l.cantidadInicial}</td>
            <td>${formatPrecio(l.costoUnitario)}</td>
            <td>${formatPrecio(l.costoUnitario * l.cantidadRestante)}</td>
            <td>${l.proveedor}</td>
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
