// =============================================
// venta-local.js
// Módulo de ventas del local físico
// Colección Firestore: ventasLocal
// =============================================

// API key de Gemini guardada en el navegador (no en el código)
function obtenerGeminiKey() {
  let key = localStorage.getItem('gemini-api-key');
  if (!key) {
    key = prompt(
      '🔑 Ingresá tu API key de Gemini (aistudio.google.com)\n\nSe guarda en este dispositivo y no se sube a ningún lado:'
    );
    if (key && key.trim()) {
      localStorage.setItem('gemini-api-key', key.trim());
    }
  }
  return key ? key.trim() : null;
}

function olvidarGeminiKey() {
  localStorage.removeItem('gemini-api-key');
  mostrarAlerta('API key eliminada del dispositivo', 'success');
}

// ---- ESTADO ----
let ventasLocalCache = [];
let periodoActual    = 'mes';

// =============================================
// CARGAR VENTAS
// =============================================
async function cargarVentasLocales() {
  try {
    const snap = await db.collection('ventasLocal')
      .orderBy('fecha', 'desc')
      .limit(500)
      .get();

    ventasLocalCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    aplicarFiltroLocal(periodoActual);

  } catch (err) {
    console.error(err);
    document.getElementById('lista-ventas-local').innerHTML =
      '<div class="sin-ventas">Error al cargar las ventas.</div>';
  }
}

// =============================================
// FILTROS DE PERÍODO
// =============================================
function filtroRapidoLocal(periodo) {
  periodoActual = periodo;
  aplicarFiltroLocal(periodo);
}

function aplicarFiltroLocal(periodo) {
  const ahora  = new Date();
  const hoy    = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const finHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 23, 59, 59);

  let desde = null;
  if (periodo === 'hoy') {
    desde = hoy;
  } else if (periodo === 'semana') {
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
    desde = lunes;
  } else if (periodo === 'mes') {
    desde = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
  }

  const filtrada = ventasLocalCache.filter(v => {
    if (!desde) return true;
    const fecha = v.fecha?.toDate ? v.fecha.toDate() : new Date(v.fecha);
    return fecha >= desde;
  });

  renderResumenLocal(filtrada);
  renderTablaVentasLocales(filtrada);
}

// =============================================
// RESUMEN (tarjetas)
// =============================================
function renderResumenLocal(lista) {
  const ahora   = new Date();
  const hoy     = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);

  const ventasHoy = lista.filter(v => {
    const f = v.fecha?.toDate ? v.fecha.toDate() : new Date(v.fecha);
    return f >= hoy;
  });
  const ventasMes = lista.filter(v => {
    const f = v.fecha?.toDate ? v.fecha.toDate() : new Date(v.fecha);
    return f >= inicioMes;
  });

  const cantHoy       = ventasHoy.length;
  const facturadoHoy  = ventasHoy.reduce((s, v) => s + (v.totalVenta || 0), 0);
  const facturadoMes  = ventasMes.reduce((s, v) => s + (v.totalVenta || 0), 0);

  document.getElementById('res-cantidad-hoy').textContent    = cantHoy;
  document.getElementById('res-facturado-hoy').textContent   = formatPrecio(facturadoHoy);
  document.getElementById('res-facturado-mes').textContent   = formatPrecio(facturadoMes);
}

// =============================================
// RENDER TABLA
// =============================================
function renderTablaVentasLocales(lista) {
  const contenedor = document.getElementById('lista-ventas-local');

  if (lista.length === 0) {
    contenedor.innerHTML = '<div class="sin-ventas">Sin ventas en este período</div>';
    return;
  }

  contenedor.innerHTML = lista.map(v => {
    const fecha  = v.fecha?.toDate ? v.fecha.toDate() : new Date(v.fecha);
    const fechaStr = fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
    const horaStr  = fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    const items    = v.items || [];
    const origenLabel = v.origen === 'foto' ? '📷 foto' : '✏️ manual';
    const origenClass = v.origen === 'foto' ? 'foto' : 'manual';

    const filaItems = items.map(it => `
      <tr>
        <td>${it.descripcion || '—'}</td>
        <td style="text-align:center">${it.cantidad || 1}</td>
        <td>${formatPrecio(it.precioUnitario || 0)}</td>
        <td style="font-weight:600">${formatPrecio((it.cantidad || 1) * (it.precioUnitario || 0))}</td>
      </tr>`).join('');

    return `
      <div class="fila-venta-local" id="fvl-${v.id}">
        <div class="fvl-header" onclick="toggleDetalleLocal(this)">
          <span class="fvl-fecha">${fechaStr} ${horaStr}</span>
          <span class="fvl-origen ${origenClass}">${origenLabel}</span>
          <span class="fvl-total">${formatPrecio(v.totalVenta || 0)}</span>
          <span class="fvl-chevron">▾</span>
        </div>
        <div class="fvl-detalle">
          <table class="fvl-tabla">
            <thead><tr>
              <th>Descripción</th>
              <th style="text-align:center">Cant.</th>
              <th>Precio unit.</th>
              <th>Total</th>
            </tr></thead>
            <tbody>${filaItems}</tbody>
          </table>
          <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px">
            <button class="btn btn-sm btn-rojo" onclick="eliminarVentaLocal('${v.id}')">🗑 Eliminar</button>
          </div>
        </div>
      </div>`;
  }).join('');
}

