// 执行交付 HTML 的真实脚本。DOM/ECharts 仅模拟宿主；不修改交付文件和模型参数。
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const outDir=path.resolve(__dirname,'..');
const baseDir=path.join(__dirname,'fixtures');
const reportPath=path.join(outDir,'reports','test_report.json');
const plain=v=>JSON.parse(JSON.stringify(v));
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const expectedCounts={RQR:9,RQA:9,RQT:3,'RQR-M':4,'RQA-M':4};

function buildContext(html,kind){
  const elements={},numbers=[],events={},charts=[],blobs=[],allElements=[];
  function element(attrs={}){
    const classes=new Set((attrs.class||'').split(/\s+/).filter(Boolean));let inner='',value=String(attrs.value??'');
    const e={id:attrs.id||'',attributes:{...attrs},children:[],disabled:Object.hasOwn(attrs,'disabled'),hidden:Object.hasOwn(attrs,'hidden'),
      textContent:'',style:{},dataset:{},validationMessage:'',tagName:(attrs.tagName||'DIV').toUpperCase(),
      classList:{toggle(n,v){if(v===undefined)v=!classes.has(n);if(v)classes.add(n);else classes.delete(n);return v;},
        add(...names){names.forEach(n=>classes.add(n));},remove(...names){names.forEach(n=>classes.delete(n));},contains(n){return classes.has(n);}},
      setAttribute(k,v){this.attributes[k]=String(v);if(k==='class')this.className=String(v);if(k==='hidden')this.hidden=true;},
      removeAttribute(k){delete this.attributes[k];if(k==='hidden')this.hidden=false;},getAttribute(k){return Object.hasOwn(this.attributes,k)?this.attributes[k]:null;},
      setCustomValidity(v){this.validationMessage=v;},appendChild(child){this.children.push(child);child.parentElement=this;return child;},
      addEventListener(name,fn){(this.eventHandlers??={})[name]??=[];this.eventHandlers[name].push(fn);},
      remove(){},click(){this.clicked=true;if(this.onclick)this.onclick({target:this});for(const fn of this.eventHandlers?.click??[])fn({target:this});}};
    for(const [key,item] of Object.entries(attrs))if(key.startsWith('data-'))e.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=item;
    if(attrs.style)attrs.style.split(';').forEach(item=>{const idx=item.indexOf(':');if(idx>0)e.style[item.slice(0,idx).trim()]=item.slice(idx+1).trim();});
    Object.defineProperty(e,'value',{get(){return value;},set(v){value=String(v);}});
    Object.defineProperty(e,'className',{get(){return [...classes].join(' ');},set(v){classes.clear();String(v).split(/\s+/).filter(Boolean).forEach(c=>classes.add(c));}});
    Object.defineProperty(e,'innerHTML',{get(){return inner;},set(v){inner=String(v);e.children=[];e.textContent=inner.replace(/<[^>]*>/g,'');}});
    allElements.push(e);return e;
  }
  for(const m of html.matchAll(/<([a-z][\w:-]*)\b[^>]*\bid="([^"]+)"[^>]*>/g)){
    const attrs={tagName:m[1]};for(const a of m[0].matchAll(/([\w-]+)="([^"]*)"/g))attrs[a[1]]=a[2];
    if(/\sdisabled(?:\s|>)/.test(m[0]))attrs.disabled='';if(/\shidden(?:\s|>)/.test(m[0]))attrs.hidden='';
    assert.ok(!elements[attrs.id],'Duplicate DOM id '+attrs.id);elements[attrs.id]=element(attrs);
    if(attrs.type==='number')numbers.push(attrs.id);
  }
  for(const m of html.matchAll(/<select\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)){
    const options=[...m[2].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)];
    const choice=options.find(o=>/\bselected\b/.test(o[1]))||options[0];
    if(choice){const explicit=/value="([^"]*)"/.exec(choice[1]);elements[m[1]].value=explicit?explicit[1]:choice[2].replace(/<[^>]*>/g,'');}
  }
  const matches=(e,q)=>q==='input[type="number"]'?e.attributes.type==='number':q.startsWith('#')?e.id===q.slice(1):q.startsWith('.')?q.slice(1).split('.').every(c=>e.classList.contains(c)):e.tagName===q.toUpperCase();
  const document={getElementById(id){assert.ok(elements[id],'Unknown DOM id '+id);return elements[id];},
    createElement(tag){return element({tagName:tag});},body:element({tagName:'BODY'}),
    querySelectorAll(q){return allElements.filter(e=>matches(e,q));},querySelector(q){return allElements.find(e=>matches(e,q))||null;},
    addEventListener(name,fn){(events[name]??=[]).push(fn);}};
  function chart(){const c={option:null,history:[],setOption(option){
    const finite=v=>{if(typeof v==='number')assert.ok(Number.isFinite(v),'Nonfinite chart data');else if(Array.isArray(v))v.forEach(finite);else if(v&&typeof v==='object')Object.values(v).forEach(finite);};
    finite(option);this.option=option;this.history.push(option);},resize(){},dispose(){},clear(){this.option=null;}};charts.push(c);return c;}
  const ctx=vm.createContext({document,window:{__echartsReady:{then(){}},addEventListener(){}},
    setTimeout(){return 1;},clearTimeout(){},Blob:function(parts){blobs.push(parts.join(''));},
    URL:{createObjectURL(){return 'blob:test';},revokeObjectURL(){}},console});
  const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
  const main=scripts.find(code=>kind==='diagnostic'?code.includes('function calculateDiag('):code.includes('function recalc(')&&code.includes('function findHVL('));
  assert.ok(main,kind+' main calculator JS not found');vm.runInContext(main,ctx,{timeout:20000});
  for(const fn of events.DOMContentLoaded??[])fn();
  ctx.ch1=chart();ctx.ch2=chart();ctx.ch3=chart();
  if(typeof ctx.draw==='function')ctx.draw();else if(typeof ctx.drawDiag==='function')ctx.drawDiag();
  return {ctx,elements,numbers,events,charts,blobs,allElements,html};
}

