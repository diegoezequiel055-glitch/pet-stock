// =============================================
// audio.js
// Módulo de entrada por voz (SpeechRecognition)
// Funciona en Chrome y Edge. NO funciona en Firefox.
// =============================================
// Comandos reconocidos:
//   VENTA:  "vendí [cantidad] [producto] a [precio]"
//           "vendi dos royal canin a veinte mil"
//   STOCK:  "agregué [cantidad] [producto] costo [precio]"
//           "agregue doce bolsas costo quince mil"

// =============================================
// INICIALIZACIÓN
// =============================================
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let reconocedor = null;
let audioActivo = false;

// Números escritos en palabras (español argentino)
const NUMEROS_TEXTO = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
  seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
  dieciséis: 16, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, veintiuno: 21, veintidós: 22, veintidos: 22,
  veintitrés: 23, veintitres: 23, veinticuatro: 24, veinticinco: 25,
  treinta: 30, cuarenta: 40, cincuenta: 50,
  cien: 100, ciento: 100, doscientos: 200, trescientos: 300,
  mil: 1000, 'diez mil': 10000, 'quince mil': 15000, 'veinte mil': 20000,
  'veinticinco mil': 25000, 'treinta mil': 30000, 'cuarenta mil': 40000,
  'cincuenta mil': 50000, 'cien mil': 100000
};

function textoANumero(texto) {
  texto = texto.trim().toLowerCase();
  // Si ya es número directo
  const directo = parseFloat(texto.replace(',', '.'));
  if (!isNaN(directo)) return directo;
  // Buscar en mapa de palabras (frases primero)
  const frases = Object.keys(NUMEROS_TEXTO).sort((a, b) => b.length - a.length);
  for (const frase of frases) {
    if (texto === frase) return NUMEROS_TEXTO[frase];
  }
  return null;
}

// =============================================
// PARSEO DEL TEXTO DE VOZ
// =============================================
function parsearComando(texto) {
  texto = texto.toLowerCase().trim();
  console.log('[Audio] Texto recibido:', texto);

  // --- PATRÓN VENTA ---
  // "vendí X [unidades de] PRODUCTO a PRECIO [pesos]"
  const matchVenta = texto.match(
    /vend[ií]\s+(.+?)\s+(?:unidades?\s+(?:de\s+)?)?([\w\s]+?)\s+a\s+(.+?)(?:\s+pesos)?$/
  );
  if (matchVenta) {
    const cantidad = textoANumero(matchVenta[1]);
    const producto = matchVenta[2].trim();
    const precio   = textoANumero(matchVenta[3]);
    if (cantidad && precio) {
      return { tipo: 'venta', cantidad, producto, precio };
    }
  }

  // --- PATRÓN STOCK ---
  // "agregué X [de] PRODUCTO costo PRECIO"
  const matchStock = texto.match(
    /agregu[eé]\s+(.+?)\s+(?:de\s+)?([\w\s]+?)\s+costo\s+(.+?)(?:\s+pesos)?$/
  );
  if (matchStock) {
    const cantidad = textoANumero(matchStock[1]);
    const producto = matchStock[2].trim();
    const costo    = textoANumero(matchStock[3]);
    if (cantidad && costo) {
      return { tipo: 'stock', cantidad, producto, costo };
    }
  }

  return null;
}

// =============================================
// MOSTRAR RESULTADO EN EL PANEL
// =============================================
function mostrarResultadoAudio(comando, textoOriginal) {
  const panel = document.getElementById('audio-resultado');
  const textoEl = document.getElementById('audio-texto-reconocido');
  if (!panel || !textoEl) return;

  textoEl.textContent = `"${textoOriginal}"`;

  if (!comando) {
    panel.className = 'audio-panel audio-error';
    document.getElementById('audio-interpretacion').textContent =
      '❌ No se reconoció el comando. Intentá de nuevo.';
    document.getElementById('audio-acciones').innerHTML = '';
    return;
  }

  panel.className = 'audio-panel audio-ok';

  if (comando.tipo === 'venta') {
    document.getElementById('audio-interpretacion').innerHTML =
      `✅ <strong>VENTA:</strong> ${comando.cantidad} unidad/es de "<em>${comando.producto}</em>" a ${formatPrecio(comando.precio)} c/u`;
    document.getElementById('audio-acciones').innerHTML = `
      <button class="btn btn-azul" onclick="confirmarVentaAudio(${JSON.stringify(comando).replace(/"/g, '&quot;')})">
        Confirmar venta
      </button>
      <button class="btn btn-outline" onclick="descartarAudio()">Cancelar</button>`;
  } else if (comando.tipo === 'stock') {
    document.getElementById('audio-interpretacion').innerHTML =
      `✅ <strong>STOCK:</strong> +${comando.cantidad} unidades de "<em>${comando.producto}</em>", costo ${formatPrecio(comando.costo)}`;
    document.getElementById('audio-acciones').innerHTML = `
      <button class="btn btn-verde" onclick="confirmarStockAudio(${JSON.stringify(comando).replace(/"/g, '&quot;')})">
        Confirmar ingreso
      </button>
      <button class="btn btn-outline" onclick="descartarAudio()">Cancelar</button>`;
  }
}

