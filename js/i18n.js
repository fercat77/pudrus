// Lightweight i18n loader
(function(){
  const selectId = 'langSelect';
  const storageKey = 'pudrus_lang';

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
    document.querySelectorAll('[data-i18n]').forEach(el=>{
      const key = el.getAttribute('data-i18n');
      const txt = key.split('.').reduce((o,k)=>o && o[k], dict);
      if(txt === undefined){
        console.warn('Missing translation for key:', key);
        return;
      }
      if(el.hasAttribute('data-i18n-html')) el.innerHTML = txt; else el.textContent = txt;
    });
    
    // Handle placeholder translations
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el=>{
      const key = el.getAttribute('data-i18n-placeholder');
      const txt = key.split('.').reduce((o,k)=>o && o[k], dict);
      if(txt !== undefined) {
        el.setAttribute('placeholder', txt);
      } else {
        console.warn('Missing placeholder translation for key:', key);
      }
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
    document.documentElement.lang = code;
    const dict = await loadLang(code);
    applyTranslations(dict);

    if(sel){
      sel.addEventListener('change', async ()=>{
        const c = sel.value;
        localStorage.setItem(storageKey, c);
        document.documentElement.lang = c;
        const d = await loadLang(c);
        applyTranslations(d);
      });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
