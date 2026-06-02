// ============================================================
//  vender.js  —  Módulo de Venta con Carrito
//  Fase 2: Catálogo desde Firestore + Buscador + Carrito  ✓
//  Fase 3: Motor FIFO + WriteBatch transaccional           ✓
//  Fase 4: Cierre Pet Shop (pendiente)
// ============================================================

// -----------------------------------------------------------
// ESTADO LOCAL
// -----------------------------------------------------------
let catalogoLocal = [];
let carrito       = [];

// Init al final del archivo

// -----------------------------------------------------------
// FASE 2.1 — CARGA DEL CATÁLOGO DESDE FIRESTORE
// -----------------------------------------------------------
async function cargarCatalogo() {
  try {
    mostrarEstadoCarga(true);

    // Solo bolsas — sin orderBy para no requerir índice Firestore
    const [snapProductos, snapPrecios] = await Promise.all([
      db.collection('productos').get(),
      db.collection('precios').get()
    ]);

    // Mapa de precios para bolsas (clave = "marca|nombre|peso" normalizado)
    const mapaPrecios = {};
    snapPrecios.docs.forEach(d => {
      const p = d.data();
      mapaPrecios[clavePrecio(p.marca, p.nombre, p.unidadPeso)] = {
        precioMinorista: p.precioMinorista || 0,
        precioMayorista: p.precioMayorista || 0
      };
    });

    // ── Bolsas ──────────────────────────────────────────────
    const bolsas = snapProductos.docs.map(doc => {
      const d     = doc.data();
      const precio = mapaPrecios[clavePrecio(d.marca, d.nombre, d.unidadPeso)];
      return {
        id:             doc.id,
        tipo:           'bolsa',
        nombre:         `${d.marca} — ${d.nombre}`,
        detalle:        [d.unidadPeso, d.especie].filter(Boolean).join(' · '),
        stock:          d.stockTotal || 0,
        precioVenta:    precio?.precioMinorista || 0,
        precioMay:      precio?.precioMayorista || 0,
        precioEditable: !precio || (precio.precioMinorista === 0),
        _busqueda:      normalizar(`${d.marca} ${d.nombre} ${d.unidadPeso || ''} ${d.especie || ''}`)
      };
    });

    catalogoLocal = [...bolsas];
    mostrarEstadoCarga(false);
    console.log(`Catálogo: ${bolsas.length} bolsas`);

  } catch (err) {
    console.error('Error cargando catálogo:', err);
    mostrarEstadoCarga(false, 'Error al cargar. Recargá la página.');
  }
}

const CATEGORIAS_LABEL = {
  accesorio: 'Accesorio', farmacia: 'Farmacia',
  plastico: 'Plástico', colchoneta: 'Colchoneta',
  higiene: 'Higiene', otro: 'Otro'
};

function clavePrecio(marca, nombre, unidadPeso) {
  return normalizar(`${marca}|${nombre}|${unidadPeso || ''}`);
}

function mostrarEstadoCarga(cargando, error = '') {
  const input = document.getElementById('input-busqueda');
  if (cargando) {
    input.placeholder = 'Cargando productos...';
    input.disabled = true;
  } else if (error) {
    input.placeholder = error;
    input.disabled = false;
  } else {
    input.placeholder = 'Buscar producto o accesorio...';
    input.disabled = false;
  }
}

// -----------------------------------------------------------
// FASE 2.2 — BUSCADOR UNIVERSAL
// -----------------------------------------------------------
function inicializarBuscador() {
  const input      = document.getElementById('input-busqueda');
  const resultados = document.getElementById('resultados-busqueda');

  input.addEventListener('input', () => {
    const q = input.value.trim();
    if (q.length < 2) { resultados.style.display = 'none'; return; }
    const encontrados = catalogoLocal
      .filter(p => p._busqueda.includes(normalizar(q)))
      .slice(0, 15);
    renderResultados(encontrados);
  });

  document.addEventListener('click', e => {
    if (!document.getElementById('wrap-busqueda').contains(e.target)) {
      resultados.style.display = 'none';
    }
  });
}

