// =========================================================================
// CONFIGURACIÓN PRINCIPAL — MONCHIS
// =========================================================================
const CONFIG = {
  marca: "MONCHIS",
  whatsappDestino: "912167997", // Cambia esto por tu número (51 + 9 dígitos)
  apiUrl: "https://api.shalom-api.lat/public/agencies?per_page=1000",
  respaldoUrl: "./agencias.json", // copia local por si la API falla
  timeoutMs: 8000,
  prefijoPedido: "MON", // el código del pedido empieza con esto
  usarIconos: true // pon false si en tu WhatsApp los iconos salen como "?" o "�"
};

let inventarioAgencias = [];

const DOM = {
  form: document.getElementById("form-envio"),
  estado: document.getElementById("estado-sistema"),
  inputNombre: document.getElementById("input-nombre"),
  inputDni: document.getElementById("input-dni"),
  inputCelular: document.getElementById("input-celular"),
  selectDep: document.getElementById("select-departamento"),
  selectZona: document.getElementById("select-zona"),
  selectAgencia: document.getElementById("select-agencia"),
  btnSubmit: document.getElementById("btn-enviar"),

  infoAgencia: document.getElementById("info-agencia"),
  infoDireccion: document.getElementById("info-direccion"),
  enlaceMapa: document.getElementById("enlace-mapa"),

  vistaConfirmacion: document.getElementById("vista-confirmacion"),
  confPedido: document.getElementById("conf-pedido"),
  confFecha: document.getElementById("conf-fecha"),
  confNombre: document.getElementById("conf-nombre"),
  confDireccion: document.getElementById("conf-direccion"),
  confSede: document.getElementById("conf-sede"),
  btnWhatsappReabrir: document.getElementById("btn-whatsapp-reabrir"),
  btnNuevo: document.getElementById("btn-nuevo")
};

// =========================================================================
// 1. OBTENER Y NORMALIZAR AGENCIAS (API → respaldo local)
// =========================================================================
async function pedirJson(url) {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), CONFIG.timeoutMs);
  try {
    const respuesta = await fetch(url, { signal: controlador.signal });
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    return await respuesta.json();
  } finally {
    clearTimeout(temporizador);
  }
}

// Acepta tanto { success, data: [...] } como un arreglo directo
function extraerLista(json) {
  if (Array.isArray(json)) return json;
  if (json && Array.isArray(json.data)) return json.data;
  throw new Error("Formato de datos inesperado.");
}

async function obtenerAgencias() {
  try {
    actualizarEstado("Cargando agencias de Shalom...");
    return extraerLista(await pedirJson(CONFIG.apiUrl));
  } catch (errorApi) {
    console.warn("[API Shalom no disponible, usando respaldo local]:", errorApi);
    actualizarEstado("Usando lista local de agencias...");
    return extraerLista(await pedirJson(CONFIG.respaldoUrl));
  }
}

function limpiarTexto(valor) {
  return String(valor ?? "").replace(/\s+/g, " ").trim();
}

// Coordenadas dentro del territorio peruano (descarta "0", vacíos y datos basura)
function coordenadasValidas(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) &&
    lat < 0.5 && lat > -19 && lng < -67 && lng > -82 &&
    !(lat === 0 && lng === 0);
}

function normalizarAgencias(lista) {
  return lista
    .filter(item => item.destino !== 0) // solo agencias que reciben envíos
    .map((item, i) => {
      const nombreOriginal = limpiarTexto(item.nombre);
      const segmentos = nombreOriginal.split("/").map(s => s.trim());
      const sede = segmentos[segmentos.length - 1] || nombreOriginal;
      const provincia = limpiarTexto(item.provincia).toUpperCase();
      const zona = limpiarTexto(item.zona || item.provincia || "GENERAL").toUpperCase();
      const lat = parseFloat(item.latitud);
      const lng = parseFloat(item.longitud);
      const direccion = limpiarTexto(item.direccion);

      return {
        id: String(item.ter_id ?? `idx-${i}`),
        departamento: limpiarTexto(item.departamento).toUpperCase(),
        provincia,
        zona,
        ubicacionAgrupada: `${provincia || zona} - ${zona}`,
        agencia: sede,
        direccion: direccion.length >= 5 ? direccion : "",
        lat: coordenadasValidas(lat, lng) ? lat : null,
        lng: coordenadasValidas(lat, lng) ? lng : null
      };
    })
    .filter(ag => ag.departamento !== "" && ag.agencia !== "");
}

async function inicializarDatos() {
  try {
    const lista = await obtenerAgencias();
    inventarioAgencias = normalizarAgencias(lista);

    if (inventarioAgencias.length === 0) {
      throw new Error("No se encontraron agencias.");
    }

    DOM.estado.classList.add("hidden"); // oculta el aviso cuando todo cargó bien
    renderizarDepartamentos();
  } catch (error) {
    console.error("[Error cargando agencias]:", error);
    actualizarEstado("Error al cargar agencias. Recarga la página.");
  }
}

