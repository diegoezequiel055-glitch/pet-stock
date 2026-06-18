// ============================================================
//  vender.js v17
//  REDISEÑO: Carrito único unificado (bolsas + accesorios + farmacia)
//  con switch Minorista/Mayorista y buscador único.
//  FIX respecto a v15: confirmarVentaUnica() re-chequea stock FRESCO
//  contra Firestore (bolsas y accesorios/farmacia) antes de confirmar.
// ============================================================

// -----------------------------------------------------------
// ESTADO LOCAL
// -----------------------------------------------------------
let modoVenta          = 'minorista'; // 'minorista' | 'mayorista'
let catalogoLocal      = [];          // bolsas (colección productos)
let catalogoAccesorios = [];          // accesorios/farmacia (colección accesorios [+ variantes])
let carritoMinorista    = [];
let carritoMayorista    = [];

function carritoActivo() {
  return modoVenta === 'minorista' ? carritoMinorista : carritoMayorista;
}

function setCarritoActivo(nuevoArray) {
  if (modoVenta === 'minorista') carritoMinorista = nuevoArray;
  else carritoMayorista = nuevoArray;
}

// -----------------------------------------------------------
// CARGA DEL CATÁLOGO (BOLSAS) DESDE FIRESTORE
// -----------------------------------------------------------
async function cargarCatalogo() {
  try {
    mostrarEstadoCarga(true);
    const [snapProductos, snapPrecios] = await Promise.all([
      db.collection('productos').get(),
      db.collection('precios').get()
    ]);
    const mapaPrecios = {};
    snapPrecios.docs.forEach(function(d) {
      const p = d.data();
      mapaPrecios[clavePrecio(p.marca, p.nombre, '')] = {
        precioMinorista: p.precioMinorista || 0,
        precioMayorista: p.precioMayorista || 0
      };
    });
    const bolsas = snapProductos.docs.map(function(doc) {
      const d      = doc.data();
      const key    = clavePrecio(d.marca, d.nombre, '');
      const precio = mapaPrecios[key];
      const precioMin = precio ? (precio.precioMinorista || 0) : 0;
      return {
        id:             doc.id,
        tipo:           'bolsa',
        nombre:         (d.marca || '') + ' — ' + (d.nombre || ''),
        detalle:        [d.unidadPeso, d.especie].filter(Boolean).join(' · '),
        stock:          d.stockTotal || 0,
        precioVenta:    precioMin,
        precioMay:      precio ? (precio.precioMayorista || 0) : 0,
        precioEditable: true,
        _busqueda:      normalizar((d.marca || '') + ' ' + (d.nombre || '') + ' ' + (d.unidadPeso || '') + ' ' + (d.especie || ''))
      };
    });
    catalogoLocal = [...bolsas];
    mostrarEstadoCarga(false);
  } catch (err) {
    console.error('Error cargando catalogo:', err);
    mostrarEstadoCarga(false, 'Error al cargar. Recarga la pagina.');
  }
}

function clavePrecio(marca, nombre, unidadPeso) {
  return normalizar((marca || '') + '|' + (nombre || '') + '|' + (unidadPeso || ''));
}

function mostrarEstadoCarga(cargando, error) {
  const input = document.getElementById('input-busqueda');
  if (!input) return;
  if (cargando) {
    input.placeholder = 'Cargando productos...';
    input.disabled    = true;
  } else if (error) {
    input.placeholder = error;
    input.disabled    = false;
  } else {
    input.placeholder = 'Buscar bolsa, accesorio o farmacia...';
    input.disabled    = false;
  }
}