function renderResultados(items) {
  const contenedor = document.getElementById('resultados-busqueda');
  if (items.length === 0) {
    contenedor.innerHTML = '<div style="padding:14px;text-align:center;color:#94a3b8;font-size:13px">Sin resultados</div>';
    contenedor.style.display = 'block';
    return;
  }
  contenedor.innerHTML = items.map(p => {
    const sinStock  = (p.stock ?? 0) <= 0;
    const precioStr = p.precioVenta > 0
      ? formatPrecioLocal(p.precioVenta)
      : '<span style="color:#f97316;font-size:12px">Ingresar precio</span>';
    return `
      <div class="resultado-item ${sinStock ? 'resultado-sin-stock' : ''}"
           onclick="${sinStock ? '' : `agregarAlCarrito('${p.id}')`}">
        <div>
          <div class="resultado-nombre">
            <span class="badge-tipo ${p.tipo === 'bolsa' ? 'badge-bolsa' : 'badge-acc'}">
              ${p.tipo === 'bolsa' ? 'Bolsa' : 'Acc'}
            </span>
            ${p.nombre}
          </div>
          <div class="resultado-detalle">
            ${p.detalle}
            ${sinStock
              ? ' · <span style="color:#ef4444;font-weight:600">Sin stock</span>'
              : ` · Stock: ${p.stock}`}
          </div>
        </div>
        <div class="resultado-precio">${precioStr}</div>
      </div>`;
  }).join('');
  contenedor.style.display = 'block';
}

// -----------------------------------------------------------
// FASE 2.3 — CARRITO
// -----------------------------------------------------------
function agregarAlCarrito(productoId) {
  const producto = catalogoLocal.find(p => p.id === productoId);
  if (!producto || producto.stock <= 0) return;

  document.getElementById('resultados-busqueda').style.display = 'none';
  document.getElementById('input-busqueda').value = '';

  const existente = carrito.find(c => c.id === productoId);
  if (existente) {
    if (existente.cantidad < producto.stock) {
      existente.cantidad++;
    } else {
      mostrarToast('⚠️ No hay más stock disponible');
      return;
    }
  } else {
    carrito.push({ ...producto, cantidad: 1 });
  }
  renderCarrito();
}

function cambiarCantidad(productoId, delta) {
  const item = carrito.find(c => c.id === productoId);
  if (!item) return;
  const maxStock = catalogoLocal.find(p => p.id === productoId)?.stock ?? 9999;
  item.cantidad = Math.max(0, Math.min(item.cantidad + delta, maxStock));
  if (item.cantidad === 0) carrito = carrito.filter(c => c.id !== productoId);
  renderCarrito();
}

function quitarDelCarrito(productoId) {
  carrito = carrito.filter(c => c.id !== productoId);
  renderCarrito();
}

function actualizarPrecioCarrito(productoId, valor) {
  const item = carrito.find(c => c.id === productoId);
  if (item) item.precioVenta = parseFloat(valor) || 0;
  actualizarTotal();
}

