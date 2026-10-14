// 语言切换不应改变输入、当前辐射质、计算结果或原 CSV；执行实际交付页脚本。
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {buildContext,invoke,strip}=require('./harness.cjs');
const root=path.resolve(__dirname,'..'),key='radfit.ui.language';
const plain=v=>JSON.parse(JSON.stringify(v)),hasChinese=v=>/[\u3400-\u9fff]/.test(String(v));
const files={iso:'index.html',diagnostic:'diagnostic.html'},cases=[];
function create(kind,options={}){return buildContext(fs.readFileSync(path.join(root,files[kind]),'utf8'),kind,options);}
function recalc(run,kind){invoke(run,kind==='iso'?'recalc()':'recalcDiag()');}
function language(run,value){assert.equal(typeof run.ctx.setLanguage,'function');run.ctx.setLanguage(value);assert.equal(run.ctx.UI_LANG,value);}
function csv(run,kind){const before=run.blobs.length;invoke(run,kind==='iso'?'doExport()':'doDiagExport()');assert.equal(run.blobs.length,before+1,'Valid CSV export');return run.blobs.at(-1);}
function active(run,selector,data){return run.document.querySelector(selector)?.dataset[data]??null;}
function snapshot(run,kind){return {inputs:Object.fromEntries(run.numbers.map(id=>[id,run.elements[id].value])),
  selects:Object.fromEntries(run.allElements.filter(e=>e.id&&e.tagName==='SELECT').map(e=>[e.id,e.value])),
  disabled:Object.fromEntries(run.numbers.map(id=>[id,run.elements[id].disabled])),result:plain(run.ctx.RES),
  family:kind==='iso'?active(run,'.tab.active','s'):run.ctx.FAMILY,
  table:kind==='iso'?active(run,'.table-tab.active','t'):run.ctx.FAMILY,
  preset:kind==='diagnostic'?run.ctx.ACTIVE?.name:null,
  numbers:Object.fromEntries(Object.entries(run.elements).filter(([id])=>/^o_/.test(id)).map(([id,e])=>[id,e.textContent]))};}
