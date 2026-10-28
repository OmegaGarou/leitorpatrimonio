/**
 * APLICAÇÃO: Leitor e Coletor de Patrimônio PWA (Integrado ao Google Drive / Google Sheets)
 * Tecnologias: HTML5, CSS3, JavaScript Vanilla (ES6+), IndexedDB, SheetJS, BarcodeDetector API, Google Apps Script
 */

// ==========================================================================
// 1. CONSTANTES & CONFIGURAÇÕES
// ==========================================================================
const DB_NAME = 'PatrimonioDB';
const DB_VERSION = 2;
const STORE_NAME = 'coletas';

// Se desejar deixar a URL da Planilha Google fixa no código para todos os celulares, cole-a abaixo:
const DEFAULT_GOOGLE_SCRIPT_URL = '/api';

const ANDARES_LIST = [
  'Subsolo',
  'Térreo',
  '1º Andar',
  '2º Andar',
  '3º Andar',
  '4º Andar',
  '5º Andar',
  '6º Andar',
  '7º Andar',
  '8º Andar',
  '9º Andar',
  '10º Andar',
  '11º Andar',
  '12º Andar',
  '13º Andar',
  '14º Andar',
  '15º Andar',
  '16º Andar',
  '17º Andar',
  'Casa 1',
  'Casa 2',
  'Casa 3'
];

const LOCALIZACOES_LIST = ['Frente', 'Meio', 'Fundos'];

const STORAGE_KEYS = {
  ANDAR: 'patrimonio_fixo_andar',
  LOCAL: 'patrimonio_fixo_local',
  SETOR: 'patrimonio_fixo_setor',
  OPERADOR: 'patrimonio_fixo_operador',
  CLOUD_URL: 'patrimonio_google_script_url'
};

// ==========================================================================
// 2. ELEMENTOS DO DOM
// ==========================================================================
const DOM = {
  // Menu Expansível (Canto Superior Esquerdo) & Navegação
  btnMenuToggle: document.getElementById('btnMenuToggle'),
  menuStatusDot: document.getElementById('menuStatusDot'),
  menuBackdrop: document.getElementById('menuBackdrop'),
  floatingMenuPanel: document.getElementById('floatingMenuPanel'),
  btnNavColetas: document.getElementById('btnNavColetas'),
  btnNavExportar: document.getElementById('btnNavExportar'),
  btnConfigCloud: document.getElementById('btnConfigCloud'),
  btnVoltarScanner: document.getElementById('btnVoltarScanner'),
  viewScanner: document.getElementById('viewScanner'),
  viewColetas: document.getElementById('viewColetas'),
  statusCount: document.getElementById('statusCount'),

  // Coletor & Scanner
  inputColetor: document.getElementById('inputColetor'),
  cameraVideo: document.getElementById('cameraVideo'),
  photoCanvas: document.getElementById('photoCanvas'),
  btnTorch: document.getElementById('btnTorch'),
  cameraStatus: document.getElementById('cameraStatus'),
  cameraStatusMsg: document.getElementById('cameraStatusMsg'),
  btnRetryCamera: document.getElementById('btnRetryCamera'),

  // Formulário
  selectAndar: document.getElementById('selectAndar'),
  selectLocalizacao: document.getElementById('selectLocalizacao'),
  inputSetor: document.getElementById('inputSetor'),
  btnRegistrar: document.getElementById('btnRegistrar'),
  btnToggleManual: document.getElementById('btnToggleManual'),
  manualInputCard: document.getElementById('manualInputCard'),
  manualInputTitle: document.getElementById('manualInputTitle'),
  btnCloseManual: document.getElementById('btnCloseManual'),
  inputManualPatrimonio: document.getElementById('inputManualPatrimonio'),
  btnSalvarManual: document.getElementById('btnSalvarManual'),
  lastScannedFeedback: document.getElementById('lastScannedFeedback'),
  lblLastCode: document.getElementById('lblLastCode'),
  lblLastDetails: document.getElementById('lblLastDetails'),

  // Modal Duplicidade
  modalDuplicidade: document.getElementById('modalDuplicidade'),
  modalDupCode: document.getElementById('modalDupCode'),
  modalDupAndar: document.getElementById('modalDupAndar'),
  modalDupLocal: document.getElementById('modalDupLocal'),
  rowDupSetor: document.getElementById('rowDupSetor'),
  modalDupSetor: document.getElementById('modalDupSetor'),
  rowDupColetor: document.getElementById('rowDupColetor'),
  modalDupColetor: document.getElementById('modalDupColetor'),
  modalDupData: document.getElementById('modalDupData'),
  btnModalOk: document.getElementById('btnModalOk'),

  // Modal Configuração Google Drive
  modalCloudConfig: document.getElementById('modalCloudConfig'),
  inputCloudUrl: document.getElementById('inputCloudUrl'),
  btnCopyShareLink: document.getElementById('btnCopyShareLink'),
  btnCloseCloudModal: document.getElementById('btnCloseCloudModal'),
  btnSaveCloudUrl: document.getElementById('btnSaveCloudUrl'),

  // Lista de Coletas
  coletasContainer: document.getElementById('coletasContainer'),
  inputBusca: document.getElementById('inputBusca'),
  filterAndar: document.getElementById('filterAndar'),
  filterLocal: document.getElementById('filterLocal'),
  totalCountPill: document.getElementById('totalCountPill'),
  btnLimparTudo: document.getElementById('btnLimparTudo'),

  // Toast
  toastNotification: document.getElementById('toastNotification')
};

// ==========================================================================
// 3. ESTADO DA APLICAÇÃO & CÂMERA
// ==========================================================================
let dbInstance = null;
let cameraStream = null;
let currentTrack = null;
let isTorchOn = false;
let barcodeDetectorInstance = null;
let html5QrCodeScanner = null;
let ocrWorkerInstance = null;
let isOcrInitializing = false;
let isOnlineWithServer = false;
let isSyncing = false;

// ==========================================================================
// 4. CLIENTE GOOGLE DRIVE (APPS SCRIPT WEB APP / AUTO-ENDPOINT)
// ==========================================================================
const DYNAMIC_ENDPOINT_DISCOVERY_URL = 'https://raw.githubusercontent.com/OmegaGarou/leitorpatrimonio/main/endpoint.json';
let cachedDynamicApiUrl = '';