function renderCarrito() {
  const lista   = document.getElementById('carrito-lista');
  const count   = document.getElementById('carrito-count');
  const btnConf = document.getElementById('btn-confirmar');

  if (carrito.length === 0) {
    lista.innerHTML = `
      <div style="text-align:center;padding:28px 16px 20px;display:flex;flex-direction:column;align-items:center;gap:8px">
        <div style="font-size:44px;line-height:1">🛒</div>
        <div style="font-size:15px;font-weight:700;color:#1e293b">Carrito vacío</div>
        <div style="font-size:13px;color:#94a3b8;max-width:240px;text-align:center">
          Usá el buscador de arriba para agregar productos
        </div>
      </div>`;
    count.textContent = '';
    document.getElementById('total-carrito').textContent = '$0';
    btnConf.disabled = true;
    return;
  }

  count.textContent = `(${carrito.length})`;
  btnConf.disabled  = false;

  lista.innerHTML = carrito.map(item => {
    const subtotal    = (item.precioVenta || 0) * item.cantidad;
    const precioHtml  = item.precioEditable
      ? `<input type="number" min="0" value="${item.precioVenta || ''}" placeholder="$ precio"
           onchange="actualizarPrecioCarrito('${item.id}', this.value)"
           style="width:100px;padding:4px 8px;border:1.5px solid #fbbf24;border-radius:8px;font-size:13px;font-weight:700;color:#92400e">`
      : `<span class="ci-subtotal">${formatPrecioLocal(item.precioVenta)} c/u</span>`;

    return `
      <div class="carrito-item">
        <div>
          <div class="ci-nombre">${item.nombre}</div>
          <div class="ci-detalle">${item.detalle}</div>
          <div style="margin-top:5px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            ${precioHtml}
            ${item.cantidad > 1 || !item.precioEditable
              ? `<span class="ci-subtotal">= ${formatPrecioLocal(subtotal)}</span>`
              : ''}
          </div>
        </div>
        <div class="ci-controles">
          <button class="ci-btn" onclick="cambiarCantidad('${item.id}', -1)">−</button>
          <span class="ci-cant">${item.cantidad}</span>
          <button class="ci-btn" onclick="cambiarCantidad('${item.id}', 1)">+</button>
          <button class="ci-btn eliminar" onclick="quitarDelCarrito('${item.id}')">🗑</button>
        </div>
      </div>`;
  }).join('');

  actualizarTotal();
}

function actualizarTotal() {
  const total = carrito.reduce((s, c) => s + (c.precioVenta || 0) * c.cantidad, 0);
  document.getElementById('total-carrito').textContent = formatPrecioLocal(total);
}