function toggleDetalleLocal(header) {
  const detalle = header.nextElementSibling;
  const abierto = header.classList.toggle('abierta');
  detalle.classList.toggle('visible', abierto);
}

// =============================================
// ELIMINAR VENTA
// =============================================
async function eliminarVentaLocal(id) {
  if (!confirm('¿Eliminar esta venta?')) return;
  try {
    await db.collection('ventasLocal').doc(id).delete();
    mostrarAlerta('Venta eliminada', 'success');
    cargarVentasLocales();
  } catch (err) {
    console.error(err);
    mostrarAlerta('Error al eliminar', 'error');
  }
}

// =============================================
// MODAL CARGA MANUAL
// =============================================
let contadorItems = 0;

function abrirModalManual() {
  contadorItems = 0;
  document.getElementById('items-manual').innerHTML = '';
  agregarItemManual();
  actualizarTotalManual();
  abrirModal('modal-manual');
}

function agregarItemManual() {
  contadorItems++;
  const id = `item-${contadorItems}`;
  const div = document.createElement('div');
  div.className = 'item-row';
  div.id = id;
  div.innerHTML = `
    <input type="text"   placeholder="Descripción" class="im-desc">
    <input type="number" placeholder="1" min="1" value="1" class="im-cant" oninput="actualizarTotalManual()">
    <input type="number" placeholder="0" min="0" step="1" class="im-precio" oninput="actualizarTotalManual()">
    <button class="btn-quitar-item" onclick="quitarItemManual('${id}')">✕</button>`;
  document.getElementById('items-manual').appendChild(div);
}

function quitarItemManual(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
  actualizarTotalManual();
}

function actualizarTotalManual() {
  const rows = document.querySelectorAll('#items-manual .item-row');
  let total = 0;
  rows.forEach(row => {
    const cant   = parseFloat(row.querySelector('.im-cant')?.value)   || 0;
    const precio = parseFloat(row.querySelector('.im-precio')?.value) || 0;
    total += cant * precio;
  });
  document.getElementById('total-manual').textContent = formatPrecio(total);
}

async function confirmarVentaManual() {
  const rows = document.querySelectorAll('#items-manual .item-row');
  const items = [];
  let total = 0;

  rows.forEach(row => {
    const desc   = row.querySelector('.im-desc')?.value.trim()         || '';
    const cant   = parseFloat(row.querySelector('.im-cant')?.value)    || 1;
    const precio = parseFloat(row.querySelector('.im-precio')?.value)  || 0;
    if (desc) {
      items.push({ descripcion: desc, cantidad: cant, precioUnitario: precio, total: cant * precio });
      total += cant * precio;
    }
  });

  if (items.length === 0) {
    mostrarAlerta('Agregá al menos un ítem con descripción', 'warning');
    return;
  }

  try {
    await db.collection('ventasLocal').add({
      items,
      totalVenta: total,
      fecha: firebase.firestore.FieldValue.serverTimestamp(),
      origen: 'manual'
    });
    mostrarAlerta('Venta registrada correctamente', 'success');
    cerrarModal('modal-manual');
    cargarVentasLocales();
  } catch (err) {
    console.error(err);
    mostrarAlerta('Error al guardar la venta', 'error');
  }
}

// =============================================
// MODAL CARGA POR FOTO (IA)
// =============================================
function abrirModalFoto() {
  document.getElementById('foto-input').value = '';
  document.getElementById('foto-preview-img').style.display = 'none';
  document.getElementById('foto-estado').textContent = '';
  document.getElementById('foto-tabla-wrap').style.display = 'none';
  document.getElementById('foto-items-tbody').innerHTML = '';
  abrirModal('modal-foto');
}

function comprimirImagen(base64Full, maxWidth = 1024, quality = 0.7) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      const canvas = document.createElement('canvas');
      canvas.width  = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = base64Full;
  });
}

