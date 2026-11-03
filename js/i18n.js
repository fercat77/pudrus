// Lightweight i18n loader
(function(){
  const selectId = 'langSelect';
  const storageKey = 'pudrus_lang';
  let currentDict = {};

  function lookup(dict, key){
    return key.split('.').reduce((o,k)=>o && o[k], dict);
  }

  // Translate from JS: pudrusT('shell.saved', 'Saved', {name: 'x'}) -> replaces {name}
  window.pudrusT = function(key, fallback, vars){
    let txt = lookup(currentDict, key);
    if(typeof txt !== 'string') txt = fallback !== undefined ? fallback : key;
    if(vars) txt = txt.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
    return txt;
  };

  function storageGet(){
    try { return localStorage.getItem(storageKey); } catch(e){ return null; }
  }
  function storageSet(v){
    try { localStorage.setItem(storageKey, v); } catch(e){ /* private mode */ }
  }

  async function loadLang(code){
    try{
      const langPath = location.pathname.includes('/tools/')
        ? '../../lang/' + code + '.json'
        : 'lang/' + code + '.json';
      const res = await fetch(new URL(langPath, document.location));
      if(!res.ok) throw new Error('missing');
      return await res.json();
    }catch(e){
      return {};
    }
  }

  function applyTranslations(dict){
    currentDict = dict;
    document.querySelectorAll('[data-i18n]').forEach(el=>{
      const key = el.getAttribute('data-i18n');
      const txt = lookup(dict, key);
      if(txt === undefined){
        console.warn('Missing translation for key:', key);
        return;
      }
      if(el.hasAttribute('data-i18n-html')) el.innerHTML = txt; else el.textContent = txt;
    });

    // Handle placeholder translations
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el=>{
      const key = el.getAttribute('data-i18n-placeholder');
      const txt = lookup(dict, key);
      if(txt !== undefined) {
        el.setAttribute('placeholder', txt);
      } else {
        console.warn('Missing placeholder translation for key:', key);
      }
    });

    // Handle aria-label / title translations
    document.querySelectorAll('[data-i18n-title]').forEach(el=>{
      const txt = lookup(dict, el.getAttribute('data-i18n-title'));
      if(txt !== undefined){ el.setAttribute('title', txt); el.setAttribute('aria-label', txt); }
    });

    document.dispatchEvent(new CustomEvent('pudrus:i18n'));
  }

  function setSelector(code){
    const sel = document.getElementById(selectId);
    if(sel) sel.value = code;
  }

  async function init(){
    const sel = document.getElementById(selectId);
    let code = storageGet() || (navigator.language || 'es').slice(0, 2);
    if(!['es','en'].includes(code)) code = 'es';
    setSelector(code);
    document.documentElement.lang = code;
    const dict = await loadLang(code);
    applyTranslations(dict);

    if(sel){
      sel.addEventListener('change', async ()=>{
        const c = sel.value;
        storageSet(c);
        document.documentElement.lang = c;
        const d = await loadLang(c);
        applyTranslations(d);
      });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
