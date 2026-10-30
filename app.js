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
const DEFAULT_GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby5eBg4SFxCuKGeusvqaF2NP_Ev1-STaPHht4U4I47YOyNblUDoPBUH5IyYbLKLFQqT/exec';

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
  CLOUD_URL: 'patrimonio_google_script_url',
  AUTO_SCAN: 'patrimonio_auto_scan_enabled'
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
  btnToggleAutoScan: document.getElementById('btnToggleAutoScan'),
  lblAutoScanText: document.getElementById('lblAutoScanText'),
  scanInstructions: document.getElementById('scanInstructions'),
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
let isOnlineWithServer = false;
let isSyncing = false;
let activeSyncPromise = null;
let isProcessingRegistration = false;
let isAutoScanEnabled = false;
let isScanningLoopActive = false;
let autoScanLoopTimer = null;
let lastAutoRegisteredCode = '';
let lastAutoRegisteredTime = 0;
let persistentRecorteCanvas = null;
let globalAudioCtx = null;
let cacheMemoriaColetas = [];

// ==========================================================================
// 4. CLIENTE GOOGLE DRIVE (APPS SCRIPT WEB APP / AUTO-ENDPOINT)
// ==========================================================================
const DYNAMIC_ENDPOINT_GITHUB_API_URL = 'https://api.github.com/repos/OmegaGarou/leitorpatrimonio/contents/endpoint.json';
const DYNAMIC_ENDPOINT_DISCOVERY_URL = 'https://raw.githubusercontent.com/OmegaGarou/leitorpatrimonio/main/endpoint.json';
let cachedDynamicApiUrl = '';
let cachedFallbackApiUrl = '';

const PADRAO_DIGITOS_PATRIMONIO = 12;
const PREFIXO_PADRAO_PATRIMONIO = '10000';

function normalizarPatrimonio(valor) {
  return String(valor || '').trim().replace(/\./g, '');
}

function ehPatrimonioPadrao12Digitos(valor) {
  const limpo = normalizarPatrimonio(valor);
  return /^\d{12}$/.test(limpo) && limpo.startsWith(PREFIXO_PADRAO_PATRIMONIO);
}

function isUrlEndpointDiretoValido(url) {
  if (!url) return false;
  const u = url.trim();
  if (
    u.includes('docs.google.com/spreadsheets') ||
    u.includes('drive.google.com') ||
    u.includes('github.io') ||
    u.includes('serveousercontent.com') ||
    u.includes('trycloudflare.com') ||
    u.includes('Conectado automaticamente')
  ) {
    return false;
  }
  return u.startsWith('https://') || u.startsWith('http://') || u.startsWith('/');
}

function getCloudUrl() {
  const saved = (localStorage.getItem(STORAGE_KEYS.CLOUD_URL) || '').trim();
  if (saved && !isUrlEndpointDiretoValido(saved)) {
    localStorage.removeItem(STORAGE_KEYS.CLOUD_URL);
  } else if (saved) {
    return saved;
  }
  if (DEFAULT_GOOGLE_SCRIPT_URL && isUrlEndpointDiretoValido(DEFAULT_GOOGLE_SCRIPT_URL)) {
    return DEFAULT_GOOGLE_SCRIPT_URL;
  }
  if (cachedDynamicApiUrl) {
    return cachedDynamicApiUrl;
  }
  if (window.location.hostname.includes('github.io')) {
    return DEFAULT_GOOGLE_SCRIPT_URL || '';
  }
  return DEFAULT_GOOGLE_SCRIPT_URL || '/api';
}

async function lerEndpointViaGithubApi() {
  try {
    const respApi = await fetch(`${DYNAMIC_ENDPOINT_GITHUB_API_URL}?t=${Date.now()}`, {
      method: 'GET',
      headers: { 'Accept': 'application/vnd.github+json' },
      cache: 'no-store',
      credentials: 'omit',
      mode: 'cors'
    });
    if (respApi.ok) {
      const meta = await respApi.json();
      if (meta && meta.content) {
        const decoded = atob(String(meta.content).replace(/\s/g, ''));
        const info = JSON.parse(decoded);
        if (info && info.apiUrl) {
          cachedDynamicApiUrl = info.apiUrl.trim();
          cachedFallbackApiUrl = (info.fallbackApiUrl || '').trim();
          return cachedDynamicApiUrl;
        }
      }
    }
  } catch (e) {}
  return '';
}

async function lerEndpointViaGithubRaw() {
  try {
    const respRaw = await fetch(`${DYNAMIC_ENDPOINT_DISCOVERY_URL}?t=${Date.now()}`, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'omit',
      mode: 'cors'
    });
    if (respRaw.ok) {
      const info = await respRaw.json();
      if (info && info.apiUrl) {
        cachedDynamicApiUrl = info.apiUrl.trim();
        cachedFallbackApiUrl = (info.fallbackApiUrl || '').trim();
        return cachedDynamicApiUrl;
      }
    }
  } catch (e) {}
  return '';
}