function actualizarEstado(mensaje) {
  if (DOM.estado) {
    DOM.estado.textContent = mensaje;
    DOM.estado.classList.remove("hidden");
  }
}

// =========================================================================
// 2. FILTROS EN CASCADA
// =========================================================================
function renderizarDepartamentos() {
  const departamentosUnicos = [...new Set(inventarioAgencias.map(a => a.departamento))].sort();
  llenarSelect(DOM.selectDep, departamentosUnicos, "Selecciona Departamento");
  DOM.selectDep.disabled = false;
}

function manejarCambioDepartamento() {
  const depSeleccionado = DOM.selectDep.value;

  resetearSelect(DOM.selectZona, "Selecciona Provincia / Distrito");
  resetearSelect(DOM.selectAgencia, "Primero elige Provincia / Distrito");
  DOM.btnSubmit.disabled = true;
  ocultarInfoAgencia();

  if (!depSeleccionado) return;

  const zonasUnicas = [...new Set(
    inventarioAgencias
      .filter(a => a.departamento === depSeleccionado)
      .map(a => a.ubicacionAgrupada)
  )].sort();

  llenarSelect(DOM.selectZona, zonasUnicas, "Selecciona Provincia / Distrito");
  DOM.selectZona.disabled = false;
}

function manejarCambioZona() {
  const depSeleccionado = DOM.selectDep.value;
  const zonaSeleccionada = DOM.selectZona.value;

  resetearSelect(DOM.selectAgencia, "Selecciona Agencia Shalom");
  DOM.btnSubmit.disabled = true;
  ocultarInfoAgencia();

  if (!zonaSeleccionada) return;

  const agenciasDisponibles = inventarioAgencias
    .filter(a => a.departamento === depSeleccionado && a.ubicacionAgrupada === zonaSeleccionada)
    .sort((a, b) => a.agencia.localeCompare(b.agencia))
    .map(a => ({ valor: a.id, texto: a.agencia }));

  llenarSelect(DOM.selectAgencia, agenciasDisponibles, "Selecciona Agencia Shalom");
  DOM.selectAgencia.disabled = false;
}

function obtenerAgenciaSeleccionada() {
  return inventarioAgencias.find(a => a.id === DOM.selectAgencia.value) || null;
}

function manejarCambioAgencia() {
  const agencia = obtenerAgenciaSeleccionada();
  DOM.btnSubmit.disabled = !agencia;

  if (agencia) {
    mostrarInfoAgencia(agencia);
  } else {
    ocultarInfoAgencia();
  }
}

// Acepta textos simples o { valor, texto }
function llenarSelect(elementoSelect, opciones, placeholder) {
  elementoSelect.innerHTML = `<option value="">-- ${placeholder} --</option>`;
  opciones.forEach(opcion => {
    const opt = document.createElement("option");
    const esObjeto = typeof opcion === "object";
    opt.value = esObjeto ? opcion.valor : opcion;
    opt.textContent = esObjeto ? opcion.texto : opcion;
    elementoSelect.appendChild(opt);
  });
}

function resetearSelect(elementoSelect, placeholder) {
  elementoSelect.innerHTML = `<option value="">-- ${placeholder} --</option>`;
  elementoSelect.disabled = true;
}