function normalizarPatrimonio(valor) {
  return String(valor || '').trim().replace(/\./g, '');
}

function getCloudUrl() {
  const saved = (localStorage.getItem(STORAGE_KEYS.CLOUD_URL) || '').trim();
  if (saved && (saved.includes('serveousercontent.com') || saved.includes('trycloudflare.com'))) {
    localStorage.removeItem(STORAGE_KEYS.CLOUD_URL);
  } else if (saved) {
    return saved;
  }
  if (cachedDynamicApiUrl) {
    return cachedDynamicApiUrl;
  }
  if (window.location.hostname.includes('github.io')) {
    return '';
  }
  return DEFAULT_GOOGLE_SCRIPT_URL || '/api';
}

async function descobrirEndpointAtivo(forceRefresh = false) {
  if (!forceRefresh) {
    const current = getCloudUrl();
    if (current) return current;
  }
  try {
    const resp = await fetch(`${DYNAMIC_ENDPOINT_DISCOVERY_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (resp.ok) {
      const info = await resp.json();
      if (info && info.apiUrl) {
        cachedDynamicApiUrl = info.apiUrl.trim();
        return cachedDynamicApiUrl;
      }
    }
  } catch (e) {}
  return getCloudUrl() || '/api';
}

function verificarParametroUrlApi() {
  try {
    const params = new URLSearchParams(window.location.search);
    const apiParam = params.get('api');
    if (apiParam && (apiParam.startsWith('http://') || apiParam.startsWith('https://') || apiParam.startsWith('/'))) {
      localStorage.setItem(STORAGE_KEYS.CLOUD_URL, apiParam.trim());
      params.delete('api');
      const novaQuery = params.toString();
      const novaUrl = window.location.pathname + (novaQuery ? `?${novaQuery}` : '') + window.location.hash;
      window.history.replaceState({}, document.title, novaUrl);
    }
  } catch (e) {}
}

const API = {
  async registrar(item) {
    let url = await descobrirEndpointAtivo(false);
    if (!url) return { status: 0, error: 'URL não configurada' };

    const payload = { ...item, patrimonio: normalizarPatrimonio(item.patrimonio) };

    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);

        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'registrar', ...payload }),
          redirect: 'follow',
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (resp.status >= 500 && tentativa < 3) {
          url = await descobrirEndpointAtivo(true);
          await new Promise(r => setTimeout(r, 1200));
          continue;
        }

        const data = await resp.json();
        if (data && data.status === 'duplicado') {
          return { status: 409, data };
        }
        if (resp.ok && data && data.status === 'ok') {
          return { status: 201, data };
        }
        return { status: resp.status, data };
      } catch (e) {
        if (tentativa < 3) {
          url = await descobrirEndpointAtivo(true);
          await new Promise(r => setTimeout(r, 1200));
          continue;
        }
        return { status: 0, error: e };
      }
    }
    return { status: 0, error: 'Falha após retentativas' };
  },

  async listar() {
    let url = await descobrirEndpointAtivo(false);
    if (!url) return null;

    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);

        const sep = url.includes('?') ? '&' : '?';
        const resp = await fetch(`${url}${sep}action=listar&t=${Date.now()}`, {
          method: 'GET',
          redirect: 'follow',
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (resp.status >= 500 && tentativa < 3) {
          url = await descobrirEndpointAtivo(true);
          await new Promise(r => setTimeout(r, 1200));
          continue;
        }

        if (resp.ok) {
          const data = await resp.json();
          return Array.isArray(data) ? data : (data.items || null);
        }
        return null;
      } catch (e) {
        if (tentativa < 3) {
          url = await descobrirEndpointAtivo(true);
          await new Promise(r => setTimeout(r, 1200));
          continue;
        }
        return null;
      }
    }
    return null;
  },

  async excluir(patrimonio) {
    const url = await descobrirEndpointAtivo(false);
    if (!url) return;

    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'excluir', patrimonio: normalizarPatrimonio(patrimonio) }),
        redirect: 'follow'
      });
    } catch (e) {}
  },

  async limpar() {
    const url = await descobrirEndpointAtivo(false);
    if (!url) return;

    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'limpar' }),
        redirect: 'follow'
      });
    } catch (e) {}
  }
};

// ==========================================================================
// 5. INICIALIZAÇÃO DO BANCO INDEXEDDB (OFFLINE / DISPOSITIVO LOCAL)
// ==========================================================================
function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      let store;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        store = db.createObjectStore(STORE_NAME, { keyPath: 'patrimonio' });
      } else {
        store = event.target.transaction.objectStore(STORE_NAME);
      }

      if (!store.indexNames.contains('timestamp')) {
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
      if (!store.indexNames.contains('andar')) {
        store.createIndex('andar', 'andar', { unique: false });
      }
      if (!store.indexNames.contains('localizacao')) {
        store.createIndex('localizacao', 'localizacao', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error('Erro ao abrir IndexedDB:', event.target.error);
      reject(event.target.error);
    };
  });
}

const DB = {
  async salvar(item) {
    return new Promise((resolve, reject) => {
      const tx = dbInstance.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put({ ...item, patrimonio: normalizarPatrimonio(item.patrimonio) });
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e.target.error);
    });
  },

  async sincronizarEspelho(itensServidor, itensLocaisPendentes) {
    return new Promise((resolve) => {
      const tx = dbInstance.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();

      (itensServidor || []).forEach(item => {
        if (item && item.patrimonio) {
          store.put({
            patrimonio: normalizarPatrimonio(item.patrimonio),
            andar: item.andar || '',
            localizacao: item.localizacao || '',
            setor: item.setor || '',
            operador: item.operador || '',
            data: item.data || '',
            timestamp: Number(item.timestamp) || Date.now(),
            pendenteSync: false
          });
        }
      });

      (itensLocaisPendentes || []).forEach(item => {
        store.put({ ...item, patrimonio: normalizarPatrimonio(item.patrimonio) });
      });

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  },

  async buscarPorPatrimonio(codigo) {
    return new Promise((resolve) => {
      const tx = dbInstance.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(normalizarPatrimonio(codigo));
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  },

  async listarTodos() {
    return new Promise((resolve) => {
      const tx = dbInstance.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  },

  async excluir(codigo) {
    return new Promise((resolve) => {
      const tx = dbInstance.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(normalizarPatrimonio(codigo));
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  },

  async limparTudo() {
    return new Promise((resolve) => {
      const tx = dbInstance.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  }
};

// ==========================================================================
// 6. SINCRONIZAÇÃO BIDIRECIONAL COM A PLANILHA DO GOOGLE DRIVE
// ==========================================================================
async function sincronizarComServidor() {
  if (isSyncing || !dbInstance) return false;
  isSyncing = true;

  try {
    const url = getCloudUrl();
    const locais = await DB.listarTodos();

    if (!url) {
      isOnlineWithServer = false;
      if (DOM.menuStatusDot) DOM.menuStatusDot.classList.add('offline');
      DOM.statusCount.style.cursor = 'pointer';
      DOM.statusCount.innerHTML = `<span style="color:#38bdf8; text-decoration:underline;">☁️ Configurar Google Drive</span> • ${locais.length} ${locais.length === 1 ? 'coleta' : 'coletas'}`;
      return false;
    }

    // 1. Envia (push) coletas feitas offline que estavam aguardando conexão
    const pendentes = locais.filter(i => i.pendenteSync);
    const aindaPendentes = [];

    for (const itemPendente of pendentes) {
      const res = await API.registrar(itemPendente);
      if (res.status === 201 || res.status === 409) {
        itemPendente.pendenteSync = false;
        await DB.salvar(itemPendente);
      } else {
        aindaPendentes.push(itemPendente);
      }
    }

    // 2. Baixa (pull) a lista completa da Planilha do Google Drive
    const dadosServidor = await API.listar();

    if (dadosServidor !== null && Array.isArray(dadosServidor)) {
      isOnlineWithServer = true;
      if (DOM.menuStatusDot) DOM.menuStatusDot.classList.remove('offline');
      await DB.sincronizarEspelho(dadosServidor, aindaPendentes);
      const total = (await DB.listarTodos()).length;
      DOM.statusCount.style.cursor = 'pointer';
      DOM.statusCount.innerHTML = `<span style="color:#10b981;">● Google Drive Conectado</span> • ${total} ${total === 1 ? 'coleta' : 'coletas'}`;
      return true;
    } else {
      isOnlineWithServer = false;
      if (DOM.menuStatusDot) DOM.menuStatusDot.classList.add('offline');
      const total = (await DB.listarTodos()).length;
      DOM.statusCount.style.cursor = 'pointer';
      DOM.statusCount.innerHTML = `<span style="color:#f59e0b;">● Modo Offline</span> • ${total} ${total === 1 ? 'coleta' : 'coletas'}`;
      return false;
    }
  } finally {
    isSyncing = false;
  }
}

// ==========================================================================
// 7. GERENCIAMENTO DE ÁUDIO & FEEDBACK TÁTIL
// ==========================================================================
function playBeep(type = 'success') {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    if (type === 'success') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1850, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } else {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320, ctx.currentTime);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    }
  } catch (e) {}

  if ('vibrate' in navigator) {
    navigator.vibrate(type === 'success' ? 70 : [100, 50, 100]);
  }
}

let toastTimeout = null;
function showToast(msg, type = 'info') {
  clearTimeout(toastTimeout);
  DOM.toastNotification.textContent = msg;
  DOM.toastNotification.className = `toast-popup ${type === 'success' ? 'toast-success' : type === 'error' ? 'toast-error' : ''}`;
  DOM.toastNotification.style.display = 'block';

  toastTimeout = setTimeout(() => {
    DOM.toastNotification.style.display = 'none';
  }, 3500);
}

// ==========================================================================
// 8. FORMATAÇÃO DE DATA
// ==========================================================================
function getDataAtualFormatada() {
  const agora = new Date();
  const dia = String(agora.getDate()).padStart(2, '0');
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const ano = agora.getFullYear();
  return `${dia}/${mes}/${ano}`;
}

// ==========================================================================
// 9. GERENCIAMENTO DA CÂMERA & VISOR
// ==========================================================================
async function iniciarCamera() {
  DOM.cameraStatus.style.display = 'none';

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    DOM.cameraStatus.style.display = 'flex';
    DOM.cameraStatusMsg.innerHTML = `
      Navegador não possui suporte ou acesso seguro para câmera.<br>
      <small style="opacity: 0.8;">Acesse através de um link <strong>HTTPS</strong>.</small>
    `;
    return;
  }

  try {
    const constraints = {
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      },
      audio: false
    };

    cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
    DOM.cameraVideo.srcObject = cameraStream;

    DOM.cameraVideo.onloadedmetadata = () => {
      DOM.cameraVideo.play();
      checarSuporteLanterna();
    };

  } catch (err) {
    console.error('Erro ao iniciar câmera:', err);
    DOM.cameraStatus.style.display = 'flex';
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      DOM.cameraStatusMsg.textContent = 'Permissão de câmera negada. Habilite o acesso nas configurações do navegador.';
    } else {
      DOM.cameraStatusMsg.innerHTML = `
        Não foi possível acessar a câmera.<br>
        <small style="opacity: 0.8;">Certifique-se de acessar via <strong>HTTPS</strong> no celular.</small>
      `;
    }
  }
}

function checarSuporteLanterna() {
  if (!cameraStream) return;
  const videoTracks = cameraStream.getVideoTracks();
  if (videoTracks.length > 0) {
    currentTrack = videoTracks[0];
    const capabilities = currentTrack.getCapabilities ? currentTrack.getCapabilities() : {};
    if (capabilities.torch) {
      DOM.btnTorch.style.display = 'flex';
    } else {
      DOM.btnTorch.style.display = 'none';
    }
  }
}

async function alternarLanterna() {
  if (!currentTrack) return;
  try {
    isTorchOn = !isTorchOn;
    await currentTrack.applyConstraints({
      advanced: [{ torch: isTorchOn }]
    });
    DOM.btnTorch.classList.toggle('active', isTorchOn);
  } catch (e) {
    console.warn('Erro ao alternar lanterna:', e);
  }
}

// ==========================================================================
// 10. MOTOR DE DECODIFICAÇÃO DE CÓDIGOS DE BARRAS + OCR DO NÚMERO IMPRESSO
// ==========================================================================
async function initBarcodeDetector() {
  if ('BarcodeDetector' in window) {
    try {
      const supportedFormats = await BarcodeDetector.getSupportedFormats();
      barcodeDetectorInstance = new BarcodeDetector({
        formats: supportedFormats.length > 0 ? supportedFormats : ['code_128', 'code_39', 'ean_13', 'ean_8', 'itf', 'codabar', 'qr_code']
      });
    } catch (e) {
      barcodeDetectorInstance = null;
    }
  }
}

async function initOcrWorker() {
  if (ocrWorkerInstance || isOcrInitializing || !window.Tesseract) return ocrWorkerInstance;
  isOcrInitializing = true;
  try {
    const worker = await window.Tesseract.createWorker('eng');
    await worker.setParameters({
      tessedit_char_whitelist: '0123456789.- ',
      tessedit_pageseg_mode: '6'
    });
    ocrWorkerInstance = worker;
    return ocrWorkerInstance;
  } catch (e) {
    console.warn('OCR indisponível:', e);
    return null;
  } finally {
    isOcrInitializing = false;
  }
}

function gerarCanvasRecorteMira(sourceCanvas, altoContraste = false) {
  const sw = sourceCanvas.width;
  const sh = sourceCanvas.height;
  const cropW = Math.floor(sw * 0.86);
  const cropH = Math.floor(sh * 0.48);
  const cropX = Math.floor((sw - cropW) / 2);
  const cropY = Math.floor((sh - cropH) / 2);

  const outCanvas = document.createElement('canvas');
  const targetW = Math.min(960, cropW);
  const scale = targetW / cropW;
  const targetH = Math.floor(cropH * scale);
  outCanvas.width = targetW;
  outCanvas.height = targetH;

  const octx = outCanvas.getContext('2d', { willReadFrequently: true });
  octx.drawImage(sourceCanvas, cropX, cropY, cropW, cropH, 0, 0, targetW, targetH);

  if (altoContraste) {
    const imgData = octx.getImageData(0, 0, targetW, targetH);
    const d = imgData.data;
    let soma = 0;
    const totalPixels = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      d[i] = lum;
      soma += lum;
    }
    const media = soma / totalPixels;
    const limiar = media * 0.92;
    for (let i = 0; i < d.length; i += 4) {
      const v = d[i] < limiar ? 0 : 255;
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
    }
    octx.putImageData(imgData, 0, 0);
  }

  return outCanvas;
}

function extrairNumeroPatrimonioDeTexto(textoBruto) {
  if (!textoBruto) return { code: null, partial: '' };

  const texto = String(textoBruto)
    .replace(/[oO]/g, '0')
    .replace(/[lI|]/g, '1');

  // 1º: Padrão formatado com pontos abaixo do código de barras (ex: 100.001.499.050)
  const regexPontuado = /\b\d{2,3}(?:[\s.]+\d{3}){2,4}\b/g;
  const matchesPontuados = texto.match(regexPontuado);
  if (matchesPontuados && matchesPontuados.length > 0) {
    for (const m of matchesPontuados) {
      const limpo = m.replace(/\D/g, '');
      if (limpo.length >= 6 && limpo.length <= 15) {
        return { code: limpo, partial: limpo };
      }
    }
  }

  // 2º: Linhas contendo sequências numéricas (com ou sem espaços/pontos)
  const linhas = texto.split(/[\r\n]+/);
  let melhorCandidato = '';
  let melhorParcial = '';

  for (const linha of linhas) {
    const apenasDigitos = linha.replace(/\D/g, '');
    if (apenasDigitos.length >= 10 && apenasDigitos.length <= 14 && apenasDigitos.startsWith('100')) {
      return { code: apenasDigitos, partial: apenasDigitos };
    }
    if (apenasDigitos.length >= 6 && apenasDigitos.length <= 15) {
      if (apenasDigitos.length > melhorCandidato.length) {
        melhorCandidato = apenasDigitos;
      }
    } else if (apenasDigitos.length >= 3 && apenasDigitos.length > melhorParcial.length) {
      melhorParcial = apenasDigitos;
    }
  }

  if (melhorCandidato) {
    return { code: melhorCandidato, partial: melhorCandidato };
  }

  return { code: null, partial: melhorParcial };
}

async function tentarHtml5QrcodeEmCanvas(targetCanvas) {
  if (!window.Html5Qrcode) return null;
  try {
    if (!html5QrCodeScanner) {
      let tempDiv = document.getElementById('tempQrReader');
      if (!tempDiv) {
        tempDiv = document.createElement('div');
        tempDiv.id = 'tempQrReader';
        tempDiv.style.display = 'none';
        document.body.appendChild(tempDiv);
      }
      html5QrCodeScanner = new Html5Qrcode('tempQrReader');
    }
    const blob = await new Promise(res => targetCanvas.toBlob(res, 'image/jpeg', 0.92));
    const file = new File([blob], 'frame.jpg', { type: 'image/jpeg' });
    const decodedResult = await html5QrCodeScanner.scanFile(file, false);
    return decodedResult || null;
  } catch (e) {
    return null;
  }
}

async function capturarEDecodificarFrame(onProgress) {
  if (!DOM.cameraVideo.videoWidth || !DOM.cameraVideo.videoHeight) {
    throw new Error('Aguardando câmera inicializar...');
  }

  const canvas = DOM.photoCanvas;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const width = DOM.cameraVideo.videoWidth;
  const height = DOM.cameraVideo.videoHeight;
  canvas.width = width;
  canvas.height = height;

  ctx.drawImage(DOM.cameraVideo, 0, 0, width, height);
  const recorteMira = gerarCanvasRecorteMira(canvas, false);

  // 1ª Tentativa: BarcodeDetector Nativo (Quadro Completo + Recorte da Mira)
  if (barcodeDetectorInstance) {
    try {
      const barcodesFull = await barcodeDetectorInstance.detect(canvas);
      if (barcodesFull && barcodesFull.length > 0 && barcodesFull[0].rawValue) {
        return { code: barcodesFull[0].rawValue, metodo: 'barcode', partial: '' };
      }
      const barcodesCrop = await barcodeDetectorInstance.detect(recorteMira);
      if (barcodesCrop && barcodesCrop.length > 0 && barcodesCrop[0].rawValue) {
        return { code: barcodesCrop[0].rawValue, metodo: 'barcode', partial: '' };
      }
    } catch (e) {}
  }

  // 2ª Tentativa: Html5Qrcode Fallback (Recorte da Mira + Quadro Completo)
  const qrCrop = await tentarHtml5QrcodeEmCanvas(recorteMira);
  if (qrCrop) {
    return { code: qrCrop, metodo: 'barcode', partial: '' };
  }
  const qrFull = await tentarHtml5QrcodeEmCanvas(canvas);
  if (qrFull) {
    return { code: qrFull, metodo: 'barcode', partial: '' };
  }

  // 3ª Tentativa: OCR do Número Impresso Abaixo do Código de Barras
  if (onProgress) onProgress('LENDO NÚMERO...');
  let melhorParcialOcr = '';
  try {
    const worker = await initOcrWorker();
    if (worker) {
      const resNormal = await worker.recognize(recorteMira);
      const extNormal = extrairNumeroPatrimonioDeTexto(resNormal && resNormal.data ? resNormal.data.text : '');
      if (extNormal.code) {
        return { code: extNormal.code, metodo: 'ocr', partial: extNormal.code };
      }
      if (extNormal.partial) melhorParcialOcr = extNormal.partial;

      // Segunda passada OCR com binarização de alto contraste
      const recorteContraste = gerarCanvasRecorteMira(canvas, true);
      const resContraste = await worker.recognize(recorteContraste);
      const extContraste = extrairNumeroPatrimonioDeTexto(resContraste && resContraste.data ? resContraste.data.text : '');
      if (extContraste.code) {
        return { code: extContraste.code, metodo: 'ocr', partial: extContraste.code };
      }
      if (extContraste.partial && extContraste.partial.length > melhorParcialOcr.length) {
        melhorParcialOcr = extContraste.partial;
      }
    }
  } catch (ocrErr) {
    console.warn('Falha na leitura OCR:', ocrErr);
  }

  return { code: null, metodo: null, partial: melhorParcialOcr };
}

// ==========================================================================
// 11. AÇÃO: REGISTRAR (CÂMERA, OCR OU CAMPO MANUAL EM CASO DE ERRO)
// ==========================================================================
function abrirCampoManual(mensagem, valorSugerido = '') {
  if (!DOM.manualInputCard) return;
  if (DOM.manualInputTitle && mensagem) {
    DOM.manualInputTitle.textContent = mensagem;
  }
  DOM.manualInputCard.style.display = 'flex';
  if (DOM.inputManualPatrimonio) {
    if (valorSugerido && !DOM.inputManualPatrimonio.value) {
      DOM.inputManualPatrimonio.value = normalizarPatrimonio(valorSugerido);
    }
    setTimeout(() => {
      DOM.inputManualPatrimonio.focus();
      DOM.inputManualPatrimonio.select();
    }, 80);
  }
}

function fecharCampoManual() {
  if (!DOM.manualInputCard) return;
  DOM.manualInputCard.style.display = 'none';
}

async function processarRegistroCodigo(rawCode, metodo = 'barcode') {
  const codigoLimpo = normalizarPatrimonio(rawCode);
  if (!codigoLimpo) {
    playBeep('error');
    showToast('Digite ou alinhe um número de patrimônio válido.', 'error');
    abrirCampoManual('⚠️ Informe o número do patrimônio para salvar:');
    return false;
  }

  const andarSelecionado = DOM.selectAndar.value;
  const localSelecionado = DOM.selectLocalizacao.value;
  const setorNome = (DOM.inputSetor ? DOM.inputSetor.value.trim() : '') || '';
  const coletorNome = (DOM.inputColetor ? DOM.inputColetor.value.trim() : '') || '';
  const dataAtual = getDataAtualFormatada();

  // Verifica primeiro no cache local rápido se já existe
  const existenteLocal = await DB.buscarPorPatrimonio(codigoLimpo);
  if (existenteLocal) {
    playBeep('error');
    exibirModalDuplicidade(existenteLocal);
    return false;
  }

  const novoRegistro = {
    patrimonio: codigoLimpo,
    andar: andarSelecionado,
    localizacao: localSelecionado,
    setor: setorNome,
    operador: coletorNome,
    data: dataAtual,
    timestamp: Date.now(),
    pendenteSync: false
  };

  // Tenta registrar diretamente na Planilha do Google Drive
  const apiResult = await API.registrar(novoRegistro);

  if (apiResult.status === 409) {
    const itemDup = (apiResult.data && apiResult.data.item) ? apiResult.data.item : novoRegistro;
    await DB.salvar({ ...itemDup, pendenteSync: false });
    playBeep('error');
    exibirModalDuplicidade(itemDup);
    return false;
  }

  const sufixoMetodo = metodo === 'ocr' ? ' (lido pelo número)' : metodo === 'manual' ? ' (digitado)' : '';
  const resumoLocal = `${andarSelecionado} • ${localSelecionado}${setorNome ? ` • ${setorNome}` : ''}`;

  if (apiResult.status === 201) {
    await DB.salvar({ ...novoRegistro, pendenteSync: false });
    playBeep('success');

    DOM.lblLastCode.textContent = `#${codigoLimpo}`;
    DOM.lblLastDetails.textContent = `${resumoLocal} ${coletorNome ? `(${coletorNome})` : ''} - ${dataAtual}`;
    DOM.lastScannedFeedback.style.display = 'flex';

    if (DOM.inputManualPatrimonio) DOM.inputManualPatrimonio.value = '';
    fecharCampoManual();

    showToast(`Patrimônio ${codigoLimpo}${sufixoMetodo} salvo na Planilha do Google Drive!`, 'success');
    sincronizarComServidor();
    return true;
  }

  // Sem sinal temporariamente: salva no dispositivo com fila de sincronização
  novoRegistro.pendenteSync = true;
  await DB.salvar(novoRegistro);
  playBeep('success');

  DOM.lblLastCode.textContent = `#${codigoLimpo}`;
  DOM.lblLastDetails.textContent = `${resumoLocal} (${dataAtual})`;
  DOM.lastScannedFeedback.style.display = 'flex';

  if (DOM.inputManualPatrimonio) DOM.inputManualPatrimonio.value = '';
  fecharCampoManual();

  showToast(`Patrimônio ${codigoLimpo}${sufixoMetodo} salvo no celular (será enviado ao Google Drive assim que conectar).`, 'info');
  sincronizarComServidor();
  return true;
}

async function handleRegistrar() {
  if (DOM.btnRegistrar.classList.contains('loading')) return;

  DOM.btnRegistrar.classList.add('loading');
  const originalHtml = DOM.btnRegistrar.innerHTML;
  const setButtonStage = (label) => {
    DOM.btnRegistrar.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="btn-icon" style="animation: spin 1s linear infinite;">
        <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="16"/>
      </svg>
      <span>${label}</span>
    `;
  };
  setButtonStage('LENDO CÓDIGO...');

  try {
    const resultado = await capturarEDecodificarFrame((etapa) => setButtonStage(etapa));

    if (!resultado || !resultado.code || !resultado.code.trim()) {
      playBeep('error');
      showToast('Não foi possível ler o código de barras nem o número. Digite no campo manual abaixo.', 'error');
      abrirCampoManual(
        '⚠️ Não foi possível ler pela câmera — Digite o número do patrimônio abaixo:',
        resultado ? resultado.partial : ''
      );
      return;
    }

    await processarRegistroCodigo(resultado.code, resultado.metodo || 'barcode');
  } catch (err) {
    console.error('Erro ao processar registro:', err);
    playBeep('error');
    showToast(err.message || 'Erro ao ler pela câmera. Use o preenchimento manual abaixo.', 'error');
    abrirCampoManual('⚠️ Erro na leitura pela câmera — Digite o patrimônio manualmente:');
  } finally {
    DOM.btnRegistrar.classList.remove('loading');
    DOM.btnRegistrar.innerHTML = originalHtml;
  }
}

async function handleSalvarManual() {
  if (!DOM.inputManualPatrimonio) return;
  const valorDigitado = normalizarPatrimonio(DOM.inputManualPatrimonio.value);
  if (!valorDigitado) {
    playBeep('error');
    showToast('Digite o número do patrimônio antes de salvar.', 'error');
    DOM.inputManualPatrimonio.focus();
    return;
  }
  await processarRegistroCodigo(valorDigitado, 'manual');
}

// ==========================================================================
// 12. MODAIS (DUPLICIDADE & CONFIGURAÇÃO GOOGLE DRIVE)
// ==========================================================================
function exibirModalDuplicidade(item) {
  DOM.modalDupCode.textContent = `PATRIMÔNIO: #${item.patrimonio}`;
  DOM.modalDupAndar.textContent = item.andar;
  DOM.modalDupLocal.textContent = item.localizacao;
  DOM.modalDupData.textContent = item.data;

  if (DOM.rowDupSetor) {
    if (item.setor) {
      DOM.rowDupSetor.style.display = 'flex';
      DOM.modalDupSetor.textContent = item.setor;
    } else {
      DOM.rowDupSetor.style.display = 'none';
    }
  }

  if (item.operador) {
    DOM.rowDupColetor.style.display = 'flex';
    DOM.modalDupColetor.textContent = item.operador;
  } else {
    DOM.rowDupColetor.style.display = 'none';
  }

  DOM.modalDuplicidade.style.display = 'flex';
}

function fecharModalDuplicidade() {
  DOM.modalDuplicidade.style.display = 'none';
}

function abrirModalCloud() {
  DOM.inputCloudUrl.value = getCloudUrl();
  DOM.modalCloudConfig.style.display = 'flex';
}

function fecharModalCloud() {
  DOM.modalCloudConfig.style.display = 'none';
}

async function salvarCloudUrl() {
  const url = DOM.inputCloudUrl.value.trim();
  if (url && !(url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/'))) {
    showToast('Insira uma URL válida (https://...)', 'error');
    return;
  }
  localStorage.setItem(STORAGE_KEYS.CLOUD_URL, url);
  fecharModalCloud();
  showToast('Conectando à Planilha do Google Drive...', 'info');
  const ok = await sincronizarComServidor();
  if (ok) {
    showToast('Conectado à Planilha do Google Drive com sucesso!', 'success');
  } else if (url) {
    showToast('URL salva, mas não foi possível conectar. Verifique as permissões do script.', 'error');
  }
}

async function copiarLinkEquipe() {
  const url = DOM.inputCloudUrl.value.trim() || getCloudUrl();
  if (!url || !(url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/'))) {
    showToast('Cole primeiro a URL da API/Planilha no campo acima.', 'error');
    return;
  }
  const baseUrl = window.location.origin + window.location.pathname;
  const shareUrl = `${baseUrl}?api=${encodeURIComponent(url)}`;
  try {
    await navigator.clipboard.writeText(shareUrl);
    showToast('Link copiado! Envie no WhatsApp da equipe para todos conectarem automaticamente.', 'success');
  } catch (e) {
    prompt('Copie o link abaixo para enviar à equipe:', shareUrl);
  }
}

// ==========================================================================
// 13. PERSISTÊNCIA DOS CAMPOS FIXADOS (COLETOR, ANDAR, LOCALIZAÇÃO E SETOR)
// ==========================================================================
function inicializarCamposFixados() {
  if (DOM.inputColetor) {
    const operadorSalvo = localStorage.getItem(STORAGE_KEYS.OPERADOR) || '';
    DOM.inputColetor.value = operadorSalvo;

    const salvarOperador = () => {
      localStorage.setItem(STORAGE_KEYS.OPERADOR, DOM.inputColetor.value.trim());
    };
    DOM.inputColetor.addEventListener('input', salvarOperador);
    DOM.inputColetor.addEventListener('change', salvarOperador);
  }

  if (DOM.inputSetor) {
    const setorSalvo = localStorage.getItem(STORAGE_KEYS.SETOR) || '';
    DOM.inputSetor.value = setorSalvo;

    const salvarSetor = () => {
      localStorage.setItem(STORAGE_KEYS.SETOR, DOM.inputSetor.value.trim());
    };
    DOM.inputSetor.addEventListener('input', salvarSetor);
    DOM.inputSetor.addEventListener('change', salvarSetor);
  }

  DOM.selectAndar.innerHTML = '';
  DOM.filterAndar.innerHTML = '<option value="">Todos os Andares</option>';

  ANDARES_LIST.forEach(andar => {
    const opt = document.createElement('option');
    opt.value = andar;
    opt.textContent = andar;
    DOM.selectAndar.appendChild(opt);

    const optFilter = document.createElement('option');
    optFilter.value = andar;
    optFilter.textContent = andar;
    DOM.filterAndar.appendChild(optFilter);
  });

  const andarSalvo = localStorage.getItem(STORAGE_KEYS.ANDAR) || 'Térreo';
  const localSalvo = localStorage.getItem(STORAGE_KEYS.LOCAL) || 'Frente';

  if (ANDARES_LIST.includes(andarSalvo)) {
    DOM.selectAndar.value = andarSalvo;
  }
  if (LOCALIZACOES_LIST.includes(localSalvo)) {
    DOM.selectLocalizacao.value = localSalvo;
  }

  DOM.selectAndar.addEventListener('change', () => {
    localStorage.setItem(STORAGE_KEYS.ANDAR, DOM.selectAndar.value);
  });

  DOM.selectLocalizacao.addEventListener('change', () => {
    localStorage.setItem(STORAGE_KEYS.LOCAL, DOM.selectLocalizacao.value);
  });
}

// ==========================================================================
// 14. TELA DE COLETAS REALIZADAS
// ==========================================================================
async function renderizarColetas() {
  await sincronizarComServidor();

  const todasColetas = await DB.listarTodos();
  todasColetas.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  const termoBusca = DOM.inputBusca.value.trim().toLowerCase();
  const filtroAndar = DOM.filterAndar.value;
  const filtroLocal = DOM.filterLocal.value;

  const coletasFiltradas = todasColetas.filter(item => {
    const pat = String(item.patrimonio || '').toLowerCase();
    const and = String(item.andar || '').toLowerCase();
    const loc = String(item.localizacao || '').toLowerCase();
    const set = String(item.setor || '').toLowerCase();
    const op = String(item.operador || '').toLowerCase();

    const bateTexto = !termoBusca ||
      pat.includes(termoBusca) ||
      and.includes(termoBusca) ||
      loc.includes(termoBusca) ||
      set.includes(termoBusca) ||
      op.includes(termoBusca);

    const bateAndar = !filtroAndar || item.andar === filtroAndar;
    const bateLocal = !filtroLocal || item.localizacao === filtroLocal;

    return bateTexto && bateAndar && bateLocal;
  });

  DOM.totalCountPill.textContent = todasColetas.length;
  DOM.coletasContainer.innerHTML = '';

  if (coletasFiltradas.length === 0) {
    DOM.coletasContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📦</div>
        <p class="empty-text">
          ${todasColetas.length === 0 ? 'Nenhum patrimônio coletado ainda.' : 'Nenhum registro encontrado para este filtro.'}
        </p>
      </div>
    `;
    return;
  }

  const grupos = {};
  coletasFiltradas.forEach(item => {
    const chave = `${item.andar} - ${item.localizacao}`;
    if (!grupos[chave]) {
      grupos[chave] = {
        andar: item.andar,
        localizacao: item.localizacao,
        itens: []
      };
    }
    grupos[chave].itens.push(item);
  });

  Object.values(grupos).forEach(grupo => {
    const cardGrupo = document.createElement('div');
    cardGrupo.className = 'group-card';

    cardGrupo.innerHTML = `
      <div class="group-header">
        <span class="group-title">
          <span>🏢 ${grupo.andar}</span>
          <span style="opacity: 0.5">•</span>
          <span>📍 ${grupo.localizacao}</span>
        </span>
        <span class="group-badge">${grupo.itens.length} ${grupo.itens.length === 1 ? 'item' : 'itens'}</span>
      </div>
      <div class="group-items">
        ${grupo.itens.map(item => `
          <div class="item-row" data-id="${item.patrimonio}">
            <div class="item-main">
              <span class="item-patrimonio">#${item.patrimonio}</span>
              <span class="item-meta">
                ${item.setor ? `<strong style="color:var(--color-accent)">🏷️ ${item.setor}</strong> • ` : ''}${item.operador ? `<strong style="color:var(--color-primary)">👤 ${item.operador}</strong> • ` : ''}Coletado em: ${item.data}
              </span>
            </div>
            <div class="item-actions">
              <button class="btn-delete-item" data-code="${item.patrimonio}" title="Excluir este item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    DOM.coletasContainer.appendChild(cardGrupo);
  });

  DOM.coletasContainer.querySelectorAll('.btn-delete-item').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const codigo = e.currentTarget.getAttribute('data-code');
      if (confirm(`Deseja realmente remover o patrimônio #${codigo}?`)) {
        await DB.excluir(codigo);
        await API.excluir(codigo);
        showToast(`Item #${codigo} removido.`, 'info');
        renderizarColetas();
      }
    });
  });
}

// ==========================================================================
// 15. EXPORTAÇÃO PARA PLANILHA EXCEL (.XLSX NO DISPOSITIVO SOLICITANTE)
// ==========================================================================
async function exportarParaExcel() {
  await sincronizarComServidor();
  const coletas = await DB.listarTodos();

  if (coletas.length === 0) {
    showToast('Nenhum patrimônio coletado ainda para exportar.', 'error');
    return;
  }

  coletas.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  const dadosFormatados = coletas.map(item => ({
    'Andar': item.andar,
    'Localização': item.localizacao,
    'Setor': item.setor || '',
    'Coletor': item.operador || '',
    'Patrimônio': normalizarPatrimonio(item.patrimonio),
    'Data da Coleta': item.data
  }));

  try {
    if (!window.XLSX) {
      showToast('Biblioteca SheetJS ainda carregando...', 'error');
      return;
    }

    const ws = XLSX.utils.json_to_sheet(dadosFormatados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Patrimônio Coletado');

    ws['!cols'] = [
      { wch: 16 }, // Andar
      { wch: 16 }, // Localização
      { wch: 22 }, // Setor
      { wch: 20 }, // Coletor
      { wch: 22 }, // Patrimônio
      { wch: 16 }  // Data da Coleta
    ];

    const dataHojeIso = new Date().toISOString().split('T')[0];
    const nomeArquivo = `coleta_patrimonio_${dataHojeIso}.xlsx`;

    XLSX.writeFile(wb, nomeArquivo);
    showToast(`Planilha ${nomeArquivo} baixada neste dispositivo!`, 'success');

  } catch (err) {
    console.error('Erro na exportação para Excel:', err);
    showToast('Falha ao gerar planilha Excel.', 'error');
  }
}

// ==========================================================================
// 16. MENU EXPANSÍVEL & NAVEGAÇÃO ENTRE AS TELAS
// ==========================================================================
function abrirMenu() {
  if (!DOM.floatingMenuPanel) return;
  DOM.floatingMenuPanel.style.display = 'flex';
  if (DOM.menuBackdrop) DOM.menuBackdrop.style.display = 'block';
  if (DOM.btnMenuToggle) DOM.btnMenuToggle.setAttribute('aria-expanded', 'true');
}

function fecharMenu() {
  if (!DOM.floatingMenuPanel) return;
  DOM.floatingMenuPanel.style.display = 'none';
  if (DOM.menuBackdrop) DOM.menuBackdrop.style.display = 'none';
  if (DOM.btnMenuToggle) DOM.btnMenuToggle.setAttribute('aria-expanded', 'false');
}

function alternarMenu() {
  if (!DOM.floatingMenuPanel) return;
  if (DOM.floatingMenuPanel.style.display === 'flex') {
    fecharMenu();
  } else {
    abrirMenu();
  }
}

function alternarTela(tela) {
  fecharMenu();
  if (tela === 'coletas') {
    DOM.viewScanner.style.display = 'none';
    DOM.viewColetas.style.display = 'flex';
    renderizarColetas();
  } else {
    DOM.viewColetas.style.display = 'none';
    DOM.viewScanner.style.display = 'flex';
  }
}

// ==========================================================================
// 17. SERVICE WORKER
// ==========================================================================
function registrarServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').then((reg) => {
        console.log('PWA Service Worker ativo:', reg.scope);
      }).catch((err) => {
        console.warn('Service Worker ignorado:', err);
      });
    });
  }
}