// -----------------------------------------------------------
// FASE 3 — MOTOR DE DESCUENTO DE STOCK REAL
// -----------------------------------------------------------
async function confirmarVenta() {
  if (carrito.length === 0) return;

  // Validar precios antes de continuar
  const sinPrecio = carrito.filter(c => !c.precioVenta || c.precioVenta <= 0);
  if (sinPrecio.length > 0) {
    mostrarToast(`⚠️ Ingresá el precio de: ${sinPrecio.map(p => p.nombre).join(', ')}`);
    return;
  }

  const btn = document.getElementById('btn-confirmar');
  btn.disabled = true;
  btn.textContent = '⏳ Procesando...';

  try {
    // ── PASO 1: Leer todos los lotes necesarios para bolsas ─────────────────
    // (las lecturas deben ir ANTES de la transacción para calcular FIFO)
    const datosBolsas = [];  // { item, lotes: [{ref, cantidadRestante, costoUnitario}] }

    for (const item of carrito) {
      if (item.tipo !== 'bolsa') continue;

      const productoRef = db.collection('productos').doc(item.id);
      const lotesSnap   = await productoRef.collection('lotes')
        .orderBy('fechaCompra', 'asc')
        .get();

      const lotes = lotesSnap.docs
        .map(d => ({ ref: d.ref, ...d.data() }))
        .filter(l => l.cantidadRestante > 0);

      // Verificar stock suficiente en lotes
      const stockEnLotes = lotes.reduce((s, l) => s + l.cantidadRestante, 0);
      if (stockEnLotes < item.cantidad) {
        mostrarToast(`❌ Stock insuficiente en lotes para: ${item.nombre}`);
        btn.disabled = false;
        btn.textContent = '✓ Confirmar venta';
        return;
      }

      datosBolsas.push({ item, productoRef, lotes });
    }

    // ── PASO 2: Calcular FIFO para cada bolsa ───────────────────────────────
    // Fuera de la transacción para evitar lecturas dentro de ella
    const operacionesBolsas = datosBolsas.map(({ item, productoRef, lotes }) => {
      let restante      = item.cantidad;
      let costoFIFO     = 0;
      const loteUpdates = [];

      for (const lote of lotes) {
        if (restante <= 0) break;
        const tomados  = Math.min(lote.cantidadRestante, restante);
        costoFIFO     += tomados * lote.costoUnitario;
        restante       -= tomados;
        loteUpdates.push({ ref: lote.ref, nuevaCantidad: lote.cantidadRestante - tomados });
      }

      return {
        item,
        productoRef,
        loteUpdates,
        costoFIFO,
        totalVenta:  item.precioVenta * item.cantidad,
        ganancia:    (item.precioVenta * item.cantidad) - costoFIFO
      };
    });

    // ── PASO 4: WriteBatch — todas las escrituras atómicas ──────────────────
    const batch = db.batch();

    // 4a. Actualizar lotes y stockTotal de bolsas
    for (const op of operacionesBolsas) {
      for (const lu of op.loteUpdates) {
        batch.update(lu.ref, { cantidadRestante: lu.nuevaCantidad });
      }
      batch.update(op.productoRef, {
        stockTotal: firebase.firestore.FieldValue.increment(-op.item.cantidad)
      });
    }

    // 4b. Calcular totales globales de la venta (solo bolsas)
    const todasLasOps   = [...operacionesBolsas];
    const totalVenta    = todasLasOps.reduce((s, op) => s + op.totalVenta, 0);
    const costoTotal    = todasLasOps.reduce((s, op) => s + (op.costoFIFO ?? op.costoTotal ?? 0), 0);
    const gananciaTotal = todasLasOps.reduce((s, op) => s + op.ganancia, 0);

    // 4d. Registrar documento en colección 'ventas'
    const ventaRef = db.collection('ventas').doc();
    batch.set(ventaRef, {
      fecha:       firebase.firestore.FieldValue.serverTimestamp(),
      items:       carrito.map(item => ({
        id:          item.id,
        tipo:        item.tipo,
        padreId:     item.padreId || null,
        nombre:      item.nombre,
        cantidad:    item.cantidad,
        precioVenta: item.precioVenta,
        subtotal:    item.precioVenta * item.cantidad,
        costo:       item.costo || 0
      })),
      totalVenta,
      costoTotal,
      ganancia:    gananciaTotal,
      origen:      'vender'
    });

    // 4e. Ejecutar todo de una vez
    await batch.commit();

    // ── PASO 5: Limpiar y actualizar UI ─────────────────────────────────────
    // Actualizar stock en catalogoLocal para que el buscador refleje los nuevos valores
    for (const op of operacionesBolsas) {
      const enCatalogo = catalogoLocal.find(p => p.id === op.item.id);
      if (enCatalogo) enCatalogo.stock -= op.item.cantidad;
    }
    carrito = [];
    renderCarrito();
    mostrarToast(`✅ Venta confirmada — Ganancia: ${formatPrecioLocal(gananciaTotal)}`);

  } catch (err) {
    console.error('Error al confirmar venta:', err);
    mostrarToast('❌ Error al procesar la venta. Intentá de nuevo.');
  } finally {
    btn.disabled = false;
    btn.textContent = '✓ Confirmar venta';
  }
}

// -----------------------------------------------------------
// FASE 4 — CIERRE DIARIO PET SHOP
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
  const notas = (document.getElementById('input-cierre-notas')?.value || '').trim();
  const tipo  = document.getElementById('select-cierre-tipo')?.value || 'cierre';

  if (isNaN(monto) || monto < 0) {
    mostrarToast('⚠️ Ingresá un monto válido');
    return;
  }

  const btn = document.getElementById('btn-guardar-cierre');
  btn.disabled = true;
  btn.textContent = 'Guardando...';

  try {
    const ahora = new Date();
    await db.collection('caja_petshop').add({
      fecha:     firebase.firestore.FieldValue.serverTimestamp(),
      fechaISO:  ahora.toISOString().slice(0, 10),
      monto,
      notas:     notas || '',
      tipo,
      origen:    'cierre_diario'
    });

    const tipoLabel = { accesorios: 'Accesorios', farmacia: 'Farmacia', cierre: 'Cierre diario', otro: 'Otro' };
    mostrarToast(`✅ ${tipoLabel[tipo] || tipo}: ${formatPrecioLocal(monto)}`);
    document.getElementById('input-cierre-monto').value = '';
    if (document.getElementById('input-cierre-notas')) {
      document.getElementById('input-cierre-notas').value = '';
    }
    await cargarResumenCierrePetShop();

  } catch (err) {
    console.error('Error guardando cierre Pet Shop:', err);
    mostrarToast('❌ Error al guardar. Intentá de nuevo.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Guardar';
  }
}