// -----------------------------------------------------------
// CARGA DE ACCESORIOS / FARMACIA DESDE FIRESTORE
// -----------------------------------------------------------
async function cargarAccesorios() {
  try {
    const snap = await db.collection('accesorios').get();
    const items = [];
    for (const doc of snap.docs) {
      const data = doc.data();
      if (data.tieneVariantes) {
        const varSnap = await db.collection('accesorios').doc(doc.id).collection('variantes').get();
        varSnap.docs.forEach(function(vDoc) {
          const v = vDoc.data();
          if ((v.stock || 0) <= 0) return;
          items.push({
            id:          vDoc.id,
            padreId:     doc.id,
            esVariante:  true,
            tipo:        (data.categoria === 'farmacia') ? 'farmacia' : 'accesorio',
            nombre:      (data.nombre || '') + ' — ' + (v.nombre_variante || ''),
            detalle:     [(data.categoria || ''), (data.marca || '')].filter(Boolean).join(' · '),
            stock:       v.stock       || 0,
            costo:       v.costo       || 0,
            precioVenta: v.precioVenta || 0,
            _busqueda:   normalizar((data.nombre || '') + ' ' + (v.nombre_variante || '') + ' ' + (data.marca || '') + ' ' + (data.categoria || ''))
          });
        });
      } else {
        if ((data.stock || 0) <= 0) continue;
        items.push({
          id:          doc.id,
          padreId:     null,
          esVariante:  false,
          tipo:        (data.categoria === 'farmacia') ? 'farmacia' : 'accesorio',
          nombre:      data.nombre || '(sin nombre)',
          detalle:     [(data.categoria || ''), (data.marca || '')].filter(Boolean).join(' · '),
          stock:       data.stock       || 0,
          costo:       data.costo       || 0,
          precioVenta: data.precioVenta || 0,
          _busqueda:   normalizar((data.nombre || '') + ' ' + (data.marca || '') + ' ' + (data.categoria || ''))
        });
      }
    }
    catalogoAccesorios = items;
  } catch (err) {
    console.error('Error cargando accesorios:', err);
  }
}

// -----------------------------------------------------------
// SWITCH MINORISTA / MAYORISTA
// -----------------------------------------------------------
function cambiarModo(modo) {
  if (modo !== 'minorista' && modo !== 'mayorista') return;
  modoVenta = modo;

  const btnMin = document.getElementById('switch-minorista');
  const btnMay = document.getElementById('switch-mayorista');
  if (btnMin) btnMin.classList.toggle('activo', modo === 'minorista');
  if (btnMay) {
    btnMay.classList.toggle('activo', modo === 'mayorista');
    btnMay.classList.toggle('modo-mayorista', modo === 'mayorista');
  }

  // Re-renderizar carrito activo
  renderCarritoUnico();

  // Re-renderizar resultados de búsqueda si hay una búsqueda activa
  const input = document.getElementById('input-busqueda');
  const resultados = document.getElementById('resultados-busqueda');
  if (input && resultados && resultados.style.display === 'block' && input.value.trim().length >= 2) {
    const encontrados = buscarEnCatalogos(input.value.trim());
    renderResultados(encontrados);
  }
}

// -----------------------------------------------------------
// PRECIOS SEGÚN MODO
// -----------------------------------------------------------
function precioSegunModo(item) {
  if (item.tipo === 'bolsa') {
    return modoVenta === 'mayorista' ? (item.precioMay || 0) : (item.precioVenta || 0);
  }
  // Accesorios/farmacia: precio único (no hay distinción minorista/mayorista en el doc)
  return item.precioVenta || 0;
}

// -----------------------------------------------------------
// BUSCADOR ÚNICO (bolsas + accesorios + farmacia)
// -----------------------------------------------------------
function inicializarBuscador() {
  const input      = document.getElementById('input-busqueda');
  const resultados = document.getElementById('resultados-busqueda');
  if (!input) return;
  input.addEventListener('input', function() {
    const q = input.value.trim();
    if (q.length < 2) { resultados.style.display = 'none'; return; }
    const encontrados = buscarEnCatalogos(q);
    renderResultados(encontrados);
  });
  document.addEventListener('click', function(e) {
    const wrap = document.getElementById('wrap-busqueda');
    if (wrap && !wrap.contains(e.target)) {
      resultados.style.display = 'none';
    }
  });
}