// ==========================================================================
// 18. VINCULAÇÃO DE EVENTOS & BOOTSTRAP
// ==========================================================================
function bindEventos() {
  if (DOM.btnMenuToggle) {
    DOM.btnMenuToggle.addEventListener('click', alternarMenu);
  }
  if (DOM.menuBackdrop) {
    DOM.menuBackdrop.addEventListener('click', fecharMenu);
  }

  DOM.btnNavColetas.addEventListener('click', () => alternarTela('coletas'));
  DOM.btnVoltarScanner.addEventListener('click', () => alternarTela('scanner'));
  DOM.btnNavExportar.addEventListener('click', () => {
    fecharMenu();
    exportarParaExcel();
  });

  if (DOM.btnConfigCloud) {
    DOM.btnConfigCloud.addEventListener('click', () => {
      fecharMenu();
      abrirModalCloud();
    });
  }
  DOM.statusCount.addEventListener('click', () => {
    fecharMenu();
    abrirModalCloud();
  });
  DOM.btnCloseCloudModal.addEventListener('click', fecharModalCloud);
  DOM.btnSaveCloudUrl.addEventListener('click', salvarCloudUrl);
  DOM.btnCopyShareLink.addEventListener('click', copiarLinkEquipe);
  DOM.modalCloudConfig.addEventListener('click', (e) => {
    if (e.target === DOM.modalCloudConfig) fecharModalCloud();
  });

  DOM.btnTorch.addEventListener('click', alternarLanterna);
  DOM.btnRetryCamera.addEventListener('click', iniciarCamera);

  DOM.btnRegistrar.addEventListener('click', handleRegistrar);

  if (DOM.btnToggleManual) {
    DOM.btnToggleManual.addEventListener('click', () => {
      if (DOM.manualInputCard && DOM.manualInputCard.style.display === 'flex') {
        fecharCampoManual();
      } else {
        abrirCampoManual('⌨️ Digite o número do patrimônio abaixo:');
      }
    });
  }
  if (DOM.btnCloseManual) {
    DOM.btnCloseManual.addEventListener('click', fecharCampoManual);
  }
  if (DOM.btnSalvarManual) {
    DOM.btnSalvarManual.addEventListener('click', handleSalvarManual);
  }
  if (DOM.inputManualPatrimonio) {
    DOM.inputManualPatrimonio.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSalvarManual();
      }
    });
  }

  DOM.btnModalOk.addEventListener('click', fecharModalDuplicidade);
  DOM.modalDuplicidade.addEventListener('click', (e) => {
    if (e.target === DOM.modalDuplicidade) fecharModalDuplicidade();
  });

  DOM.inputBusca.addEventListener('input', renderizarColetas);
  DOM.filterAndar.addEventListener('change', renderizarColetas);
  DOM.filterLocal.addEventListener('change', renderizarColetas);

  DOM.btnLimparTudo.addEventListener('click', async () => {
    const total = (await DB.listarTodos()).length;
    if (total === 0) return;

    if (confirm(`ATENÇÃO: Deseja apagar todas as ${total} coletas na Planilha do Google Drive e neste celular?`)) {
      await DB.limparTudo();
      await API.limpar();
      showToast('Base de coletas limpa globalmente.', 'info');
      renderizarColetas();
      sincronizarComServidor();
      DOM.lastScannedFeedback.style.display = 'none';
    }
  });

  // Atualização periódica da nuvem a cada 12 segundos
  setInterval(sincronizarComServidor, 12000);
}

document.addEventListener('DOMContentLoaded', async () => {
  verificarParametroUrlApi();
  inicializarCamposFixados();
  bindEventos();

  try {
    await initDB();
    await sincronizarComServidor();
  } catch (e) {
    console.error('Falha ao inicializar DB:', e);
  }

  await initBarcodeDetector();
  iniciarCamera();
  registrarServiceWorker();
  setTimeout(() => {
    initOcrWorker();
  }, 1500);
});
