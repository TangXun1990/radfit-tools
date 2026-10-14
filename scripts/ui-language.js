// RadFit UI language：界面语言独立于物理计算，存储不可用时仍可通过页面链接传递。
var UI_LANG='chs', UI_CHART_STATE='loading';
var UI_LANGUAGE_KEY='radfit.ui.language';
function uiT(chs,eng){return UI_LANG==='eng'?eng:chs;}
function uiInputName(id,chs){
  var names={kvpN:'Tube voltage',angle:'Anode angle',inh:'Inherent filtration thickness',fAl:'Al thickness',fCu:'Cu thickness',fSn:'Sn thickness',fPb:'Pb thickness',baseAl:'RQR baseline Al-equivalent filtration',fMo:'Mo thickness'};
  return UI_LANG==='eng'?(names[id]||chs):chs;
}
function uiChineseInputName(id){
  var names={kvpN:'管电压',angle:'靶角',inh:'固有过滤厚度',fAl:'Al 厚度',fCu:'Cu 厚度',fSn:'Sn 厚度',fPb:'Pb 厚度',baseAl:'RQR 基准 Al 等效过滤',fMo:'Mo 厚度'};
  return names[id]||id;
}
function readUiLanguage(){
  try{var match=(window.location&&window.location.search||'').match(/(?:^\?|&)lang=(eng|chs)(?:&|$)/i);if(match)return match[1].toLowerCase();}catch(error){}
  try{var saved=window.localStorage.getItem(UI_LANGUAGE_KEY);if(saved==='eng'||saved==='chs')return saved;}catch(error){}
  return 'chs';
}
function applyUiLanguage(){
  if(document.documentElement)document.documentElement.setAttribute('lang',UI_LANG==='eng'?'en':'zh-CN');
  document.title=typeof calculateDiag==='function'?uiT('诊断X射线 · IEC 61267 / TRS-457','Diagnostic X-rays · IEC 61267 / TRS-457'):uiT('ISO 4037 防护辐射质能谱','ISO 4037 radiation protection spectra');
  document.querySelectorAll('[data-en]').forEach(function(el){
    if(el.__chsText===undefined)el.__chsText=el.textContent;
    el.textContent=UI_LANG==='eng'?el.getAttribute('data-en'):el.__chsText;
  });
  document.querySelectorAll('[data-en-aria-label]').forEach(function(el){
    if(el.__chsAria===undefined)el.__chsAria=el.getAttribute('aria-label')||'';
    el.setAttribute('aria-label',UI_LANG==='eng'?el.getAttribute('data-en-aria-label'):el.__chsAria);
  });
  document.querySelectorAll('input[type="number"]').forEach(function(el){
    if(el.__chsInputAria===undefined)el.__chsInputAria=el.getAttribute('aria-label')||uiChineseInputName(el.id);
    el.setAttribute('aria-label',uiInputName(el.id,el.__chsInputAria));
  });
  ['eng','chs'].forEach(function(lang){var b=document.getElementById(lang==='eng'?'langENG':'langCHS');if(b){b.classList.toggle('active',UI_LANG===lang);b.setAttribute('aria-pressed',String(UI_LANG===lang));}});
  document.querySelectorAll('[data-page-link]').forEach(function(a){
    if(!a.__basePageHref)a.__basePageHref=(a.getAttribute('href')||'').split('?')[0];
    a.setAttribute('href',a.__basePageHref+'?lang='+UI_LANG);
  });
  var status=document.getElementById('chartStatus');
  if(status&&UI_CHART_STATE==='loading')status.textContent=uiT('图表组件加载中…','Loading charts…');
}
function updateUiLanguageURL(){
  try{
    if(!window.history||!window.location||!window.location.href)return;
    var href=window.location.href,hashIndex=href.indexOf('#'),hash=hashIndex>=0?href.slice(hashIndex):'';
    if(hashIndex>=0)href=href.slice(0,hashIndex);
    var parts=href.split('?'),query=(parts[1]||'').split('&').filter(function(p){return p&&!/^lang=/i.test(p);});
    query.push('lang='+UI_LANG);window.history.replaceState(null,'',parts[0]+'?'+query.join('&')+hash);
  }catch(error){}
}
function initLanguage(){UI_LANG=readUiLanguage();applyUiLanguage();}
function setLanguage(lang){
  if(lang!=='eng'&&lang!=='chs')return;
  UI_LANG=lang;try{window.localStorage.setItem(UI_LANGUAGE_KEY,lang);}catch(error){}
  updateUiLanguageURL();applyUiLanguage();
  if(typeof calculateDiag==='function'){renderTable();recalcDiag();}
  else{renderTable(typeof ISO_TABLE_ACTIVE==='string'?ISO_TABLE_ACTIVE:'N');recalc();}
  if(UI_CHART_STATE==='failed'){
    if(typeof showDiagChartFailure==='function')showDiagChartFailure();
    else if(typeof showChartFailure==='function')showChartFailure();
  }
}