function translated(run,kind){
  const marked=run.document.querySelectorAll('[data-en]');assert.ok(marked.length>=20,kind+' has broad static translation coverage');
  for(const e of marked)assert.equal(e.textContent.trim(),strip(e.getAttribute('data-en')).trim(),kind+' static ENG '+e.id+' '+e.tagName);
  for(const id of run.numbers)assert.ok(!hasChinese(run.elements[id].getAttribute('aria-label')),kind+' English input aria-label '+id);
  for(const id of ['calcStatus','inputStatus','tableWrap','chartStatus'])assert.ok(!hasChinese(run.elements[id]?.textContent),kind+' English '+id);
  for(const chart of run.charts)for(const property of ['title','legend','xAxis','yAxis','series']){
    const value=chart.option?.[property];if(!value)continue;
    const labels=Array.isArray(value)?value.map(v=>v.name||v.text||''):Object.keys(value).filter(k=>['text','name','data'].includes(k)).map(k=>value[k]);
    assert.ok(!hasChinese(labels),kind+' English chart '+property);
  }
  if(kind==='diagnostic')for(const id of ['targetLabel','sourceAssembly','qualityRequirements','standardNote','tableTitle','tableNote','selection'])
    assert.ok(!hasChinese(run.elements[id].textContent),kind+' English '+id);
  assert.equal(run.document.documentElement.lang,'en',kind+' English HTML lang');
  assert.ok(!hasChinese(run.document.title),kind+' English browser title');
  for(const e of run.document.querySelectorAll('[data-page-link]'))assert.match(e.href,/\?lang=eng(?:&|$)/,kind+' English navigation');
  assert.equal(run.elements.langENG.getAttribute('aria-pressed'),'true');assert.equal(run.elements.langCHS.getAttribute('aria-pressed'),'false');
  return marked.length;
}
function customize(run,kind){
  if(kind==='iso'){
    run.document.querySelector('[data-s="L"]').click();
    run.ctx.applyPre(run.ctx.PRE.L.find(q=>q[0]==='L-30'));
    run.document.querySelector('[data-t="H"]').click();
    const values={kvpN:73.5,angle:23.5,inh:1.25,fAl:4.2,fCu:.1,fSn:0,fPb:0};
    for(const [id,value] of Object.entries(values))run.elements[id].value=value;
    run.elements.inhMat.value='Be';run.elements.hvlMat.value='Al';run.ctx.onInhMat(true);recalc(run,kind);
  }else{
    run.ctx.applyDiag(run.ctx.items('RQA').find(q=>q.number===5));run.elements.standardSource.value='TRS';run.ctx.changeStandard();
    const values={kvpN:81.5,angle:22,baseAl:3.14,fAl:12.5,fCu:.01};for(const [id,value] of Object.entries(values))run.elements[id].value=value;recalc(run,kind);
  }
  assert.ok(run.ctx.RES&&!run.ctx.RES.empty,kind+' custom spectrum valid');
}
try{
  const helper=fs.readFileSync(path.join(root,'scripts','ui-language.js'),'utf8').replace(/\r\n/g,'\n').trim();
  for(const file of Object.values(files))assert.ok(fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n').includes(helper),file+' embeds the maintained common language helper exactly');
  cases.push('both standalone pages embed the exact maintained common helper');
  let translations=0;
  for(const kind of Object.keys(files)){
    const run=create(kind);assert.equal(run.ctx.UI_LANG,'chs',kind+' default CHS');customize(run,kind);
    const before=snapshot(run,kind),originalCSV=csv(run,kind);
    run.elements.langENG.click();assert.equal(run.ctx.UI_LANG,'eng');translations+=translated(run,kind);
    assert.deepEqual(snapshot(run,kind),before,kind+' switch preserves complete custom input/result/selection state');
    assert.equal(csv(run,kind),originalCSV,kind+' complete CSV identical in ENG');assert.equal(run.storageData[key],'eng');
    run.elements.langCHS.click();assert.equal(run.ctx.UI_LANG,'chs');assert.deepEqual(snapshot(run,kind),before,kind+' CHS roundtrip state');
    assert.equal(csv(run,kind),originalCSV,kind+' complete CSV identical after CHS roundtrip');assert.equal(run.storageData[key],'chs');
    assert.equal(run.document.documentElement.lang,'zh-CN');assert.equal(run.elements.langCHS.getAttribute('aria-pressed'),'true');
    assert.equal(run.elements.langENG.getAttribute('aria-pressed'),'false');
    for(const e of run.document.querySelectorAll('[data-page-link]'))assert.match(e.href,/\?lang=chs(?:&|$)/,kind+' Chinese navigation');
    cases.push(kind+' custom values, family/table/source, results and CSV roundtrip');

    // 输入非法时切换语言仍须保留输入值与红色提示，并清除过期结果。
    run.elements.kvpN.value='-7';recalc(run,kind);assert.equal(run.ctx.RES,null);assert.ok(hasChinese(run.elements.inputStatus.textContent));
    language(run,'eng');assert.equal(run.elements.kvpN.value,'-7');assert.equal(run.ctx.RES,null);
    assert.ok(run.elements.kvpN.classList.contains('invalid'));assert.equal(run.elements.kvpN.getAttribute('aria-invalid'),'true');
    assert.ok(!hasChinese(run.elements.inputStatus.textContent)&&run.elements.inputStatus.textContent.length>0,kind+' English validation visible');
    assert.ok(!hasChinese(run.elements.kvpN.validationMessage)&&run.elements.kvpN.validationMessage.length>0,kind+' English browser validity message');
    assert.ok(!hasChinese(run.elements.calcStatus.textContent));translated(run,kind);
    const count=run.blobs.length;invoke(run,kind==='iso'?'doExport()':'doDiagExport()');assert.equal(run.blobs.length,count,kind+' invalid CSV blocked');
    language(run,'chs');assert.equal(run.elements.kvpN.value,'-7');assert.ok(hasChinese(run.elements.inputStatus.textContent));
    cases.push(kind+' invalid value and localized errors');

    const selected=create(kind);if(kind==='iso')selected.ctx.applyPre(selected.ctx.PRE.H.find(q=>q[0]==='H-60'));
    else selected.ctx.applyDiag(selected.ctx.items('RQA-M').find(q=>q.number===3));
    const selectedResult=snapshot(selected,kind),selectedCSV=csv(selected,kind);language(selected,'eng');
    assert.deepEqual(snapshot(selected,kind),selectedResult,kind+' preset state survives ENG');assert.equal(csv(selected,kind),selectedCSV,kind+' preset complete CSV unchanged');
    if(kind==='diagnostic')assert.equal(selected.ctx.RES.p.target,'Mo','Mo target preserved by translation');
    translated(selected,kind);cases.push(kind+' selected preset and CSV');

    const coverage=create(kind);language(coverage,'eng');
    if(kind==='iso')for(const family of ['N','W','H','L']){
      coverage.document.querySelector('[data-s="'+family+'"]').click();coverage.document.querySelector('[data-t="'+family+'"]').click();translated(coverage,kind);
    }else for(const family of ['RQR','RQA','RQT','RQR-M','RQA-M'])for(const q of coverage.ctx.items(family)){
      coverage.ctx.applyDiag(q);translated(coverage,kind);
      coverage.elements.standardSource.value='TRS';coverage.ctx.changeStandard();translated(coverage,kind);
      coverage.elements.standardSource.value='IEC';coverage.ctx.changeStandard();
    }
    cases.push(kind+' every family table and diagnostic preset requirement translated');

    // 零谱下的切换继续走真实空图路径；有限性由图表模拟器同步检查。
    const zero=create(kind);invoke(zero,'var testOriginalExp=Math.exp; Math.exp=function(){return 0;};');
    try{recalc(zero,kind);language(zero,'eng');assert.ok(zero.ctx.RES===null||zero.ctx.RES.empty,kind+' zero spectrum');
      for(const chart of [zero.ctx.ch1,zero.ctx.ch2]){assert.equal(chart.option.series.length,0);assert.ok(!hasChinese(chart.option.title.text));}
      assert.ok(!hasChinese(zero.elements.calcStatus.textContent));assert.equal(zero.elements.exportBtn.disabled,true);
    }finally{invoke(zero,'Math.exp=testOriginalExp;');}
    cases.push(kind+' zero-spectrum translated empty charts');

    const saved=create(kind,{storage:{[key]:'eng'}});assert.equal(saved.ctx.UI_LANG,'eng',kind+' saved ENG restored');translated(saved,kind);
    const override=create(kind,{storage:{[key]:'eng'},search:'?lang=chs'});assert.equal(override.ctx.UI_LANG,'chs',kind+' query overrides saved ENG');
    const query=create(kind,{storage:{[key]:'chs'},search:'?lang=eng'});assert.equal(query.ctx.UI_LANG,'eng',kind+' query ENG overrides saved CHS');translated(query,kind);
    const invalid=create(kind,{storage:{[key]:'nonsense'},search:'?lang=not-a-language'});assert.equal(invalid.ctx.UI_LANG,'chs',kind+' invalid preferences fallback CHS');
    for(const storageThrows of [true,'get','set']){const denied=create(kind,{storageThrows,search:'?lang=eng'});assert.equal(denied.ctx.UI_LANG,'eng',kind+' query works when storage '+storageThrows+' denied');
      const result=snapshot(denied,kind);language(denied,'chs');assert.deepEqual(snapshot(denied,kind),result,kind+' denied storage CHS state');language(denied,'eng');translated(denied,kind);
      assert.match(denied.location.search,/lang=eng/);
      if(storageThrows===true){
        const reload=create(kind,{storageThrows,search:denied.location.search});assert.equal(reload.ctx.UI_LANG,'eng',kind+' reload retains language with denied storage');
        const other=kind==='iso'?'diagnostic':'iso',nav=denied.document.querySelectorAll('[data-page-link]').find(e=>e.getAttribute('href').startsWith(files[other]));
        assert.ok(nav,kind+' navigation to '+other);const destination=create(other,{storageThrows,search:'?'+nav.getAttribute('href').split('?')[1]});
        assert.equal(destination.ctx.UI_LANG,'eng',kind+' cross-page navigation retains language with denied storage');
      }}
    const failed=create(kind,{chartLoadResult:false,search:'?lang=eng'});assert.ok(!hasChinese(failed.elements.chartStatus.textContent));
    assert.ok(failed.elements.chartStatus.textContent.length>0,kind+' translated failed chart notice');language(failed,'chs');assert.ok(hasChinese(failed.elements.chartStatus.textContent));
    const restricted=create(kind,{storageThrows:true,historyThrows:true});language(restricted,'eng');translated(restricted,kind);
    assert.ok(restricted.ctx.RES&&!restricted.ctx.RES.empty,kind+' language switch survives both storage and history denial');
    for(const nav of restricted.document.querySelectorAll('[data-page-link]'))assert.match(nav.href,/\?lang=eng$/,kind+' links preserve language when storage/history denied');
    cases.push(kind+' preference restore/query override/storage denial/chart CDN failure');
  }
  const report={passed:true,pages:2,translated_static_nodes:translations,cases,
    common_helper_inline_copies_match:true,storage_denied_reload_and_navigation:true,storage_and_history_denial_safe:true,
    full_csv_language_invariance:true,physical_results_language_invariance:true,
    limitation:'Executes delivered inline JS in Node VM with simulated DOM/ECharts; numerical regression remains separately verified by tests/verify.cjs.'};
  fs.mkdirSync(path.join(root,'reports'),{recursive:true});fs.writeFileSync(path.join(root,'reports','language_test_report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){console.error(error.stack);process.exitCode=1;}