function descartarAudio() {
  const panel = document.getElementById('audio-resultado');
  if (panel) panel.className = 'audio-panel audio-vacio';
  document.getElementById('audio-interpretacion').textContent = 'Esperando comando...';
  document.getElementById('audio-acciones').innerHTML = '';
}

// =============================================
// CONFIRMAR ACCIONES (llamar a módulos externos)
// =============================================
// Estas funciones buscan el producto en los cachés existentes y ejecutan la acción.
// Si no encuentra el producto exacto, muestra opciones similares.

async function confirmarVentaAudio(cmd) {
  // Buscar en bolsas
  const enBolsas = (typeof productosCache !== 'undefined')
    ? productosCache.filter(p => normalizar(p.nombre + ' ' + p.marca).includes(normalizar(cmd.producto)))
    : [];

  // Buscar en accesorios
  const enAccesorios = (typeof accesoriosCache !== 'undefined')
    ? accesoriosCache.filter(a => normalizar(a.nombre + ' ' + (a.marca || '')).includes(normalizar(cmd.producto)))
    : [];

  const todos = [
    ...enBolsas.map(p => ({ ...p, _tipo: 'bolsa' })),
    ...enAccesorios.map(a => ({ ...a, _tipo: 'accesorio' }))
  ];

  if (todos.length === 0) {
    mostrarAlerta(`No se encontró "${cmd.producto}" en el stock`, 'error');
    return;
  }

  if (todos.length === 1) {
    // Coincidencia única → ejecutar directamente
    const item = todos[0];
    if (item._tipo === 'bolsa') {
      productoSeleccionadoId = item.id;
      document.getElementById('venta-cantidad').value = cmd.cantidad;
      document.getElementById('venta-precio').value   = cmd.precio;
      await registrarVentaDesdeAudio(item, cmd);
    } else {
      accSeleccionadoId = item.id;
      document.getElementById('vacc-cantidad').value = cmd.cantidad;
      document.getElementById('vacc-precio').value   = cmd.precio;
      await registrarVentaAccDesdeAudio(item, cmd);
    }
  } else {
    // Múltiples coincidencias → mostrar lista para elegir
    const lista = todos.map(t =>
      `<li style="cursor:pointer;padding:6px 0;border-bottom:1px solid #eee"
          onclick="seleccionarProductoAudio('${t.id}','${t._tipo}',${JSON.stringify(cmd).replace(/"/g,'&quot;')})">
        ${t._tipo === 'bolsa' ? '📦' : '🧸'} <strong>${t.marca || ''}</strong> ${t.nombre} — Stock: ${t.stock || t.stockTotal || 0}
      </li>`
    ).join('');
    document.getElementById('audio-interpretacion').innerHTML =
      `⚠️ Encontré ${todos.length} productos similares. ¿Cuál es?<ul style="margin-top:8px">${lista}</ul>`;
    document.getElementById('audio-acciones').innerHTML =
      `<button class="btn btn-outline" onclick="descartarAudio()">Cancelar</button>`;
  }
}