function buscarEnCatalogos(q) {
  const qNorm = normalizar(q);
  const bolsas = catalogoLocal
    .filter(function(p) { return p._busqueda.includes(qNorm); })
    .filter(function(p) { return p.stock > 0; });
  const accesorios = catalogoAccesorios
    .filter(function(p) { return p._busqueda.includes(qNorm); })
    .filter(function(p) { return p.stock > 0; });
  return [...bolsas, ...accesorios].slice(0, 15);
}

function badgeInfoTipo(tipo) {
  if (tipo === 'bolsa')    return { clase: 'badge-bolsa',    label: 'Bolsa' };
  if (tipo === 'farmacia') return { clase: 'badge-farmacia', label: 'Farmacia' };
  return { clase: 'badge-acc', label: 'Accesorio' };
}

function renderResultados(items) {
  const contenedor = document.getElementById('resultados-busqueda');
  if (items.length === 0) {
    contenedor.innerHTML = '<div style="padding:14px;text-align:center;color:#94a3b8;font-size:13px">Sin resultados</div>';
    contenedor.style.display = 'block';
    return;
  }
  contenedor.innerHTML = items.map(function(p) {
    const sinStock  = (p.stock || 0) <= 0;
    const precio    = precioSegunModo(p);
    const precioStr = precio > 0
      ? formatPrecioLocal(precio)
      : '<span style="color:#16a34a;font-size:12px">Editable</span>';
    const badge = badgeInfoTipo(p.tipo);
    const claveItem = p.tipo + '|' + p.id + '|' + (p.padreId || '');
    return '<div class="resultado-item ' + (sinStock ? 'resultado-sin-stock' : '') + '"' +
      (sinStock ? '' : ' onclick="agregarAlCarritoUnico(\'' + claveItem.replace(/'/g, "\\'") + '\')"') + '>' +
      '<div>' +
        '<div class="resultado-nombre">' +
          '<span class="badge-tipo ' + badge.clase + '">' + badge.label + '</span> ' + p.nombre +
        '</div>' +
        '<div class="resultado-detalle">' + p.detalle +
          (sinStock
            ? ' · <span style="color:#ef4444;font-weight:600">Sin stock</span>'
            : ' · Stock: ' + p.stock) +
        '</div>' +
      '</div>' +
      '<div class="resultado-precio">' + precioStr + '</div>' +
    '</div>';
  }).join('');
  contenedor.style.display = 'block';
}

// -----------------------------------------------------------
// HELPERS DE IDENTIDAD DE ITEM (tipo + id [+ padreId])
// -----------------------------------------------------------
function buscarEnCatalogoPorClave(tipo, id, padreId) {
  if (tipo === 'bolsa') {
    return catalogoLocal.find(function(p) { return p.tipo === 'bolsa' && p.id === id; });
  }
  return catalogoAccesorios.find(function(p) {
    return p.id === id && (p.padreId || null) === (padreId || null);
  });
}

function mismoItem(c, tipo, id, padreId) {
  return c.tipo === tipo && c.id === id && (c.padreId || null) === (padreId || null);
}

// -----------------------------------------------------------
// CARRITO ÚNICO — agregar / cantidad / quitar / vaciar
// -----------------------------------------------------------
function agregarAlCarritoUnico(claveItem) {
  const partes   = claveItem.split('|');
  const tipo     = partes[0];
  const id       = partes[1];
  const padreId  = partes[2] || null;

  const producto = buscarEnCatalogoPorClave(tipo, id, padreId);
  if (!producto || producto.stock <= 0) return;

  document.getElementById('resultados-busqueda').style.display = 'none';
  document.getElementById('input-busqueda').value = '';

  const carrito = carritoActivo();
  const existente = carrito.find(function(c) { return mismoItem(c, tipo, id, padreId); });
  if (existente) {
    if (existente.cantidad < producto.stock) existente.cantidad++;
    else { mostrarToast('No hay mas stock disponible'); return; }
  } else {
    carrito.push(Object.assign({}, producto, {
      tipo:        producto.tipo,
      padreId:     producto.padreId || null,
      esVariante:  !!producto.esVariante,
      cantidad:    1,
      precioVenta: precioSegunModo(producto)
    }));
  }
  renderCarritoUnico();
}

function cambiarCantidadUnico(tipo, id, padreId, delta) {
  const carrito = carritoActivo();
  const item    = carrito.find(function(c) { return mismoItem(c, tipo, id, padreId); });
  if (!item) return;
  const enCatalogo = buscarEnCatalogoPorClave(tipo, id, padreId);
  const maxStock   = enCatalogo ? (enCatalogo.stock || 9999) : 9999;
  item.cantidad    = Math.max(0, Math.min(item.cantidad + delta, maxStock));
  if (item.cantidad === 0) {
    setCarritoActivo(carrito.filter(function(c) { return !mismoItem(c, tipo, id, padreId); }));
  }
  renderCarritoUnico();
}

function quitarDelCarritoUnico(tipo, id, padreId) {
  const carrito = carritoActivo();
  setCarritoActivo(carrito.filter(function(c) { return !mismoItem(c, tipo, id, padreId); }));
  renderCarritoUnico();
}

function actualizarPrecioCarritoUnico(tipo, id, padreId, valor) {
  const carrito = carritoActivo();
  const item = carrito.find(function(c) { return mismoItem(c, tipo, id, padreId); });
  if (item) item.precioVenta = parseFloat(valor) || 0;
  renderCarritoUnico();
}

function vaciarCarritoUnico() {
  setCarritoActivo([]);
  renderCarritoUnico();
  guardarCache();
}

// -----------------------------------------------------------
// RENDER DEL CARRITO ÚNICO
// -----------------------------------------------------------
function claveJsItem(item) {
  // Escapamos comillas simples para uso seguro dentro de atributos onclick
  return "'" + item.tipo + "','" + item.id + "'," + (item.padreId ? "'" + item.padreId + "'" : 'null');
}

function renderCarritoUnico() {
  const carrito = carritoActivo();
  const lista   = document.getElementById('carrito-lista');
  const count   = document.getElementById('carrito-count');
  const btnConf = document.getElementById('btn-confirmar');
  if (!lista) return;

  if (carrito.length === 0) {
    lista.innerHTML = '<div style="text-align:center;padding:24px 16px;display:flex;flex-direction:column;align-items:center;gap:8px">' +
      '<div style="font-size:40px">🛒</div>' +
      '<div style="font-size:14px;font-weight:700;color:#1e293b">Carrito vacio</div>' +
      '<div style="font-size:13px;color:#94a3b8;max-width:240px;text-align:center">Usa el buscador para agregar productos</div>' +
    '</div>';
    if (count) count.textContent = '';
    const totalEl = document.getElementById('total-carrito');
    if (totalEl) totalEl.textContent = '$0';
    if (btnConf) btnConf.disabled = true;
    guardarCache();
    return;
  }

  if (count) count.textContent = '(' + carrito.length + ')';
  if (btnConf) btnConf.disabled = false;

  lista.innerHTML = carrito.map(function(item) {
    const subtotal = (item.precioVenta || 0) * item.cantidad;
    const badge    = badgeInfoTipo(item.tipo);
    const claveJs  = claveJsItem(item);
    const precioHtml = '<input type="number" min="0" value="' + (item.precioVenta || '') + '" placeholder="$ precio"' +
      ' onchange="actualizarPrecioCarritoUnico(' + claveJs + ', this.value)"' +
      ' style="width:110px;padding:5px 10px;background:#dcfce7;border:2px solid #16a34a;border-radius:8px;font-size:14px;font-weight:800;color:#166534">';
    return '<div class="carrito-item">' +
      '<div>' +
        '<div class="ci-nombre"><span class="badge-tipo ' + badge.clase + '">' + badge.label + '</span> ' + item.nombre + '</div>' +
        '<div class="ci-detalle">' + item.detalle + '</div>' +
        '<div style="margin-top:5px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
          precioHtml +
          (item.cantidad > 1 ? '<span class="ci-subtotal">= ' + formatPrecioLocal(subtotal) + '</span>' : '') +
        '</div>' +
      '</div>' +
      '<div class="ci-controles">' +
        '<button class="ci-btn" onclick="cambiarCantidadUnico(' + claveJs + ', -1)">−</button>' +
        '<span class="ci-cant">' + item.cantidad + '</span>' +
        '<button class="ci-btn" onclick="cambiarCantidadUnico(' + claveJs + ', 1)">+</button>' +
        '<button class="ci-btn eliminar" onclick="quitarDelCarritoUnico(' + claveJs + ')">🗑</button>' +
      '</div>' +
    '</div>';
  }).join('');

  actualizarTotalUnico();
  guardarCache();
}

function actualizarTotalUnico() {
  const carrito = carritoActivo();
  const total = carrito.reduce(function(s, c) { return s + (c.precioVenta || 0) * c.cantidad; }, 0);
  const totalEl = document.getElementById('total-carrito');
  if (totalEl) totalEl.textContent = formatPrecioLocal(total);
}

// -----------------------------------------------------------
// CONFIRMAR VENTA ÚNICA (bolsas + accesorios/farmacia, un solo batch)
// -----------------------------------------------------------
async function confirmarVentaUnica() {
  const carrito = carritoActivo();
  if (carrito.length === 0) return;

  const sinPrecio = carrito.filter(function(c) { return !c.precioVenta || c.precioVenta <= 0; });
  if (sinPrecio.length > 0) {
    mostrarToast('Ingresa el precio de: ' + sinPrecio.map(function(p) { return p.nombre; }).join(', '));
    return;
  }

  const btn = document.getElementById('btn-confirmar');
  if (btn) { btn.disabled = true; btn.textContent = 'Procesando...'; }

  try {
    const itemsBolsa = carrito.filter(function(c) { return c.tipo === 'bolsa'; });
    const itemsAcc   = carrito.filter(function(c) { return c.tipo !== 'bolsa'; });

    // ---- 1) RE-CHEQUEO FRESCO DE STOCK CONTRA FIRESTORE ----

    // 1a) Bolsas: FIFO de lotes (igual lógica que la v15 real)
    const datosBolsas = [];
    for (const item of itemsBolsa) {
      const productoRef = db.collection('productos').doc(item.id);
      const lotesSnap   = await productoRef.collection('lotes').orderBy('fechaCompra', 'asc').get();
      const lotes = lotesSnap.docs
        .map(function(d) { return Object.assign({ ref: d.ref }, d.data()); })
        .filter(function(l) { return l.cantidadRestante > 0; });
      const stockEnLotes = lotes.reduce(function(s, l) { return s + l.cantidadRestante; }, 0);
      if (stockEnLotes < item.cantidad) {
        mostrarToast('Stock insuficiente para: ' + item.nombre);
        if (btn) { btn.disabled = false; btn.textContent = '✓ Confirmar venta'; }
        return;
      }
      datosBolsas.push({ item, productoRef, lotes });
    }

    // 1b) Accesorios/farmacia: leer stock actual fresco (variante o doc simple)
    const datosAcc = [];
    for (const item of itemsAcc) {
      let stockFresco = 0;
      let ref;
      if (item.esVariante) {
        ref = db.collection('accesorios').doc(item.padreId).collection('variantes').doc(item.id);
        const snap = await ref.get();
        stockFresco = snap.exists ? (snap.data().stock || 0) : 0;
      } else {
        ref = db.collection('accesorios').doc(item.id);
        const snap = await ref.get();
        stockFresco = snap.exists ? (snap.data().stock || 0) : 0;
      }
      if (stockFresco < item.cantidad) {
        mostrarToast('Stock insuficiente para: ' + item.nombre);
        if (btn) { btn.disabled = false; btn.textContent = '✓ Confirmar venta'; }
        return;
      }
      datosAcc.push({ item, ref });
    }

    // ---- 2) PREPARAR OPERACIONES FIFO (bolsas) ----
    const operacionesBolsa = datosBolsas.map(function(dato) {
      var restante    = dato.item.cantidad;
      var costoFIFO   = 0;
      var loteUpdates = [];
      for (const lote of dato.lotes) {
        if (restante <= 0) break;
        const tomados = Math.min(lote.cantidadRestante, restante);
        costoFIFO    += tomados * lote.costoUnitario;
        restante     -= tomados;
        loteUpdates.push({ ref: lote.ref, nuevaCantidad: lote.cantidadRestante - tomados });
      }
      return {
        item:        dato.item,
        productoRef: dato.productoRef,
        loteUpdates,
        costoFIFO,
        totalVenta:  dato.item.precioVenta * dato.item.cantidad,
        ganancia:    (dato.item.precioVenta * dato.item.cantidad) - costoFIFO
      };
    });

    // ---- 3) ARMAR UN SOLO BATCH ----
    const batch = db.batch();

    operacionesBolsa.forEach(function(op) {
      op.loteUpdates.forEach(function(lu) {
        batch.update(lu.ref, { cantidadRestante: lu.nuevaCantidad });
      });
      batch.update(op.productoRef, {
        stockTotal: firebase.firestore.FieldValue.increment(-op.item.cantidad)
      });
      const vRef = db.collection('ventas').doc();
      batch.set(vRef, {
        fecha:          firebase.firestore.FieldValue.serverTimestamp(),
        tipo:           modoVenta,
        nombreProducto: op.item.nombre,
        cantidad:       op.item.cantidad,
        precioVenta:    op.item.precioVenta,
        totalVenta:     op.totalVenta,
        costoFIFO:      op.costoFIFO,
        ganancia:       op.ganancia,
        origen:         'vender',
        productoId:     op.item.id
      });
    });

    const operacionesAcc = datosAcc.map(function(dato) {
      const costoFIFO = (dato.item.costo || 0) * dato.item.cantidad;
      const ganancia  = (dato.item.precioVenta * dato.item.cantidad) - costoFIFO;
      return { item: dato.item, ref: dato.ref, costoFIFO, ganancia };
    });

    operacionesAcc.forEach(function(op) {
      batch.update(op.ref, { stock: firebase.firestore.FieldValue.increment(-op.item.cantidad) });
      const vRef = db.collection('ventas').doc();
      batch.set(vRef, {
        fecha:          firebase.firestore.FieldValue.serverTimestamp(),
        tipo:           op.item.tipo,
        nombreProducto: op.item.nombre,
        cantidad:       op.item.cantidad,
        precioVenta:    op.item.precioVenta,
        totalVenta:     op.item.precioVenta * op.item.cantidad,
        costoFIFO:      op.costoFIFO,
        ganancia:       op.ganancia,
        origen:         'carrito_acc',
        productoId:     op.item.esVariante ? (op.item.padreId + '/variantes/' + op.item.id) : op.item.id
      });
    });

    // ---- 4) COMMIT ÚNICO ----
    await batch.commit();

    // ---- 5) Actualizar stock local en memoria ----
    operacionesBolsa.forEach(function(op) {
      const enCatalogo = catalogoLocal.find(function(p) { return p.id === op.item.id; });
      if (enCatalogo) enCatalogo.stock -= op.item.cantidad;
    });
    operacionesAcc.forEach(function(op) {
      const enCatalogo = catalogoAccesorios.find(function(p) {
        return p.id === op.item.id && (p.padreId || null) === (op.item.padreId || null);
      });
      if (enCatalogo) enCatalogo.stock -= op.item.cantidad;
    });

    const gananciaTotal =
      operacionesBolsa.reduce(function(s, op) { return s + op.ganancia; }, 0) +
      operacionesAcc.reduce(function(s, op) { return s + op.ganancia; }, 0);

    mostrarToast('Venta ' + modoVenta + ' confirmada — Ganancia: ' + formatPrecioLocal(gananciaTotal));

    setCarritoActivo([]);
    renderCarritoUnico();
  } catch (err) {
    console.error('Error al confirmar venta:', err);
    mostrarToast('Error al procesar la venta. Intenta de nuevo.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✓ Confirmar venta'; }
  }
}

// -----------------------------------------------------------
// CACHE localStorage (carritos separados por modo)
// -----------------------------------------------------------
const CACHE_KEY_MINORISTA = 'carritoMinoristaUnico';
const CACHE_KEY_MAYORISTA = 'carritoMayoristaUnico';

function serializarCarrito(datos) {
  return datos.map(function(item) {
    return {
      id:             item.id,
      padreId:        item.padreId || null,
      esVariante:     !!item.esVariante,
      nombre:         item.nombre,
      detalle:        item.detalle,
      tipo:           item.tipo,
      stock:          item.stock,
      precioVenta:    item.precioVenta,
      precioMay:      item.precioMay,
      costo:          item.costo,
      precioEditable: true,
      cantidad:       item.cantidad,
      _busqueda:      item._busqueda
    };
  });
}

function guardarCache() {
  try {
    localStorage.setItem(CACHE_KEY_MINORISTA, JSON.stringify(serializarCarrito(carritoMinorista)));
    localStorage.setItem(CACHE_KEY_MAYORISTA, JSON.stringify(serializarCarrito(carritoMayorista)));
  } catch (e) {}
}

function restaurarCarritoDesdeCache() {
  try {
    const rawMin = localStorage.getItem(CACHE_KEY_MINORISTA);
    if (rawMin) {
      const itemsMin = JSON.parse(rawMin);
      if (Array.isArray(itemsMin)) carritoMinorista = itemsMin;
    }
  } catch (e) {
    localStorage.removeItem(CACHE_KEY_MINORISTA);
  }
  try {
    const rawMay = localStorage.getItem(CACHE_KEY_MAYORISTA);
    if (rawMay) {
      const itemsMay = JSON.parse(rawMay);
      if (Array.isArray(itemsMay)) carritoMayorista = itemsMay;
    }
  } catch (e) {
    localStorage.removeItem(CACHE_KEY_MAYORISTA);
  }
}

// -----------------------------------------------------------
// CIERRE DIARIO PET SHOP (sin cambios de comportamiento vs v15)
// -----------------------------------------------------------
function toggleCierre() {
  const body    = document.getElementById('cierre-body');
  const chevron = document.getElementById('cierre-chevron');
  body.classList.toggle('abierto');
  chevron.style.transform = body.classList.contains('abierto') ? 'rotate(180deg)' : '';
  if (body.classList.contains('abierto')) cargarResumenCierrePetShop();
}

async function guardarCierrePetShop() {
  const monto = parseFloat(document.getElementById('input-cierre-monto').value);
  const notas = (document.getElementById('input-cierre-notas') ? document.getElementById('input-cierre-notas').value : '').trim();
  const tipo  = 'cierre';

  if (isNaN(monto) || monto < 0) { mostrarToast('Ingresa un monto valido'); return; }

  const btn = document.getElementById('btn-guardar-cierre');
  btn.disabled    = true;
  btn.textContent = 'Guardando...';

  try {
    const ahora = new Date();
    await db.collection('caja_petshop').add({
      fecha:    firebase.firestore.FieldValue.serverTimestamp(),
      fechaISO: ahora.toISOString().slice(0, 10),
      monto,
      notas:    notas || '',
      tipo,
      origen:   'cierre_diario'
    });
    mostrarToast('Cierre registrado: ' + formatPrecioLocal(monto));
    document.getElementById('input-cierre-monto').value = '';
    if (document.getElementById('input-cierre-notas')) document.getElementById('input-cierre-notas').value = '';
    await cargarResumenCierrePetShop();
  } catch (err) {
    console.error(err);
    mostrarToast('Error al guardar.');
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Guardar';
  }
}

async function cargarResumenCierrePetShop() {
  const contenedor = document.getElementById('cierre-historial');
  if (!contenedor) return;
  const hoy = new Date().toISOString().slice(0, 10);
  try {
    const snap = await db.collection('caja_petshop')
      .where('fechaISO', '==', hoy)
      .get();

    if (snap.empty) {
      contenedor.innerHTML = '<p style="color:#94a3b8;font-size:13px;margin:8px 0 0">Sin registros hoy.</p>';
      document.getElementById('cierre-total-hoy').textContent = '';
      return;
    }

    const registros = snap.docs
      .map(function(d) { return Object.assign({ id: d.id }, d.data()); })
      .sort(function(a, b) {
        const fa = a.fecha && a.fecha.toDate ? a.fecha.toDate() : new Date(0);
        const fb = b.fecha && b.fecha.toDate ? b.fecha.toDate() : new Date(0);
        return fb - fa;
      });
    const totalHoy  = registros.reduce(function(s, r) { return s + (r.monto || 0); }, 0);
    document.getElementById('cierre-total-hoy').textContent = 'Total hoy: ' + formatPrecioLocal(totalHoy);

    contenedor.innerHTML = registros.map(function(r) {
      const hora = r.fecha && r.fecha.toDate
        ? r.fecha.toDate().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
        : '--:--';
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #f1f5f9;font-size:13px;">' +
        '<div>' +
          '<span style="color:#64748b">' + hora + '</span>' +
          (r.notas ? '<span style="color:#94a3b8;margin-left:6px">· ' + r.notas + '</span>' : '') +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:10px">' +
          '<strong style="color:#16a34a">' + formatPrecioLocal(r.monto) + '</strong>' +
          '<button onclick="eliminarCierrePetShop(\'' + r.id + '\')" style="background:none;border:none;color:#ef4444;font-size:15px;cursor:pointer;padding:0 2px" title="Eliminar">🗑</button>' +
        '</div>' +
      '</div>';
    }).join('');
  } catch (err) {
    console.error(err);
    contenedor.innerHTML = '<p style="color:#ef4444;font-size:13px">Error al cargar historial.</p>';
  }
}

async function eliminarCierrePetShop(docId) {
  if (!confirm('Eliminar este registro de caja?')) return;
  try {
    await db.collection('caja_petshop').doc(docId).delete();
    mostrarToast('Registro eliminado');
    await cargarResumenCierrePetShop();
  } catch (err) {
    mostrarToast('Error al eliminar');
  }
}

// -----------------------------------------------------------
// UTILIDADES (sin cambios de comportamiento vs v15)
// -----------------------------------------------------------
function normalizar(str) {
  if (!str) return '';
  return str.toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function formatPrecioLocal(n) {
  if (typeof formatPrecio === 'function') return formatPrecio(n);
  return '$' + Math.round(n || 0).toLocaleString('es-AR');
}

function mostrarToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('visible');
  setTimeout(function() { t.classList.remove('visible'); }, 3000);
}

// -----------------------------------------------------------
// INICIALIZACION
// -----------------------------------------------------------
async function inicializarVender() {
  inicializarBuscador();
  restaurarCarritoDesdeCache();
  renderCarritoUnico();
  await Promise.all([cargarCatalogo(), cargarAccesorios()]);
  // Tras cargar catálogos, re-renderizar para reflejar stock real
  renderCarritoUnico();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', inicializarVender);
} else {
  inicializarVender();
}
