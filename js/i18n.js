// Lightweight i18n loader
(function(){
  const selectId = 'langSelect';
  const storageKey = 'pudrus_lang';

  async function loadLang(code){
    try{
      const res = await fetch('lang/' + code + '.json');
      if(!res.ok) throw new Error('missing');
      return await res.json();
    }catch(e){
      return {};
    }
  }

  function applyTranslations(dict){
    document.querySelectorAll('[data-i18n]').forEach(el=>{
      const key = el.getAttribute('data-i18n');
      const txt = key.split('.').reduce((o,k)=>o && o[k], dict);
      if(txt === undefined){
        console.warn('Missing translation for key:', key);
        return;
      }
      if(el.hasAttribute('data-i18n-html')) el.innerHTML = txt; else el.textContent = txt;
    });
  }

  function setSelector(code){
    const sel = document.getElementById(selectId);
    if(sel) sel.value = code;
  }

  async function init(){
    const sel = document.getElementById(selectId);
    let code = localStorage.getItem(storageKey) || (navigator.language || 'es').slice(0, 2);
    if(!['es','en'].includes(code)) code = 'es';
    setSelector(code);
    const dict = await loadLang(code);
    applyTranslations(dict);

    if(sel){
      sel.addEventListener('change', async ()=>{
        const c = sel.value;
        localStorage.setItem(storageKey, c);
        const d = await loadLang(c);
        applyTranslations(d);
      });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();

// --- WORKFLOW ---
const WORKFLOW_STORAGE_KEY = 'pudrus_workflow_image';

function sendTo(toolUrl, canvasElement, cropRect) {
    if (!canvasElement) {
        console.error('Workflow Error: Canvas element not provided.');
        return;
    }
    let exportCanvas = document.createElement('canvas');
    let exportCtx = exportCanvas.getContext('2d');

    let sx = cropRect ? cropRect.x : 0;
    let sy = cropRect ? cropRect.y : 0;
    let sWidth = cropRect ? cropRect.w : canvasElement.width;
    let sHeight = cropRect ? cropRect.h : canvasElement.height;

    exportCanvas.width = sWidth;
    exportCanvas.height = sHeight;

    exportCtx.drawImage(canvasElement, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);
    const dataUrl = exportCanvas.toDataURL('image/png');
    sessionStorage.setItem(WORKFLOW_STORAGE_KEY, dataUrl);
    window.location.href = `../${toolUrl}/index.html`;
}

function receiveImage() {
    const dataUrl = sessionStorage.getItem(WORKFLOW_STORAGE_KEY);
    if (dataUrl) {
        sessionStorage.removeItem(WORKFLOW_STORAGE_KEY); // Clear after reading
        return dataUrl;
    }
    return null;
}