async function registrarVentaDesdeAudio(item, cmd) {
  try {
    const productoRef = db.collection('productos').doc(item.id);
    const lotesSnap = await productoRef.collection('lotes')
      .orderBy('fechaCompra', 'asc').get();

    const lotes = lotesSnap.docs
      .map(d => ({ id: d.id, ref: d.ref, ...d.data() }))
      .filter(l => l.cantidadRestante > 0);
    let resta = cmd.cantidad, costoTotal = 0;
    const updates = [];

    for (const l of lotes) {
      if (resta <= 0) break;
      const tomados = Math.min(l.cantidadRestante, resta);
      costoTotal += tomados * l.costoUnitario;
      resta      -= tomados;
      updates.push({ ref: l.ref, nueva: l.cantidadRestante - tomados });
    }

    if (resta > 0) { mostrarAlerta('Stock insuficiente', 'error'); return; }

    await db.runTransaction(async t => {
      updates.forEach(u => t.update(u.ref, { cantidadRestante: u.nueva }));
      t.update(productoRef, { stockTotal: firebase.firestore.FieldValue.increment(-cmd.cantidad) });
      t.set(db.collection('ventas').doc(), {
        tipo: 'bolsa', productoId: item.id,
        nombreProducto: `${item.marca} - ${item.nombre}`,
        cantidad: cmd.cantidad, precioVenta: cmd.precio,
        totalVenta: cmd.precio * cmd.cantidad,
        costoFIFO: costoTotal,
        ganancia: (cmd.precio * cmd.cantidad) - costoTotal,
        cliente: 'Por voz', origenAudio: true,
        fecha: firebase.firestore.FieldValue.serverTimestamp()
      });
    });

    mostrarAlerta(`✅ Venta registrada por voz: ${cmd.cantidad} ${item.nombre}`, 'success');
    descartarAudio();
    if (typeof cargarProductos === 'function') cargarProductos();
  } catch (err) {
    console.error(err);
    mostrarAlerta('Error al registrar la venta', 'error');
  }
}

async function registrarVentaAccDesdeAudio(item, cmd) {
  const ganancia = (cmd.precio - item.costo) * cmd.cantidad;
  try {
    const batch = db.batch();
    batch.update(db.collection('accesorios').doc(item.id), {
      stock: firebase.firestore.FieldValue.increment(-cmd.cantidad)
    });
    batch.set(db.collection('ventas').doc(), {
      tipo: 'accesorio', productoId: item.id,
      nombreProducto: item.nombre, categoria: item.categoria,
      cantidad: cmd.cantidad, precioVenta: cmd.precio,
      totalVenta: cmd.precio * cmd.cantidad,
      costo: item.costo * cmd.cantidad, ganancia,
      cliente: 'Por voz', origenAudio: true,
      fecha: firebase.firestore.FieldValue.serverTimestamp()
    });
    await batch.commit();
    mostrarAlerta(`✅ Venta registrada por voz: ${cmd.cantidad} ${item.nombre}`, 'success');
    descartarAudio();
    if (typeof cargarAccesorios === 'function') cargarAccesorios();
  } catch (err) {
    console.error(err);
    mostrarAlerta('Error al registrar la venta', 'error');
  }
}

async function confirmarStockAudio(cmd) {
  // Similar: buscar producto y sumar stock
  const enBolsas = (typeof productosCache !== 'undefined')
    ? productosCache.filter(p => normalizar(p.nombre + ' ' + p.marca).includes(normalizar(cmd.producto)))
    : [];
  const enAccesorios = (typeof accesoriosCache !== 'undefined')
    ? accesoriosCache.filter(a => normalizar(a.nombre + ' ' + (a.marca || '')).includes(normalizar(cmd.producto)))
    : [];

  if (enBolsas.length === 1) {
    const p = enBolsas[0];
    productoSeleccionadoId = p.id;
    // Abrir modal de lote prellenado
    abrirModalLote(p.id);
    document.getElementById('lote-cantidad').value = cmd.cantidad;
    document.getElementById('lote-costo').value    = cmd.costo;
    mostrarAlerta(`Revisá los datos del lote y confirmá`, 'warning');
    descartarAudio();
  } else if (enAccesorios.length === 1) {
    await db.collection('accesorios').doc(enAccesorios[0].id).update({
      stock: firebase.firestore.FieldValue.increment(cmd.cantidad)
    });
    mostrarAlerta(`✅ +${cmd.cantidad} ${enAccesorios[0].nombre} sumados al stock`, 'success');
    descartarAudio();
    if (typeof cargarAccesorios === 'function') cargarAccesorios();
  } else {
    mostrarAlerta(`No se encontró "${cmd.producto}" o hay múltiples coincidencias`, 'error');
  }
}