// =========================================================================
// 2.1 DETALLE DE LA AGENCIA + GOOGLE MAPS
// =========================================================================
function enlaceGoogleMaps(agencia) {
  const consulta = agencia.lat !== null
    ? `${agencia.lat},${agencia.lng}`
    : `Shalom ${agencia.agencia} ${agencia.zona} ${agencia.departamento} Perú`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(consulta)}`;
}

function mostrarInfoAgencia(agencia) {
  DOM.infoDireccion.textContent = agencia.direccion || "Consulta la dirección en el mapa.";


  DOM.enlaceMapa.href = enlaceGoogleMaps(agencia);
  DOM.infoAgencia.classList.remove("hidden");
}

function ocultarInfoAgencia() {
  DOM.infoAgencia.classList.add("hidden");
  DOM.enlaceMapa.removeAttribute("href");
}

// =========================================================================
// 3. VALIDACIÓN, PEDIDO Y ENVÍO A WHATSAPP
// =========================================================================
function soloNumeros(input) {
  input.value = input.value.replace(/[^0-9]/g, "");
}

function validarDatos(datos) {
  if (datos.nombre.length < 3) {
    return { valido: false, error: "Ingresa el nombre completo del destinatario." };
  }
  if (!/^\d{8,12}$/.test(datos.dni)) {
    return { valido: false, error: "El DNI/CE debe contener entre 8 y 12 números." };
  }
  if (!/^9\d{8}$/.test(datos.celular)) {
    return { valido: false, error: "El celular debe tener 9 dígitos y empezar con 9." };
  }
  if (!datos.departamento || !datos.zona || !datos.agencia) {
    return { valido: false, error: "Debes seleccionar departamento, distrito y agencia." };
  }
  return { valido: true };
}

// Código de pedido legible: MON-25NOV-7K4P  (prefijo - día y mes - 4 letras/números al azar)
function generarCodigoPedido() {
  const meses = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SET", "OCT", "NOV", "DIC"];
  const hoy = new Date();
  const dia = String(hoy.getDate()).padStart(2, "0");
  const fecha = `${dia}${meses[hoy.getMonth()]}`;

  // Sin letras/números que se confunden (0/O, 1/I/L)
  const letras = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const azar = Array.from(bytes, b => letras[b % letras.length]).join("");

  return `${CONFIG.prefijoPedido}-${fecha}-${azar}`;
}

function formatearFecha(fecha) {
  return new Intl.DateTimeFormat("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  }).format(fecha);
}

// "arequipa / arequipa / cerro colorado / asoc las flores - av 54"
function armarDireccionEnvio(datos) {
  const { agencia } = datos;
  return [agencia.departamento, agencia.provincia, agencia.zona, agencia.agencia]
    .filter(Boolean)
    .map(t => t.toLowerCase())
    .join(" / ");
}

// Iconos escritos como códigos Unicode: así no dependen de cómo guardes el archivo
const ICONOS = {
  encabezado: "\u{1F4E6}", // 📦
  pedido: "\u{1F9FE}",     // 🧾
  nombre: "\u{1F464}",     // 👤
  dni: "\u{1F194}",        // 🆔
  celular: "\u{1F4F1}",    // 📱
  destino: "\u{1F4CD}",    // 📍
  agencia: "\u{1F3E2}",    // 🏢
  direccion: "\u{1F3E0}"   // 🏠
};

function icono(clave) {
  return CONFIG.usarIconos ? `${ICONOS[clave]} ` : "";
}

function generarEnlaceWhatsApp(datos, pedido) {
  const { agencia } = datos;
  const lineas = [
    `${icono("encabezado")}*ENVÍO SHALOM — ${CONFIG.marca}*`,
    "--------------------------------",
    `${icono("pedido")}*Pedido:* #${pedido.codigo}`,
    `${icono("nombre")}*Nombre:* ${datos.nombre}`,
    `${icono("dni")}*DNI/CE:* ${datos.dni}`,
    `${icono("celular")}*Celular:* ${datos.celular}`,
    `${icono("destino")}*Destino:* ${agencia.departamento} / ${agencia.provincia || agencia.zona} / ${agencia.zona}`,
    `${icono("agencia")}*Agencia:* ${agencia.agencia}`
  ];
  if (agencia.direccion) lineas.push(`${icono("direccion")}*Dirección:* ${agencia.direccion}`);
  lineas.push("--------------------------------");

  return `https://api.whatsapp.com/send?phone=${CONFIG.whatsappDestino}&text=${encodeURIComponent(lineas.join("\n"))}`;
}

function manejarEnvioFormulario(evento) {
  evento.preventDefault();

  const agencia = obtenerAgenciaSeleccionada();
  const datosEnvio = {
    nombre: DOM.inputNombre.value.trim().toUpperCase(),
    dni: DOM.inputDni.value.trim(),
    celular: DOM.inputCelular.value.trim(),
    departamento: DOM.selectDep.value,
    zona: DOM.selectZona.value,
    agencia: agencia
  };

  const validacion = validarDatos({
    ...datosEnvio,
    agencia: agencia ? agencia.id : ""
  });
  if (!validacion.valido) {
    alert(validacion.error);
    return;
  }

  const pedido = { codigo: generarCodigoPedido(), fecha: new Date() };
  const enlace = generarEnlaceWhatsApp(datosEnvio, pedido);

  window.open(enlace, "_blank");
  mostrarConfirmacion(datosEnvio, pedido, enlace);
}

// =========================================================================
// 3.1 PANTALLA DE CONFIRMACIÓN
// =========================================================================
function mostrarConfirmacion(datos, pedido, enlaceWhatsApp) {
  DOM.confPedido.textContent = `#${pedido.codigo}`;
  DOM.confFecha.textContent = formatearFecha(pedido.fecha);
  DOM.confNombre.textContent = datos.nombre;
  DOM.confDireccion.textContent = armarDireccionEnvio(datos);
  DOM.confSede.textContent = datos.agencia.agencia;
  DOM.btnWhatsappReabrir.href = enlaceWhatsApp;

  DOM.form.classList.add("hidden");
  DOM.vistaConfirmacion.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function nuevoEnvio() {
  DOM.form.reset();
  DOM.selectDep.value = "";
  manejarCambioDepartamento();

  DOM.vistaConfirmacion.classList.add("hidden");
  DOM.form.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// =========================================================================
// 4. EVENTOS E INICIO
// =========================================================================
DOM.inputDni.addEventListener("input", () => soloNumeros(DOM.inputDni));
DOM.inputCelular.addEventListener("input", () => soloNumeros(DOM.inputCelular));

DOM.selectDep.addEventListener("change", manejarCambioDepartamento);
DOM.selectZona.addEventListener("change", manejarCambioZona);
DOM.selectAgencia.addEventListener("change", manejarCambioAgencia);
DOM.form.addEventListener("submit", manejarEnvioFormulario);
DOM.btnNuevo.addEventListener("click", nuevoEnvio);

inicializarDatos();