async function cargarResumenCierrePetShop() {
  const contenedor = document.getElementById('cierre-historial');
  if (!contenedor) return;

  const hoyISO = new Date().toISOString().slice(0, 10);

  try {
    const snap = await db.collection('caja_petshop')
      .where('fechaISO', '==', hoyISO)
      .orderBy('fecha', 'desc')
      .get();

    if (snap.empty) {
      contenedor.innerHTML = '<p style="color:#94a3b8;font-size:13px;margin:8px 0 0">Sin registros hoy.</p>';
      document.getElementById('cierre-total-hoy').textContent = '';
      return;
    }

    const registros = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const totalHoy  = registros.reduce((s, r) => s + (r.monto || 0), 0);

    document.getElementById('cierre-total-hoy').textContent =
      `Total hoy: ${formatPrecioLocal(totalHoy)}`;

    const TIPO_LABEL = { accesorios: '🧸 Accesorios', farmacia: '💊 Farmacia', cierre: '🏪 Cierre', otro: '📦 Otro' };
    contenedor.innerHTML = registros.map(r => {
      const hora = r.fecha?.toDate
        ? r.fecha.toDate().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
        : '--:--';
      const tipoTag = r.tipo ? `<span style="background:#f1f5f9;color:#475569;font-size:11px;font-weight:700;padding:1px 7px;border-radius:8px;margin-right:5px">${TIPO_LABEL[r.tipo] || r.tipo}</span>` : '';
      return `
        <div style="display:flex;justify-content:space-between;align-items:center;
                    padding:7px 0;border-bottom:1px solid #f1f5f9;font-size:13px;">
          <div>
            ${tipoTag}<span style="color:#64748b">${hora}</span>
            ${r.notas ? `<span style="color:#94a3b8;margin-left:6px">· ${r.notas}</span>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <strong style="color:#16a34a">${formatPrecioLocal(r.monto)}</strong>
            <button onclick="eliminarCierrePetShop('${r.id}')"
              style="background:none;border:none;color:#ef4444;font-size:15px;cursor:pointer;padding:0 2px"
              title="Eliminar">🗑</button>
          </div>
        </div>`;
    }).join('');

  } catch (err) {
    console.error('Error cargando historial cierre:', err);
    contenedor.innerHTML = '<p style="color:#ef4444;font-size:13px">Error al cargar historial.</p>';
  }
}

async function eliminarCierrePetShop(docId) {
  if (!confirm('¿Eliminar este registro de caja?')) return;
  try {
    await db.collection('caja_petshop').doc(docId).delete();
    mostrarToast('Registro eliminado');
    await cargarResumenCierrePetShop();
  } catch (err) {
    mostrarToast('❌ Error al eliminar');
  }
}

// -----------------------------------------------------------
// UTILIDADES
// -----------------------------------------------------------
function normalizar(str) {
  if (!str) return '';
  return str.toString().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function formatPrecioLocal(n) {
  if (typeof formatPrecio === 'function') return formatPrecio(n);
  return '$' + Math.round(n || 0).toLocaleString('es-AR');
}

function mostrarToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('visible');
  setTimeout(() => t.classList.remove('visible'), 3000);
}

// -----------------------------------------------------------
// INICIALIZACIÓN — al final para que todas las funciones estén definidas
// -----------------------------------------------------------
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    inicializarBuscador();
    renderCarrito();
    cargarCatalogo();
  });
} else {
  inicializarBuscador();
  renderCarrito();
  cargarCatalogo();
}
                               