async function descobrirEndpointAtivo(forceRefresh = false) {
  const fixed = getCloudUrl();
  if (fixed && fixed.startsWith('https://script.google.com/')) {
    return fixed;
  }
  if (!forceRefresh) {
    if (fixed) return fixed;
    const rawUrl = await lerEndpointViaGithubRaw();
    if (rawUrl) return rawUrl;
    const apiUrl = await lerEndpointViaGithubApi();
    if (apiUrl) return apiUrl;
  } else {
    const apiUrl = await lerEndpointViaGithubApi();
    if (apiUrl) return apiUrl;
    const rawUrl = await lerEndpointViaGithubRaw();
    if (rawUrl) return rawUrl;
  }

  return getCloudUrl() || (window.location.hostname.includes('github.io') ? '' : '/api');
}

function verificarParametroUrlApi() {
  try {
    const params = new URLSearchParams(window.location.search);
    const apiParam = params.get('api');
    if (apiParam) {
      if (isUrlEndpointDiretoValido(apiParam)) {
        localStorage.setItem(STORAGE_KEYS.CLOUD_URL, apiParam.trim());
      } else if (apiParam.includes('serveousercontent.com')) {
        cachedDynamicApiUrl = apiParam.trim();
      }
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
    if (!url) url = await descobrirEndpointAtivo(true);
    if (!url) return { status: 0, error: 'URL não configurada' };

    const payload = { ...item, patrimonio: normalizarPatrimonio(item.patrimonio) };

    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      try {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timeoutId = controller ? setTimeout(() => controller.abort(), 5000) : null;

        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'registrar', ...payload }),
          redirect: 'follow',
          mode: 'cors',
          credentials: 'omit',
          ...(controller ? { signal: controller.signal } : {})
        });
        if (timeoutId) clearTimeout(timeoutId);

        if (resp.status >= 500 && tentativa < 3) {
          if (tentativa === 1 && cachedFallbackApiUrl && cachedFallbackApiUrl !== url) {
            url = cachedFallbackApiUrl;
          } else {
            url = await descobrirEndpointAtivo(true);
          }
          await new Promise(r => setTimeout(r, 500));
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
          if (tentativa === 1 && cachedFallbackApiUrl && cachedFallbackApiUrl !== url) {
            url = cachedFallbackApiUrl;
          } else {
            url = await descobrirEndpointAtivo(true);
          }
          await new Promise(r => setTimeout(r, 500));
          continue;
        }
        return { status: 0, error: e };
      }
    }
    return { status: 0, error: 'Falha após retentativas' };
  },

  async listar(forceRefresh = false) {
    let url = await descobrirEndpointAtivo(forceRefresh);
    if (!url) url = await descobrirEndpointAtivo(true);
    if (!url) return null;

    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      try {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timeoutId = controller ? setTimeout(() => controller.abort(), 5000) : null;

        const sep = url.includes('?') ? '&' : '?';
        const resp = await fetch(`${url}${sep}action=listar&t=${Date.now()}`, {
          method: 'GET',
          redirect: 'follow',
          mode: 'cors',
          credentials: 'omit',
          cache: 'no-store',
          ...(controller ? { signal: controller.signal } : {})
        });
        if (timeoutId) clearTimeout(timeoutId);

        if (resp.status >= 500 && tentativa < 3) {
          if (tentativa === 1 && cachedFallbackApiUrl && cachedFallbackApiUrl !== url) {
            url = cachedFallbackApiUrl;
          } else {
            url = await descobrirEndpointAtivo(true);
          }
          await new Promise(r => setTimeout(r, 500));
          continue;
        }

        if (resp.ok) {
          const data = await resp.json();
          cachedDynamicApiUrl = url;
          return Array.isArray(data) ? data : (data.items || null);
        }
        if (tentativa < 3) {
          if (tentativa === 1 && cachedFallbackApiUrl && cachedFallbackApiUrl !== url) {
            url = cachedFallbackApiUrl;
          } else {
            url = await descobrirEndpointAtivo(true);
          }
          await new Promise(r => setTimeout(r, 500));
          continue;
        }
        return null;
      } catch (e) {
        if (tentativa < 3) {
          if (tentativa === 1 && cachedFallbackApiUrl && cachedFallbackApiUrl !== url) {
            url = cachedFallbackApiUrl;
          } else {
            url = await descobrirEndpointAtivo(true);
          }
          await new Promise(r => setTimeout(r, 500));
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
// 5. BANCO LOCAL (INDEXEDDB COM FALLBACK EM MEMÓRIA / LOCALSTORAGE PARA IOS)
// ==========================================================================
function carregarCacheMemoria() {
  try {
    const salvo = localStorage.getItem('patrimonio_backup_cache');
    if (salvo) {
      const parsed = JSON.parse(salvo);
      if (Array.isArray(parsed)) cacheMemoriaColetas = parsed;
    }
  } catch (e) {}
}

function salvarEmCacheMemoria(item) {
  try {
    const limpo = normalizarPatrimonio(item.patrimonio);
    const idx = cacheMemoriaColetas.findIndex(i => normalizarPatrimonio(i.patrimonio) === limpo);
    const registro = { ...item, patrimonio: limpo };
    if (idx >= 0) {
      cacheMemoriaColetas[idx] = registro;
    } else {
      cacheMemoriaColetas.unshift(registro);
    }
    localStorage.setItem('patrimonio_backup_cache', JSON.stringify(cacheMemoriaColetas.slice(0, 500)));
  } catch (e) {}
}

function buscarEmCacheMemoria(codigo) {
  const limpo = normalizarPatrimonio(codigo);
  return cacheMemoriaColetas.find(i => normalizarPatrimonio(i.patrimonio) === limpo) || null;
}

function initDB() {
  carregarCacheMemoria();
  return new Promise((resolve) => {
    if (!('indexedDB' in window)) {
      console.warn('IndexedDB não suportado neste navegador. Utilizando cache em memória.');
      resolve(null);
      return;
    }

    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        try {
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
        } catch (upErr) {
          console.warn('Aviso no onupgradeneeded:', upErr);
        }
      };

      request.onsuccess = (event) => {
        dbInstance = event.target.result;
        resolve(dbInstance);
      };

      request.onerror = (event) => {
        console.warn('IndexedDB inacessível (ex: navegação anônima iOS). Usando fallback em memória:', event && event.target ? event.target.error : '');
        resolve(null);
      };

      request.onblocked = () => {
        console.warn('IndexedDB bloqueado. Usando fallback em memória.');
        resolve(null);
      };
    } catch (err) {
      console.warn('Erro ao abrir IndexedDB:', err);
      resolve(null);
    }
  });
}

const DB = {
  async salvar(item) {
    salvarEmCacheMemoria(item);
    if (!dbInstance) return true;
    return new Promise((resolve) => {
      try {
        const tx = dbInstance.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put({ ...item, patrimonio: normalizarPatrimonio(item.patrimonio) });
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(true);
      } catch (e) {
        resolve(true);
      }
    });
  },

  async sincronizarEspelho(itensServidor, itensLocaisPendentes) {
    if (Array.isArray(itensServidor)) {
      cacheMemoriaColetas = itensServidor.map(item => ({
        patrimonio: normalizarPatrimonio(item.patrimonio),
        andar: item.andar || '',
        localizacao: item.localizacao || '',
        setor: item.setor || '',
        operador: item.operador || '',
        data: item.data || '',
        timestamp: Number(item.timestamp) || Date.now(),
        pendenteSync: false
      }));
      (itensLocaisPendentes || []).forEach(salvarEmCacheMemoria);
      try {
        localStorage.setItem('patrimonio_backup_cache', JSON.stringify(cacheMemoriaColetas.slice(0, 500)));
      } catch (e) {}
    }

    if (!dbInstance) return true;
    return new Promise((resolve) => {
      try {
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
      } catch (e) {
        resolve(false);
      }
    });
  },

  async buscarPorPatrimonio(codigo) {
    const limpo = normalizarPatrimonio(codigo);
    if (!dbInstance) {
      return buscarEmCacheMemoria(limpo);
    }
    return new Promise((resolve) => {
      try {
        const tx = dbInstance.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(limpo);
        req.onsuccess = () => resolve(req.result || buscarEmCacheMemoria(limpo));
        req.onerror = () => resolve(buscarEmCacheMemoria(limpo));
      } catch (e) {
        resolve(buscarEmCacheMemoria(limpo));
      }
    });
  },

  async listarTodos() {
    if (!dbInstance) {
      return [...cacheMemoriaColetas];
    }
    return new Promise((resolve) => {
      try {
        const tx = dbInstance.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => {
          const res = req.result || [];
          if (res.length > 0) {
            resolve(res);
          } else {
            resolve([...cacheMemoriaColetas]);
          }
        };
        req.onerror = () => resolve([...cacheMemoriaColetas]);
      } catch (e) {
        resolve([...cacheMemoriaColetas]);
      }
    });
  },

  async excluir(codigo) {
    const limpo = normalizarPatrimonio(codigo);
    const idx = cacheMemoriaColetas.findIndex(i => normalizarPatrimonio(i.patrimonio) === limpo);
    if (idx >= 0) {
      cacheMemoriaColetas.splice(idx, 1);
      try {
        localStorage.setItem('patrimonio_backup_cache', JSON.stringify(cacheMemoriaColetas.slice(0, 500)));
      } catch (e) {}
    }
    if (!dbInstance) return true;
    return new Promise((resolve) => {
      try {
        const tx = dbInstance.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(limpo);
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
  },

  async limparTudo() {
    cacheMemoriaColetas = [];
    try {
      localStorage.removeItem('patrimonio_backup_cache');
    } catch (e) {}
    if (!dbInstance) return true;
    return new Promise((resolve) => {
      try {
        const tx = dbInstance.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.clear();
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
  }
};

// ==========================================================================
// 6. SINCRONIZAÇÃO BIDIRECIONAL COM A PLANILHA DO GOOGLE DRIVE
// ==========================================================================
async function sincronizarComServidor(forceRefresh = false) {
  if (!dbInstance) return false;
  if (activeSyncPromise) {
    const prevResult = await activeSyncPromise;
    if (!forceRefresh) return prevResult;
  }

  isSyncing = true;
  activeSyncPromise = (async () => {
    try {
      const url = await descobrirEndpointAtivo(forceRefresh);
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
      const dadosServidor = await API.listar(forceRefresh);

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
      activeSyncPromise = null;
    }
  })();

  return activeSyncPromise;
}

// ==========================================================================
// 7. GERENCIAMENTO DE ÁUDIO & FEEDBACK TÁTIL (COMPATÍVEL COM POLÍTICAS DO SAFARI / IOS)
// ==========================================================================
function getSharedAudioContext() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!globalAudioCtx) {
      globalAudioCtx = new AudioContextClass();
    }
    if (globalAudioCtx.state === 'suspended') {
      globalAudioCtx.resume().catch(() => {});
    }
    return globalAudioCtx;
  } catch (e) {
    return null;
  }
}

function playBeep(type = 'success') {
  try {
    const ctx = getSharedAudioContext();
    if (ctx && ctx.state !== 'closed') {
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
    }
  } catch (e) {}

  try {
    if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
      navigator.vibrate(type === 'success' ? 70 : [100, 50, 100]);
    }
  } catch (e) {}
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
// 9. GERENCIAMENTO DA CÂMERA & VISOR (OTIMIZADO PARA IOS SAFARI & ANDROID)
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
    let constraints = {
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      },
      audio: false
    };

    try {
      cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (overErr) {
      // Fallback para modelos de iPhone/iPad que rejeitam restrições rígidas de resolução
      constraints = {
        video: { facingMode: 'environment' },
        audio: false
      };
      cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
    }

    DOM.cameraVideo.srcObject = cameraStream;
    DOM.cameraVideo.setAttribute('playsinline', 'true');
    DOM.cameraVideo.setAttribute('webkit-playsinline', 'true');

    try {
      await DOM.cameraVideo.play();
    } catch (ePlay) {}

    DOM.cameraVideo.onloadedmetadata = () => {
      try { DOM.cameraVideo.play(); } catch (e) {}
      checarSuporteLanterna();
      iniciarLoopLeituraAutomatica();
    };

    if (DOM.cameraVideo.videoWidth > 0) {
      checarSuporteLanterna();
      iniciarLoopLeituraAutomatica();
    }

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
// 10. MOTOR DE DECODIFICAÇÃO DE CÓDIGOS DE BARRAS (BARCODEDETECTOR + ZXING DIRETO)
// ==========================================================================
async function initBarcodeDetector() {
  if ('BarcodeDetector' in window) {
    try {
      const supportedFormats = await BarcodeDetector.getSupportedFormats();
      if (supportedFormats && supportedFormats.length > 0) {
        barcodeDetectorInstance = new BarcodeDetector({
          formats: supportedFormats
        });
      }
    } catch (e) {
      barcodeDetectorInstance = null;
    }
  }
}

function initHtml5QrCodeScanner() {
  if (!window.Html5Qrcode) return;
  try {
    let tempDiv = document.getElementById('tempQrReader');
    if (!tempDiv) {
      tempDiv = document.createElement('div');
      tempDiv.id = 'tempQrReader';
      tempDiv.style.display = 'none';
      document.body.appendChild(tempDiv);
    }
    if (!html5QrCodeScanner) {
      html5QrCodeScanner = new Html5Qrcode('tempQrReader', { verbose: false });
    }
  } catch (e) {
    console.warn('Falha ao inicializar motor ZXing:', e);
  }
}

function atualizarUiAutoScan() {
  if (!DOM.btnToggleAutoScan || !DOM.lblAutoScanText) return;

  if (isAutoScanEnabled) {
    DOM.btnToggleAutoScan.classList.add('active');
    DOM.lblAutoScanText.textContent = 'Auto Registro ON';
    if (DOM.scanInstructions) {
      DOM.scanInstructions.textContent = '⚡ Auto Registro ON • Aponte para o código';
    }
  } else {
    DOM.btnToggleAutoScan.classList.remove('active');
    DOM.lblAutoScanText.textContent = 'Auto Registro OFF';
    if (DOM.scanInstructions) {
      DOM.scanInstructions.textContent = 'Aponte para o código e clique em REGISTRAR';
    }
  }
}

function alternarModoAutoScan() {
  isAutoScanEnabled = !isAutoScanEnabled;
  localStorage.setItem(STORAGE_KEYS.AUTO_SCAN, isAutoScanEnabled ? 'true' : 'false');
  atualizarUiAutoScan();

  if (isAutoScanEnabled) {
    showToast('Auto Registro LIGADO (ON): a câmera registra assim que detectar.', 'success');
    iniciarLoopLeituraAutomatica();
  } else {
    showToast('Auto Registro DESLIGADO (OFF): use o botão REGISTRAR para gravar.', 'info');
    pararLoopLeituraAutomatica();
  }
}

function inicializarModoAutoScan() {
  const salvo = localStorage.getItem(STORAGE_KEYS.AUTO_SCAN);
  isAutoScanEnabled = salvo === 'true';
  atualizarUiAutoScan();
}

function iniciarLoopLeituraAutomatica() {
  if (!isAutoScanEnabled) return;
  if (isScanningLoopActive) return;
  isScanningLoopActive = true;
  executarCicloAutoScan();
}

function pararLoopLeituraAutomatica() {
  isScanningLoopActive = false;
  if (autoScanLoopTimer) {
    clearTimeout(autoScanLoopTimer);
    autoScanLoopTimer = null;
  }
}

async function executarCicloAutoScan() {
  if (!isAutoScanEnabled || !isScanningLoopActive) {
    isScanningLoopActive = false;
    return;
  }

  const podeLer =
    DOM.viewScanner && DOM.viewScanner.style.display !== 'none' &&
    DOM.cameraVideo && (DOM.cameraVideo.readyState >= 2 || DOM.cameraVideo.videoWidth > 0) &&
    !isProcessingRegistration &&
    (!DOM.manualInputCard || DOM.manualInputCard.style.display === 'none') &&
    (!DOM.modalDuplicidade || DOM.modalDuplicidade.style.display === 'none') &&
    (!DOM.modalCloudConfig || DOM.modalCloudConfig.style.display === 'none');

  if (podeLer) {
    try {
      const resultado = await capturarEDecodificarFrame();

      if (resultado && resultado.valido && resultado.code) {
        const agora = Date.now();
        const mesmoCodigoRecente =
          resultado.code === lastAutoRegisteredCode &&
          agora - lastAutoRegisteredTime < 4000;

        if (!mesmoCodigoRecente) {
          isProcessingRegistration = true;
          lastAutoRegisteredCode = resultado.code;
          lastAutoRegisteredTime = agora;

          // Efeito visual na mira de captura automática
          const reticle = document.querySelector('.scanner-reticle');
          if (reticle) {
            reticle.style.borderColor = '#10b981';
            reticle.style.boxShadow = '0 0 20px rgba(16, 185, 129, 0.6)';
            setTimeout(() => {
              reticle.style.borderColor = '';
              reticle.style.boxShadow = '';
            }, 600);
          }

          try {
            await processarRegistroCodigo(resultado.code, 'barcode');
          } finally {
            setTimeout(() => {
              isProcessingRegistration = false;
            }, 800);
          }
        }
      }
    } catch (e) {
      // Ignora pequenas oscilações de frame durante o ciclo contínuo
    }
  }

  // Intervalo de 350ms entre análises de quadros (baixo consumo de CPU e excelente resposta)
  if (isScanningLoopActive && isAutoScanEnabled) {
    autoScanLoopTimer = setTimeout(executarCicloAutoScan, 350);
  }
}

function gerarCanvasRecorteMira(sourceCanvas) {
  const sw = sourceCanvas.width;
  const sh = sourceCanvas.height;
  const cropW = Math.floor(sw * 0.86);
  const cropH = Math.floor(sh * 0.48);
  const cropX = Math.floor((sw - cropW) / 2);
  const cropY = Math.floor((sh - cropH) / 2);

  const targetW = Math.min(960, cropW);
  const scale = targetW / cropW;
  const targetH = Math.floor(cropH * scale);

  if (!persistentRecorteCanvas) {
    persistentRecorteCanvas = document.createElement('canvas');
  }
  persistentRecorteCanvas.width = targetW;
  persistentRecorteCanvas.height = targetH;

  const octx = persistentRecorteCanvas.getContext('2d', { willReadFrequently: true });
  octx.drawImage(sourceCanvas, cropX, cropY, cropW, cropH, 0, 0, targetW, targetH);
  return persistentRecorteCanvas;
}

// Decodificação direta nos pixels do Canvas via motor ZXing nativo (sem alocação de Blob ou File)
function decodificarCanvasSincrono(targetCanvas) {
  if (!html5QrCodeScanner || !targetCanvas) return null;
  try {
    if (html5QrCodeScanner.qrcode && html5QrCodeScanner.qrcode.primaryDecoder) {
      const res = html5QrCodeScanner.qrcode.primaryDecoder.decode(targetCanvas);
      if (res && res.text) return String(res.text).trim();
    }
  } catch (e) {
    // Exceção normal quando o quadro não possui código de barras legível
  }
  return null;
}

async function decodificarCanvasAssincrono(targetCanvas) {
  if (!html5QrCodeScanner || !targetCanvas) return null;
  try {
    if (html5QrCodeScanner.qrcode && typeof html5QrCodeScanner.qrcode.decodeAsync === 'function') {
      const res = await html5QrCodeScanner.qrcode.decodeAsync(targetCanvas);
      if (res && res.text) return String(res.text).trim();
    }
  } catch (e) {}
  return null;
}

async function capturarEDecodificarFrame(onProgress) {
  if (!DOM.cameraVideo) {
    throw new Error('Câmera indisponível.');
  }

  const vWidth = DOM.cameraVideo.videoWidth;
  const vHeight = DOM.cameraVideo.videoHeight;
  if (!vWidth || !vHeight) {
    throw new Error('Aguardando câmera inicializar...');
  }

  const canvas = DOM.photoCanvas;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  canvas.width = vWidth;
  canvas.height = vHeight;
  ctx.drawImage(DOM.cameraVideo, 0, 0, vWidth, vHeight);

  const recorteMira = gerarCanvasRecorteMira(canvas);
  let rawDetectado = null;

  // 1ª Tentativa: BarcodeDetector Nativo (se suportado pelo navegador e sistema operacional)
  if (barcodeDetectorInstance) {
    try {
      const barcodesCrop = await barcodeDetectorInstance.detect(recorteMira);
      if (barcodesCrop && barcodesCrop.length > 0 && barcodesCrop[0].rawValue) {
        rawDetectado = barcodesCrop[0].rawValue;
      } else {
        const barcodesFull = await barcodeDetectorInstance.detect(canvas);
        if (barcodesFull && barcodesFull.length > 0 && barcodesFull[0].rawValue) {
          rawDetectado = barcodesFull[0].rawValue;
        }
      }
    } catch (e) {}
  }

  // 2ª Tentativa: Decodificação ZXing nativa direta nos pixels do canvas (essencial para iOS Safari)
  if (!rawDetectado && html5QrCodeScanner) {
    // Primeiro tenta no recorte da mira (mais rápido e sem ruído de fundo)
    rawDetectado = decodificarCanvasSincrono(recorteMira);

    // Se não encontrou, tenta no quadro completo
    if (!rawDetectado) {
      rawDetectado = decodificarCanvasSincrono(canvas);
    }

    // Se ainda não encontrou, tenta assíncrono caso haja secundary decoder
    if (!rawDetectado) {
      rawDetectado = await decodificarCanvasAssincrono(recorteMira);
    }
  }

  if (!rawDetectado) {
    return { code: null, raw: null, metodo: null, valido: false };
  }

  const limpo = normalizarPatrimonio(rawDetectado).replace(/\D/g, '');

  // Validação estrita: 12 dígitos iniciando com 10000
  if (ehPatrimonioPadrao12Digitos(limpo)) {
    return { code: limpo, raw: rawDetectado, metodo: 'barcode', valido: true };
  }

  // Se o código de barras foi lido mas não é o padrão 12 dígitos com início 10000:
  // Força o preenchimento manual informando o que foi capturado
  return { code: null, raw: limpo || rawDetectado, metodo: 'barcode', valido: false };
}

// ==========================================================================
// 11. AÇÃO: REGISTRAR (CÂMERA OU CAMPO MANUAL EM CASO DE ERRO)
// ==========================================================================
function abrirCampoManual(mensagem) {
  if (!DOM.manualInputCard) return;
  if (DOM.manualInputTitle && mensagem) {
    DOM.manualInputTitle.textContent = mensagem;
  }
  DOM.manualInputCard.style.display = 'flex';
  if (DOM.inputManualPatrimonio) {
    // Limpa qualquer leitura parcial automática para garantir que numerações fora do padrão
    // só sejam registradas se forem efetivamente digitadas manualmente pelo usuário
    DOM.inputManualPatrimonio.value = '';
    setTimeout(() => {
      DOM.inputManualPatrimonio.focus();
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

  // Regra estrita: Leitura por câmera SÓ aceita o padrão de 12 números iniciando com 10000.
  // Numeração fora do padrão só é aceita quando digitada manualmente (metodo === 'manual').
  if (metodo !== 'manual' && !ehPatrimonioPadrao12Digitos(codigoLimpo)) {
    playBeep('error');
    showToast(
      `Código de barras fora do padrão (${codigoLimpo}). Deve ter 12 dígitos e iniciar com 10000. Use a digitação manual abaixo:`,
      'error'
    );
    abrirCampoManual(
      `⚠️ Código de barras fora do padrão (${codigoLimpo}). Digite manualmente abaixo:`
    );
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

    // Registra mesmo assim no Google Drive com a tag "já coletado" na Coluna H
    const registroDuplicado = {
      patrimonio: codigoLimpo,
      andar: andarSelecionado,
      localizacao: localSelecionado,
      setor: setorNome,
      operador: coletorNome,
      data: dataAtual,
      timestamp: Date.now(),
      observacao: 'já coletado',
      forceDuplicate: true,
      pendenteSync: false
    };

    API.registrar(registroDuplicado).catch(() => {});
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
    playBeep('error');
    exibirModalDuplicidade(itemDup);

    // Registra mesmo assim na Planilha do Google Drive com a tag "já coletado" na Coluna H
    const registroDuplicado = {
      ...novoRegistro,
      observacao: 'já coletado',
      forceDuplicate: true,
      pendenteSync: false
    };
    API.registrar(registroDuplicado).catch(() => {});
    return false;
  }

  const sufixoMetodo = metodo === 'manual' ? ' (digitado)' : '';
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

  isProcessingRegistration = true;
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

    if (!resultado || !resultado.valido) {
      playBeep('error');
      const capturado = resultado && resultado.raw ? String(resultado.raw) : '';
      if (capturado) {
        showToast(
          `Código lido (${capturado}) não inicia com 10000 ou não tem 12 dígitos. Digite manualmente abaixo:`,
          'error'
        );
        abrirCampoManual(
          `⚠️ Código lido fora do padrão (${capturado}). Digite o número correto:`
        );
      } else {
        showToast('Código de barras não identificado. Digite no campo manual abaixo:', 'error');
        abrirCampoManual(
          '⚠️ Não foi possível ler o código de barras — Digite o patrimônio manualmente:'
        );
      }
      return;
    }

    lastAutoRegisteredCode = resultado.code;
    lastAutoRegisteredTime = Date.now();
    await processarRegistroCodigo(resultado.code, 'barcode');
  } catch (err) {
    console.error('Erro ao processar registro:', err);
    playBeep('error');
    showToast(err.message || 'Erro ao ler pela câmera. Use o preenchimento manual abaixo.', 'error');
    abrirCampoManual('⚠️ Erro na leitura pela câmera — Digite o patrimônio manualmente:');
  } finally {
    DOM.btnRegistrar.classList.remove('loading');
    DOM.btnRegistrar.innerHTML = originalHtml;
    setTimeout(() => {
      isProcessingRegistration = false;
    }, 800);
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

  // Fecha o teclado virtual no iOS Safari para desobstruir a visão
  DOM.inputManualPatrimonio.blur();

  if (DOM.btnSalvarManual) {
    DOM.btnSalvarManual.disabled = true;
    DOM.btnSalvarManual.textContent = 'SALVANDO...';
  }

  try {
    await processarRegistroCodigo(valorDigitado, 'manual');
  } catch (err) {
    console.error('Erro ao salvar registro manual:', err);
    playBeep('error');
    showToast('Erro ao salvar: ' + (err.message || 'Tente novamente'), 'error');
  } finally {
    if (DOM.btnSalvarManual) {
      DOM.btnSalvarManual.disabled = false;
      DOM.btnSalvarManual.textContent = 'SALVAR';
    }
  }
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
  // Pequena pausa para o operador afastar a câmera da etiqueta duplicada
  setTimeout(() => {
    isProcessingRegistration = false;
  }, 1000);
}

async function abrirModalCloud() {
  DOM.inputCloudUrl.value = cachedDynamicApiUrl || getCloudUrl() || 'Conectado automaticamente via Google Sheets';
  DOM.modalCloudConfig.style.display = 'flex';
  if (!cachedDynamicApiUrl) {
    const descoberto = await descobrirEndpointAtivo(true);
    if (descoberto) {
      DOM.inputCloudUrl.value = descoberto;
    }
  }
}

function fecharModalCloud() {
  DOM.modalCloudConfig.style.display = 'none';
}

async function salvarCloudUrl() {
  const url = DOM.inputCloudUrl.value.trim();

  if (isUrlEndpointDiretoValido(url)) {
    localStorage.setItem(STORAGE_KEYS.CLOUD_URL, url);
  } else {
    // Se colou o link da planilha (docs.google.com/spreadsheets), link de túnel ou deixou em branco,
    // usa a descoberta automática em tempo real da ponte da Planilha Google!
    localStorage.removeItem(STORAGE_KEYS.CLOUD_URL);
    await descobrirEndpointAtivo(true);
  }

  fecharModalCloud();
  showToast('Conectando à Planilha do Google Drive...', 'info');
  const ok = await sincronizarComServidor(true);
  if (ok) {
    showToast('Conectado à Planilha do Google Drive com sucesso!', 'success');
  } else {
    showToast('Reconectando ao túnel da planilha... Tente novamente em alguns segundos.', 'error');
  }
}

async function copiarLinkEquipe() {
  const shareUrl = `${window.location.origin}${window.location.pathname}`;
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
          </div>
        `).join('')}
      </div>
    `;

    DOM.coletasContainer.appendChild(cardGrupo);
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
    pararLoopLeituraAutomatica();
    DOM.viewScanner.style.display = 'none';
    DOM.viewColetas.style.display = 'flex';
    renderizarColetas();
  } else {
    DOM.viewColetas.style.display = 'none';
    DOM.viewScanner.style.display = 'flex';
    iniciarLoopLeituraAutomatica();
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
// 18. VINCULAÇÃO DE EVENTOS & BOOTSTRAP (SUPORTE RÁPIDO AO TOQUE IOS / ANDROID)
// ==========================================================================
function bindFastClick(element, handler) {
  if (!element) return;
  let touchHandled = false;

  element.addEventListener('touchend', (e) => {
    touchHandled = true;
    e.preventDefault();
    handler(e);
    setTimeout(() => { touchHandled = false; }, 350);
  }, { passive: false });

  element.addEventListener('click', (e) => {
    if (touchHandled) return;
    handler(e);
  });
}

function bindEventos() {
  // Desbloqueia AudioContext na primeira interação do usuário (exigência do iOS Safari)
  const unlockAudio = () => {
    getSharedAudioContext();
    window.removeEventListener('touchstart', unlockAudio);
    window.removeEventListener('click', unlockAudio);
  };
  window.addEventListener('touchstart', unlockAudio, { passive: true });
  window.addEventListener('click', unlockAudio, { passive: true });

  if (DOM.btnMenuToggle) {
    bindFastClick(DOM.btnMenuToggle, alternarMenu);
  }
  if (DOM.menuBackdrop) {
    bindFastClick(DOM.menuBackdrop, fecharMenu);
  }

  if (DOM.btnNavColetas) {
    bindFastClick(DOM.btnNavColetas, () => alternarTela('coletas'));
  }
  if (DOM.btnVoltarScanner) {
    bindFastClick(DOM.btnVoltarScanner, () => alternarTela('scanner'));
  }

  if (DOM.btnConfigCloud) {
    bindFastClick(DOM.btnConfigCloud, () => {
      fecharMenu();
      abrirModalCloud();
    });
  }
  if (DOM.statusCount) {
    bindFastClick(DOM.statusCount, () => {
      fecharMenu();
      abrirModalCloud();
    });
  }
  if (DOM.btnCloseCloudModal) bindFastClick(DOM.btnCloseCloudModal, fecharModalCloud);
  if (DOM.btnSaveCloudUrl) bindFastClick(DOM.btnSaveCloudUrl, salvarCloudUrl);
  if (DOM.btnCopyShareLink) bindFastClick(DOM.btnCopyShareLink, copiarLinkEquipe);
  if (DOM.modalCloudConfig) {
    DOM.modalCloudConfig.addEventListener('click', (e) => {
      if (e.target === DOM.modalCloudConfig) fecharModalCloud();
    });
  }

  if (DOM.btnTorch) bindFastClick(DOM.btnTorch, alternarLanterna);
  if (DOM.btnRetryCamera) bindFastClick(DOM.btnRetryCamera, iniciarCamera);

  // Botões principais de registro com resposta instantânea ao toque (sem atraso de 300ms)
  if (DOM.btnRegistrar) {
    bindFastClick(DOM.btnRegistrar, handleRegistrar);
  }

  if (DOM.btnToggleAutoScan) {
    bindFastClick(DOM.btnToggleAutoScan, alternarModoAutoScan);
  }

  if (DOM.btnToggleManual) {
    bindFastClick(DOM.btnToggleManual, () => {
      if (DOM.manualInputCard && DOM.manualInputCard.style.display === 'flex') {
        fecharCampoManual();
      } else {
        abrirCampoManual('⌨️ Digite o número do patrimônio abaixo:');
      }
    });
  }

  if (DOM.btnCloseManual) {
    bindFastClick(DOM.btnCloseManual, fecharCampoManual);
  }

  if (DOM.btnSalvarManual) {
    bindFastClick(DOM.btnSalvarManual, handleSalvarManual);
  }

  if (DOM.inputManualPatrimonio) {
    DOM.inputManualPatrimonio.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.keyCode === 13) {
        e.preventDefault();
        handleSalvarManual();
      }
    });
  }

  if (DOM.btnModalOk) {
    bindFastClick(DOM.btnModalOk, fecharModalDuplicidade);
  }
  if (DOM.modalDuplicidade) {
    DOM.modalDuplicidade.addEventListener('click', (e) => {
      if (e.target === DOM.modalDuplicidade) fecharModalDuplicidade();
    });
  }

  DOM.inputBusca.addEventListener('input', renderizarColetas);
  DOM.filterAndar.addEventListener('change', renderizarColetas);
  DOM.filterLocal.addEventListener('change', renderizarColetas);

  // Atualização periódica da nuvem a cada 12 segundos
  setInterval(sincronizarComServidor, 12000);
}

document.addEventListener('DOMContentLoaded', async () => {
  verificarParametroUrlApi();
  inicializarCamposFixados();
  inicializarModoAutoScan();
  bindEventos();

  try {
    await initDB();
    await sincronizarComServidor();
  } catch (e) {
    console.error('Falha ao inicializar DB:', e);
  }

  await initBarcodeDetector();
  initHtml5QrCodeScanner();
  iniciarCamera();
  registrarServiceWorker();
});