async function procesarFoto(input) {
  const archivo = input.files[0];
  if (!archivo) return;

  // Verificar que haya API key antes de leer la imagen
  const apiKey = obtenerGeminiKey();
  if (!apiKey) {
    mostrarAlerta('Necesitás ingresar tu API key de Gemini para usar esta función', 'warning');
    return;
  }

  // Mostrar preview
  const reader = new FileReader();
  reader.onload = async (e) => {
    const base64Full = e.target.result;

    // Comprimir antes de enviar a la API
    const base64Comprimido = await comprimirImagen(base64Full);

    const img = document.getElementById('foto-preview-img');
    img.src = base64Comprimido;
    img.style.display = 'block';

    // Extraer solo los datos base64 sin el prefijo
    const base64Data = base64Comprimido.split(',')[1];
    const mediaType  = 'image/jpeg';

    document.getElementById('foto-estado').innerHTML =
      '<span class="spinner">⏳</span> Analizando la foto con IA...';
    document.getElementById('foto-tabla-wrap').style.display = 'none';

    try {
      const MAX_REINTENTOS = 4;
      const DEMORA_BASE_MS = 2000;
      let respuesta;
      for (let intento = 0; intento < MAX_REINTENTOS; intento++) {
        respuesta = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  {
                    inline_data: {
                      mime_type: mediaType,
                      data:      base64Data
                    }
                  },
                  {
                    text: `Sos un asistente que lee hojas de venta manuscritas de una distribuidora de alimentos para mascotas en Argentina.
Analizá la imagen y extraé todos los productos vendidos con sus precios.
Devolvé ÚNICAMENTE un JSON con este formato, sin texto adicional:
{
  "items": [
    { "descripcion": "nombre del producto", "cantidad": 1, "precioUnitario": 0 }
  ]
}
Si no podés leer algún precio, poné 0. Si hay abreviaturas, expandilas lo mejor que puedas.`
                  }
                ]
              }]
            })
          }
        );
        if (respuesta.status !== 429) break;
        const espera = DEMORA_BASE_MS * Math.pow(2, intento);
        document.getElementById('foto-estado').innerHTML =
          `<span class="spinner">⏳</span> Límite de API alcanzado, reintentando en ${espera / 1000}s...`;
        await new Promise(r => setTimeout(r, espera));
      }

      if (!respuesta.ok) {
        const err = await respuesta.text();
        throw new Error(err);
      }

      const data      = await respuesta.json();
      const textoJSON = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

      let parsed;
      try {
        // Extraer JSON aunque haya texto extra
        const match = textoJSON.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(match ? match[0] : textoJSON);
      } catch {
        throw new Error('No se pudo leer la respuesta de la IA');
      }

      const items = parsed.items || [];
      if (items.length === 0) {
        document.getElementById('foto-estado').textContent = 'No se detectaron productos en la foto.';
        return;
      }

      document.getElementById('foto-estado').textContent = `✅ ${items.length} producto${items.length !== 1 ? 's' : ''} detectado${items.length !== 1 ? 's' : ''}. Revisá y corregí si hace falta.`;
      renderTablaFoto(items);
      document.getElementById('foto-tabla-wrap').style.display = 'block';

    } catch (err) {
      console.error(err);
      document.getElementById('foto-estado').textContent = '❌ Error al analizar la foto: ' + (err.message || 'verificá la API key');
    }
  };
  reader.readAsDataURL(archivo);
}

function renderTablaFoto(items) {
  const tbody = document.getElementById('foto-items-tbody');
  tbody.innerHTML = items.map((it, i) => `
    <tr id="foto-fila-${i}">
      <td><input type="text"   value="${it.descripcion || ''}" class="ff-desc"></td>
      <td><input type="number" value="${it.cantidad || 1}" min="1" class="ff-cant" oninput="actualizarTotalFoto()"></td>
      <td><input type="number" value="${it.precioUnitario || 0}" min="0" step="1" class="ff-precio" oninput="actualizarTotalFoto()"></td>
      <td><button class="btn-quitar-item" onclick="quitarFilaFoto(${i})">✕</button></td>
    </tr>`).join('');
  actualizarTotalFoto();
}

function quitarFilaFoto(i) {
  const fila = document.getElementById(`foto-fila-${i}`);
  if (fila) { fila.remove(); actualizarTotalFoto(); }
}

function actualizarTotalFoto() {
  const filas = document.querySelectorAll('#foto-items-tbody tr');
  let total = 0;
  filas.forEach(fila => {
    const cant   = parseFloat(fila.querySelector('.ff-cant')?.value)   || 0;
    const precio = parseFloat(fila.querySelector('.ff-precio')?.value) || 0;
    total += cant * precio;
  });
  document.getElementById('total-foto').textContent = formatPrecio(total);
}

async function confirmarVentaFoto() {
  const filas = document.querySelectorAll('#foto-items-tbody tr');
  const items = [];
  let total = 0;

  filas.forEach(fila => {
    const desc   = fila.querySelector('.ff-desc')?.value.trim()        || '';
    const cant   = parseFloat(fila.querySelector('.ff-cant')?.value)   || 1;
    const precio = parseFloat(fila.querySelector('.ff-precio')?.value) || 0;
    if (desc) {
      items.push({ descripcion: desc, cantidad: cant, precioUnitario: precio, total: cant * precio });
      total += cant * precio;
    }
  });

  if (items.length === 0) {
    mostrarAlerta('No hay ítems para confirmar', 'warning');
    return;
  }

  try {
    await db.collection('ventasLocal').add({
      items,
      totalVenta: total,
      fecha: firebase.firestore.FieldValue.serverTimestamp(),
      origen: 'foto'
    });
    mostrarAlerta('Venta por foto registrada correctamente', 'success');
    cerrarModal('modal-foto');
    cargarVentasLocales();
  } catch (err) {
    console.error(err);
    mostrarAlerta('Error al guardar la venta', 'error');
  }
}

// =============================================
// INIT
// =============================================
document.addEventListener('DOMContentLoaded', cargarVentasLocales);