// =============================================
// CONTROL DEL MICRÓFONO
// =============================================
function iniciarAudio() {
  if (!SpeechRecognition) {
    mostrarAlerta('Tu navegador no soporta entrada por voz. Usá Chrome o Edge.', 'error');
    return;
  }

  if (audioActivo) {
    detenerAudio();
    return;
  }

  reconocedor = new SpeechRecognition();
  reconocedor.lang = 'es-AR';
  reconocedor.continuous = false;
  reconocedor.interimResults = false;
  reconocedor.maxAlternatives = 1;

  reconocedor.onstart = () => {
    audioActivo = true;
    actualizarBotonAudio(true);
    document.getElementById('audio-interpretacion').textContent = '🎙️ Escuchando...';
  };

  reconocedor.onresult = (event) => {
    const texto   = event.results[0][0].transcript;
    const comando = parsearComando(texto);
    mostrarResultadoAudio(comando, texto);
  };

  reconocedor.onerror = (event) => {
    console.error('[Audio] Error:', event.error);
    const msg = event.error === 'no-speech'
      ? 'No se detectó voz. Intentá de nuevo.'
      : `Error de micrófono: ${event.error}`;
    mostrarAlerta(msg, 'error');
    detenerAudio();
  };

  reconocedor.onend = () => {
    detenerAudio();
  };

  reconocedor.start();
}

function detenerAudio() {
  audioActivo = false;
  actualizarBotonAudio(false);
  if (reconocedor) {
    try { reconocedor.stop(); } catch (_) {}
  }
}

function actualizarBotonAudio(activo) {
  const btn = document.getElementById('btn-audio');
  if (!btn) return;
  btn.textContent = activo ? '⏹ Detener' : '🎙️ Hablar';
  btn.className   = activo ? 'btn btn-rojo' : 'btn btn-verde';
}

// =============================================
// DICTAR CAMPO — voz directa a un input del formulario
// =============================================
let _dictadoActivo = false;
let _reconocedorCampo = null;
let _btnDictadoActual = null;

function dictarCampo(inputId, esNumero) {
  const input = document.getElementById(inputId);
  if (!input) return;

  if (!SpeechRecognition) {
    mostrarAlerta('Tu navegador no soporta voz. Usá Chrome o Edge.', 'error');
    return;
  }

  // Si ya está escuchando, detener
  if (_dictadoActivo) {
    if (_reconocedorCampo) try { _reconocedorCampo.stop(); } catch (_) {}
    return;
  }

  _btnDictadoActual = document.querySelector('[data-mic="' + inputId + '"]');

  _reconocedorCampo = new SpeechRecognition();
  _reconocedorCampo.lang = 'es-AR';
  _reconocedorCampo.continuous = false;
  _reconocedorCampo.interimResults = false;

  _reconocedorCampo.onstart = () => {
    _dictadoActivo = true;
    if (_btnDictadoActual) {
      _btnDictadoActual.textContent = '⏹';
      _btnDictadoActual.classList.add('dictando');
    }
    mostrarAlerta('🎙️ Escuchando...', 'success');
  };

  _reconocedorCampo.onresult = (event) => {
    let texto = event.results[0][0].transcript.trim();
    if (esNumero) {
      const num = textoANumero(texto);
      input.value = num !== null ? num : '';
    } else {
      // Capitalizar primera letra
      input.value = texto.charAt(0).toUpperCase() + texto.slice(1);
    }
    input.dispatchEvent(new Event('input'));
  };

  _reconocedorCampo.onend = () => {
    _dictadoActivo = false;
    if (_btnDictadoActual) {
      _btnDictadoActual.textContent = '🎙️';
      _btnDictadoActual.classList.remove('dictando');
    }
  };

  _reconocedorCampo.onerror = (event) => {
    _dictadoActivo = false;
    if (_btnDictadoActual) {
      _btnDictadoActual.textContent = '🎙️';
      _btnDictadoActual.classList.remove('dictando');
    }
    if (event.error !== 'no-speech') {
      mostrarAlerta('Error de micrófono: ' + event.error, 'error');
    }
  };

  _reconocedorCampo.start();
}