const chartData=chart=>(chart.option?.series??[]).flatMap(s=>s.data??[]);
function close(actual,expected,message,allowedPercent=2){
  assert.ok(Number.isFinite(actual)&&Number.isFinite(expected),message+' must be finite');
  const pct=expected===0?(Math.abs(actual)<1e-12?0:Infinity):Math.abs(actual/expected-1)*100;
  assert.ok(pct<allowedPercent,message+': '+actual+' vs '+expected+', '+pct+'%');return pct;
}
function numeric(r,key){const o=r.o||r;const map={eF:'mean_energy_keV',eP:'energy_weighted_mean_keV',hc:'hc',hv1:'hv1',hv2:'hv2'};return o[key]??o[map[key]];}
function invoke(run,expression){return vm.runInContext(expression,run.ctx,{timeout:5000});}
function assertSpectrum(run,label){
  assert.ok(run.ctx.RES&&!run.ctx.RES.empty,label+' has spectrum result');
  assert.ok(chartData(run.ctx.ch1).length>0,label+' spectrum plotted');
  assert.ok(run.ctx.RES.pF.some(v=>v>0),label+' positive filtered spectrum');
}
function setRecalc(run,id,value){assert.ok(run.elements[id],'Input '+id);run.elements[id].value=value;invoke(run,'recalcDiag()');}

const required=['index.html','diagnostic.html','iec61267-2005.json'];
const missing=required.filter(f=>!fs.existsSync(path.join(outDir,f)));
if(missing.length){console.log(JSON.stringify({status:'waiting_for_root_pages',missing}));process.exit(0);}
try{
  const baseHtml=fs.readFileSync(path.join(baseDir,'iso-baseline.html.txt'),'utf8');
  const isoHtml=fs.readFileSync(path.join(outDir,'index.html'),'utf8');
  const diagHtml=fs.readFileSync(path.join(outDir,'diagnostic.html'),'utf8');
  const base=buildContext(baseHtml,'iso'),iso=buildContext(isoHtml,'iso'),diag=buildContext(diagHtml,'diagnostic');
  const iec=JSON.parse(fs.readFileSync(path.join(outDir,'iec61267-2005.json'),'utf8'));
  const golden=JSON.parse(fs.readFileSync(path.join(baseDir,'iso_golden.json'),'utf8'));
  const wReference=JSON.parse(fs.readFileSync(path.join(baseDir,'w_golden.json'),'utf8'));
  assert.deepEqual(plain(iso.ctx.FITTED_PARAMS),plain(base.ctx.FITTED_PARAMS),'ISO physical constants unchanged');
  assert.deepEqual(plain(iso.ctx.PRE),plain(base.ctx.PRE),'ISO full preset data unchanged');
  const isoPresets=Object.values(plain(base.ctx.PRE)).flat();assert.equal(isoPresets.length,50);
  let isoMax=0,wMax=0,moMax=0,isoCount=0,wCount=0,moCount=0,diagnosticCount=0;
  for(const row of isoPresets){base.ctx.applyPre(row);iso.ctx.applyPre(row);
    assert.deepEqual(plain(iso.ctx.RES),plain(base.ctx.RES),'ISO complete RES '+row[0]);
    const py=golden.results.find(r=>r.preset===row[0]);assert.ok(py,'ISO Python golden '+row[0]);
    for(const key of ['hv1','hv2','eF','eP'])isoMax=Math.max(isoMax,close(iso.ctx.RES.o[key],py.python[key],row[0]+' Python '+key));isoCount++;}
  const h60=isoPresets.find(r=>r[0]==='H-60');iso.ctx.applyPre(h60);assert.equal(iso.ctx.RES.mat,'Al','H-60 uses Al');
  const csvBefore=iso.blobs.length;iso.ctx.doExport();base.ctx.applyPre(h60);base.ctx.doExport();
  assert.equal(iso.blobs.length,csvBefore+1,'ISO CSV exported');assert.equal(iso.blobs.at(-1),base.blobs.at(-1),'ISO CSV complete content unchanged');
  assert.match(isoHtml,/href="(?:\.\/)?diagnostic\.html"/,'ISO navigation to separate diagnostic page');
  assert.match(diagHtml,/href="(?:\.\/)?index\.html"/,'Diagnostic navigation to separate ISO page');
  assert.ok(!/<[^>]+data-s="[NWHL]"/.test(diagHtml),'No ISO family tabs in diagnostic DOM');
  assert.ok(!/\bvar\s+PRE\s*=/.test(diagHtml),'No ISO preset block in diagnostic page');
  assert.equal(iec.qualities.length,29);
  for(const [family,count] of Object.entries(expectedCounts)){
    const qs=diag.ctx.items(family);assert.equal(qs.length,count,family+' preset count');
    const familyButton=diag.elements.familyTabs.children.find(b=>b.textContent===family);assert.ok(familyButton&&typeof familyButton.onclick==='function',family+' family button');familyButton.click();
    assert.equal(diag.elements.presetGrid.children.length,count,family+' rendered preset buttons');
    for(const q of qs){const button=diag.elements.presetGrid.children.find(b=>b.textContent===q.name);assert.ok(button&&typeof button.onclick==='function',q.name+' clickable preset');button.click();assert.equal(diag.ctx.ACTIVE.name,q.name,q.name+' active preset');
      const p=diag.ctx.presetParams(q),direct=diag.ctx.calculateDiag(p),fromTable=diag.ctx.modelResult(q);
      for(const key of ['hv1','hv2','eF','eP']){close(numeric(diag.ctx.RES,key),numeric(direct,key),q.name+' UI result '+key,1e-6);close(numeric(fromTable,key),numeric(direct,key),q.name+' computed table '+key,1e-6);}
      assert.equal(diag.ctx.RES.mat||diag.ctx.RES.hvl_material,'Al',q.name+' diagnostic HVL always Al');
      assertSpectrum(diag,q.name);
      if(q.family.includes('-M')){assert.equal(p.target,'Mo',q.name+' Mo target');close(p.fMo,.032,q.name+' standard Mo filter',1e-6);if(q.family==='RQA-M')close(p.fAl,2,q.name+' standard additional Al',1e-6);}
      else assert.equal(p.target,'W',q.name+' W target');
      const before=diag.blobs.length;diag.ctx.doDiagExport();assert.equal(diag.blobs.length,before+1,q.name+' CSV exported');
      assert.match(diag.blobs.at(-1),/E\(keV\),binWidth\(keV\),Phi0_bin,PhiF_bin,mu_Al,muen_Air/,q.name+' CSV has energy/fluence fields');
      diagnosticCount++;
    }
  }
  assert.equal(diagnosticCount,29);
  for(const record of wReference.records){const r=diag.ctx.calculateDiag(record.case);
    for(const key of ['hv1','hv2','hc','eF','eP'])wMax=Math.max(wMax,close(numeric(r,key),record.summary[key],record.case.name+' W Python '+key));
    for(const key of ['E','p0','pF']){assert.equal(r[key].length,record.spectrum[key].length,record.case.name+' '+key+' length');for(let i=0;i<r[key].length;i++)wMax=Math.max(wMax,close(r[key][i],record.spectrum[key][i],record.case.name+' '+key+' '+i));}wCount++;}
  const moPath=path.join(baseDir,'mo_golden.json');
  if(fs.existsSync(moPath)){
    const moReference=JSON.parse(fs.readFileSync(moPath,'utf8'));
    for(const record of [...moReference.records,...(moReference.interpolation_records||[])]){const sourceCase=record.case,label=record.name||'Mo '+sourceCase.kvp+' kV';
      const p={target:'Mo',kvp:sourceCase.kvp,ang:26,baseAl:0,fAl:sourceCase.al_mm,fCu:0,fMo:sourceCase.mo_mm};const r=diag.ctx.calculateDiag(p);
      for(const key of ['hv1','hv2','hc','eF','eP'])moMax=Math.max(moMax,close(numeric(r,key),numeric(record.summary,key),label+' Python '+key));
      const spectrum=record.spectrum||record;
      // Python 可保留参考网格的零尾箱，网页截去端点以上的零箱；积分含义必须完全一致。
      for(const key of ['E','p0','pF'])if(spectrum[key]){assert.ok(r[key].length<=spectrum[key].length,label+' '+key+' length');for(let i=0;i<r[key].length;i++)moMax=Math.max(moMax,close(r[key][i],spectrum[key][i],label+' '+key+' '+i));
        for(let i=r[key].length;i<spectrum[key].length;i++)if(key!=='E')assert.equal(spectrum[key][i],0,label+' zero tail bin '+key+' '+i);}moCount++;}
  }
  // 读取相同射线质但切换 IEC/TRS 参考来源，要求提示更新且物理谱计算一致。
  diag.ctx.applyDiag(diag.ctx.items('RQR')[0]);const beforeStandard=plain(diag.ctx.RES);
  const selector=diag.elements.standardSource||diag.elements.std||diag.elements.source;
  assert.ok(selector,'Standard source selector');selector.value='TRS';diag.ctx.changeStandard();
  assert.equal(diag.ctx.standardProfile(),'TRS','TRS source selected');assert.deepEqual(plain(diag.ctx.RES),beforeStandard,'Reference source switch preserves physical spectrum');
  const uiText=Object.values(diag.elements).map(e=>e.textContent+' '+e.innerHTML).join('\n');assert.match(uiText,/TRS[\s‑-]*457/,'TRS recommendations shown');
  // TRS角度输入限定5–27°；IEC保留5–30°。非法数字有视觉提示，且没有过期结果可导出。
  const angle=diag.elements.angle||diag.elements.ang;assert.ok(angle,'Diagnostic angle input');
  const angleId=angle.id,voltageId=diag.elements.kvpN?'kvpN':'kvp';let invalidCount=0;
  for(const [id,values] of [[voltageId,['','-1','0','999','Infinity','not-a-number']],[angleId,['-1','0','28','31']],['baseAl',['-1','999']],[diag.elements.fAl?'fAl':'al',['-1','999']],[diag.elements.fCu?'fCu':'cu',['-1','999']]]){
    for(const value of values){diag.ctx.applyDiag(diag.ctx.items('RQR')[0]);setRecalc(diag,id,value);
      assert.ok(diag.ctx.RES===null||diag.ctx.RES.empty,'Invalid input suppresses stale result '+id+' '+value);
      assert.ok(diag.elements[id].classList.contains('invalid')||diag.elements[id].getAttribute('aria-invalid')==='true','Invalid input visual feedback '+id+' '+value);
      const b=diag.blobs.length;diag.ctx.doDiagExport();assert.equal(diag.blobs.length,b,'Invalid input blocks CSV '+id+' '+value);invalidCount++;}
  }
  for(const value of ['','-1','999','Infinity']){diag.ctx.applyDiag(diag.ctx.items('RQR-M')[0]);setRecalc(diag,'fMo',value);
    assert.equal(diag.ctx.RES,null,'Invalid Mo thickness '+value);assert.ok(diag.elements.fMo.classList.contains('invalid'),'Mo thickness visual feedback '+value);
    const before=diag.blobs.length;diag.ctx.doDiagExport();assert.equal(diag.blobs.length,before,'Invalid Mo input CSV blocked '+value);invalidCount++;}
  selector.value='IEC';diag.ctx.changeStandard();assert.equal(diag.ctx.standardProfile(),'IEC');diag.ctx.applyDiag(diag.ctx.items('RQR')[0]);setRecalc(diag,angleId,'28');assert.ok(diag.ctx.RES&&!diag.ctx.RES.empty,'IEC permits 28 degrees');
  // 注入完全零谱，执行图表和导出路径；图表不能产生NaN/Infinity或保留旧谱。
  diag.ctx.applyDiag(diag.ctx.items('RQR')[0]);
  invoke(diag,'var originalExpForZeroTest=Math.exp; Math.exp=function(){return 0;}; try{recalcDiag();}finally{Math.exp=originalExpForZeroTest;}');
  assert.ok(diag.ctx.RES===null||diag.ctx.RES.empty,'Zero spectrum recognized');
  assert.equal(chartData(diag.ctx.ch1).length,0,'Zero spectrum clears filtered spectrum chart');
  assert.equal(chartData(diag.ctx.ch2).length,0,'Zero spectrum clears attenuation chart');
  const zeroCSV=diag.blobs.length;
  invoke(diag,'var originalExpForZeroExport=Math.exp; Math.exp=function(){return 0;}; try{doDiagExport();}finally{Math.exp=originalExpForZeroExport;}');
  assert.equal(diag.blobs.length,zeroCSV,'Zero spectrum CSV path exports no extra record');
  assert.equal(diag.ctx.findHVL(()=>1,.5),null,'Nondecaying attenuation has bounded fallback');
  assert.equal(diag.ctx.findHVL(()=>NaN,.5),null,'Nonfinite attenuation safely rejected');
  const sourceHashChecks={
    'fitted_params.json':sha(path.join(outDir,'iso_fitted_params.json')),
    'xray_model.py':sha(path.join(outDir,'iso_reference_model.py'))};
  assert.equal(sourceHashChecks['fitted_params.json'],'77cbcead63ce23ce6393fa349aa6732c8c077ca86ae9de554a2cf224aed64a47');
  assert.equal(sourceHashChecks['xray_model.py'],'1243f6d65be8fa837d0ec321cd8ff5da698b8e9ec323da402274df0cc6808fdb');
  const report={passed:true,iso_complete_regression_cases:isoCount,diagnostic_preset_and_spectrum_csv_cases:diagnosticCount,
    w_python_spectrum_comparison_cases:wCount,mo_python_spectrum_comparison_cases:moCount,
    max_js_python_deviation_percent:{ISO:isoMax,W:wMax,Mo:moMax},separate_page_navigation:true,no_iso_presets_in_diagnostic_dom:true,
    diagnostic_hvl_al:true,mammography_mo_target:true,invalid_input_cases:invalidCount,zero_spectrum_chart_safety:true,
    source_switch_updates_trs457:true,trs_angle_max27_iec_max30:true,original_iso_sha256:sourceHashChecks,
    delivered_html_sha256:{ISO:sha(path.join(outDir,'index.html')),diagnostic:sha(path.join(outDir,'diagnostic.html'))},
    limitation:'Node VM executes delivered JS with simulated DOM/ECharts. This verifies numerical data and UI state logic; it does not replace visual browser verification or physical standard conformity.'};
  fs.writeFileSync(reportPath,JSON.stringify(report,null,2),'utf8');console.log(JSON.stringify(report,null,2));
}catch(error){const report={passed:false,error:error.message,stack:error.stack};fs.writeFileSync(reportPath,JSON.stringify(report,null,2),'utf8');console.error(JSON.stringify(report,null,2));process.exitCode=1;}
