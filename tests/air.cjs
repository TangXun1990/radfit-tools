// Compare delivered pages with the original Python spectra and an independent
// per-energy Beer–Lambert / HVL reference. No fitted parameters are modified.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {buildContext,invoke}=require('./harness.cjs');
const root=path.resolve(__dirname,'..');
const html=name=>fs.readFileSync(path.join(root,name),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
const iso=buildContext(html('index.html'),'iso');
const diag=buildContext(html('diagnostic.html'),'diagnostic');
const baseline=buildContext(html('tests/fixtures/iso-baseline.html.txt'),'iso');
const inputs=[];
let peakDifference=0,spectralBins=0;

function close(actual,expected,label,percent=2){
  assert.ok(Number.isFinite(actual)&&Number.isFinite(expected),label+' must be finite');
  const difference=expected===0?(Math.abs(actual)<1e-13?0:Infinity):Math.abs(actual/expected-1)*100;
  assert.ok(difference<percent,label+': JS '+actual+' vs Python '+expected+' ('+difference+'%)');
  peakDifference=Math.max(peakDifference,difference);
}
function useDistance(run,kind,distance){
  assert.ok(run.elements.airDistance,kind+' has air distance input');
  run.elements.airDistance.value=String(distance);
  invoke(run,kind==='iso'?'recalc()':'recalcDiag()');
  assert.ok(run.ctx.RES&&!run.ctx.RES.empty,kind+' '+distance+' m has a valid spectrum');
  return plain(run.ctx.RES);
}
function record(run,kind,name,distance){
  const result=useDistance(run,kind,distance);
  inputs.push({kind,name,distance,p:result.p,material:result.mat,result});
  return result;
}
function runPython(cases){
  const candidates=process.env.RADFIT_PYTHON?[process.env.RADFIT_PYTHON]:['python3','python'];
  const attempts=[];
  for(const executable of candidates){
    const processResult=spawnSync(executable,[path.join(root,'tests','air_reference.py')],{
      cwd:root,input:JSON.stringify(cases),encoding:'utf8',maxBuffer:32*1024*1024
    });
    if(processResult.status===0)return JSON.parse(processResult.stdout);
    attempts.push(executable+': '+(processResult.error?.message||processResult.stderr||String(processResult.status)).trim());
  }
  throw new Error('A Python interpreter with NumPy is required; set RADFIT_PYTHON. '+attempts.join(' | '));
}
function exportCSV(run,kind){
  const prior=run.blobs.length;
  invoke(run,kind==='iso'?'doExport()':'doDiagExport()');
  assert.equal(run.blobs.length,prior+1,kind+' exports valid spectrum');
  return run.blobs.at(-1);
}
function filename(run){return run.allElements.filter(e=>e.tagName==='A'&&e.download).at(-1).download;}
function csvMetadata(csv){
  const rows=csv.replace(/^\uFEFF/,'').split(/\r?\n/),index=rows.findIndex(r=>r.startsWith('E(keV),'));
  assert.ok(index>0,'Spectrum column header exists');
  return {metadata:rows.slice(1,index).filter(Boolean).map(r=>r.split(',')[0]),spectrumHeader:rows[index]};
}

try{
  // N-120, H-60, L-30 and soft H-10: baseline + ordinary and extreme paths.
  for(const name of ['N-120','H-60','L-30','H-10']){
    const preset=Object.values(iso.ctx.PRE).flat().find(row=>row[0]===name);
    assert.ok(preset,'ISO preset '+name);iso.ctx.applyPre(preset);baseline.ctx.applyPre(preset);
    for(const distance of [0,1,2,5,100]){
      const current=record(iso,'iso',name,distance);
      if(distance===0){
        assert.deepEqual(current.E,plain(baseline.ctx.RES.E),name+' original energy grid');
        assert.deepEqual(current.pF,plain(baseline.ctx.RES.pF),name+' 0m reproduces frozen spectrum');
        for(const key of ['hv1','hv2','eF','eP'])close(current.o[key],baseline.ctx.RES.o[key],name+' original '+key,1e-6);
      }
    }
  }
  // Diagnostics: W paths are extra to the calibrated model; Mo paths are
  // total paths relative to the measured PTB basis at 1 m.
  for(const [family,number] of [['RQR',5],['RQA',5],['RQR-M',3],['RQA-M',3]]){
    const quality=diag.ctx.items(family).find(q=>q.number===number);
    assert.ok(quality,'Diagnostic preset '+family+' '+number);diag.ctx.applyDiag(quality);
    const isMo=family.endsWith('-M');
    for(const distance of (isMo?[0,.6,1,2,5,100]:[0,1,2,5,100]))record(diag,'diagnostic',quality.name,distance);
  }
  // Especially sensitive case: air back-correction with zero Mo/Al filters.
  // Measured Mo spectra have true zero bins below their low-energy cutoff;
  // these bins must stay finite rather than becoming 0 * Infinity = NaN.
  diag.ctx.applyDiag(diag.ctx.items('RQR-M').find(q=>q.number===3));
  diag.elements.fMo.value='0';diag.elements.fAl.value='0';
  for(const distance of [0,.6,1,2,100]){
    const result=record(diag,'diagnostic','RQR-M 3 without filters',distance);
    assert.ok(result.pF.every(Number.isFinite),'unfiltered Mo bins remain finite');
  }

  const py=runPython(inputs.map(({kind,name,distance,p,material})=>({kind,name,distance,p,material})));
  assert.equal(py.length,inputs.length,'Independent Python reference count');
  inputs.forEach((c,index)=>{
    const r=c.result,ref=py[index],label=c.name+' '+c.distance+' m';
    assert.equal(ref.empty,false,label+' Python reference has a spectrum');
    assert.equal(r.E.length,ref.energy.length,label+' spectrum length');
    const maxSpectrum=Math.max(...ref.pF);
    for(let i=0;i<r.E.length;i++){
      close(r.E[i],ref.energy[i],label+' energy '+i,1e-6);
      // Ignore physically negligible underflow tails while checking every
      // numerically relevant bin against the independently computed spectrum.
      if(ref.pF[i]>maxSpectrum*1e-12){close(r.pF[i],ref.pF[i],label+' spectral bin '+i);spectralBins++;}
      else assert.ok(Math.abs(r.pF[i]-ref.pF[i])<=maxSpectrum*2e-12,label+' negligible bin '+i);
    }
    for(const key of ['hv1','hv2','eF','eP'])close(r.o[key],ref[key],label+' '+key);
  });
  function get(name,distance){return inputs.find(x=>x.name===name&&x.distance===distance).result;}
  const soft0=get('H-10',0),soft5=get('H-10',5);
  assert.ok(soft5.o.eF>soft0.o.eF,'Additional air hardens H-10 spectrum');
  assert.ok(soft5.o.hv1>soft0.o.hv1,'Additional air increases H-10 HVL');
  // Monochromatic NIST anchors and spectral ratio exclude any geometric 1/r².
  const transmission10=Math.exp(-5.120*0.001205*100);
  const transmission30=Math.exp(-0.3538*0.001205*100);
  close(transmission10,0.53949,'10 keV, 1 m air reference',.2);
  close(transmission30,0.95826,'30 keV, 1 m air reference',.2);
  const w1=get('RQR 5',1),w2=get('RQR 5',2),i30=w1.E.indexOf(30);
  assert.ok(i30>=0&&w1.pF[i30]>0,'30 keV diagnostic bin exists');
  close(w2.pF[i30]/w1.pF[i30],transmission30,'1→2 m air only, without 1/r²',1e-5);
  // Every supported point matches the expected *additional* attenuation and
  // the Mo 1 m measured baseline, including d < 1 m back-correction.
  for(const c of inputs){
    const baseDistance=c.p.target==='Mo'?1:0,base=get(c.name,baseDistance);
    const peak=Math.max(...base.pF);
    for(let i=0;i<c.result.E.length;i++){
      if(base.pF[i]<peak*1e-12||!base.pF[i])continue;
      const energy=c.result.E[i],trans=Math.exp(-iso.ctx.interp('Air',energy,1)*0.001205*100*(c.distance-baseDistance));
      if(trans<1e-250)continue;
      close(c.result.pF[i]/base.pF[i],trans,c.name+' spectral Beer–Lambert '+energy+' keV @'+c.distance+' m',1e-4);
    }
  }

  // UI switching retains the current distance within a material family and
  // explains that a modified diagnostic quality is a custom estimate.
  const isoN=iso.ctx.PRE.N.find(p=>p[0]==='N-120');iso.ctx.applyPre(isoN);useDistance(iso,'iso',2);
  iso.ctx.applyPre(iso.ctx.PRE.N.find(p=>p[0]==='N-100'));assert.equal(Number(iso.elements.airDistance.value),2,'ISO preset retains path');
  iso.ctx.setLanguage('eng');assert.equal(Number(iso.elements.airDistance.value),2,'ISO ENG retains path');
  iso.ctx.setLanguage('chs');assert.equal(Number(iso.elements.airDistance.value),2,'ISO CHS retains path');
  const w=diag.ctx.items('RQR').find(q=>q.number===5);diag.ctx.applyDiag(w);useDistance(diag,'diagnostic',2);
  assert.match(diag.elements.selection.textContent,/自定义|custom/i,'changed W path is a custom estimate');
  assert.match(diag.elements.calcStatus.textContent,/自定义|custom/i,'changed W path does not claim reference conformity');
  diag.ctx.applyDiag(diag.ctx.items('RQR').find(q=>q.number===6));assert.equal(Number(diag.elements.airDistance.value),2,'W preset retains path');
  diag.ctx.setLanguage('eng');assert.equal(Number(diag.elements.airDistance.value),2,'Diagnostic ENG retains path');
  assert.match(diag.elements.selection.textContent,/custom/i,'English changed W path is custom');
  diag.ctx.setLanguage('chs');assert.equal(Number(diag.elements.airDistance.value),2,'Diagnostic CHS retains path');
  diag.ctx.applyDiag(diag.ctx.items('RQR-M').find(q=>q.number===3));assert.equal(Number(diag.elements.airDistance.value),1,'Mo target starts from 1 m measured basis');
  useDistance(diag,'diagnostic',2);assert.match(diag.elements.selection.textContent,/自定义|custom/i,'changed Mo path is custom');
  diag.ctx.applyDiag(diag.ctx.items('RQA-M').find(q=>q.number===3));assert.equal(Number(diag.elements.airDistance.value),2,'Mo preset retains path');
  diag.ctx.applyDiag(w);assert.equal(Number(diag.elements.airDistance.value),0,'W target starts from fitted baseline');

  // The requested original CSV fields and columns remain unchanged.
  useDistance(iso,'iso',0);const isoFields=csvMetadata(exportCSV(iso,'iso'));assert.equal(filename(iso),'xray_100kVp.csv');
  useDistance(iso,'iso',2);assert.deepEqual(csvMetadata(exportCSV(iso,'iso')),isoFields,'ISO CSV schema unaffected by path');assert.equal(filename(iso),'xray_100kVp_air-2m.csv');
  assert.deepEqual(isoFields.metadata,['管电压','靶角','固有过滤','Al','Cu','Sn','Pb','HVL1','HVL2','均匀系数','谱分辨力','注量平均','能量注量平均','有效能量','相对K']);
  assert.equal(isoFields.spectrumHeader,'E(keV),Phi0,PhiF,mu_Al,mu_Cu,mu_Sn,mu_Pb,muen_Air');
  useDistance(diag,'diagnostic',0);const diagFields=csvMetadata(exportCSV(diag,'diagnostic'));assert.equal(filename(diag),'RQR-5_70kV_W.csv');
  useDistance(diag,'diagnostic',2);assert.deepEqual(csvMetadata(exportCSV(diag,'diagnostic')),diagFields,'Diagnostic CSV schema unaffected by path');assert.equal(filename(diag),'RQR-5_70kV_W_air-2m.csv');
  assert.deepEqual(diagFields.metadata,['参考来源','辐射质','配置','靶材','管电压','靶角','基准过滤','附加Al','附加Cu','Mo过滤','HVL1','HVL2','均匀系数','注量平均','能量注量平均','相对K','谱来源']);
  assert.equal(diagFields.spectrumHeader,'E(keV),binWidth(keV),Phi0_bin,PhiF_bin,mu_Al,muen_Air');
  diag.ctx.applyDiag(diag.ctx.items('RQR-M').find(q=>q.number===3));exportCSV(diag,'diagnostic');assert.equal(filename(diag),'RQR-M-3_30kV_Mo.csv');
  useDistance(diag,'diagnostic',.6);exportCSV(diag,'diagnostic');assert.equal(filename(diag),'RQR-M-3_30kV_Mo_air-0.6m.csv');
  diag.ctx.applyDiag(w);

  for(const [run,kind] of [[iso,'iso'],[diag,'diagnostic']]){
    for(const value of ['','-1','100.01','Infinity','not-a-number']){
      run.elements.airDistance.value=value;invoke(run,kind==='iso'?'recalc()':'recalcDiag()');
      assert.equal(run.ctx.RES,null,kind+' rejects invalid path '+value);
      assert.ok(run.elements.airDistance.classList.contains('invalid'),kind+' invalid path visual feedback '+value);
      assert.equal(run.elements.airDistance.getAttribute('aria-invalid'),'true');
      const count=run.blobs.length;invoke(run,kind==='iso'?'doExport()':'doDiagExport()');assert.equal(run.blobs.length,count,kind+' invalid CSV blocked');
    }
    for(const distance of [0,100])assert.ok(useDistance(run,kind,distance),kind+' accepts '+distance+' m boundary');
    // Simulated all-zero spectrum exercises the actual chart/disable path.
    invoke(run,'var originalAirTestExp=Math.exp; Math.exp=function(){return 0;};');
    try{
      invoke(run,kind==='iso'?'recalc()':'recalcDiag()');
      assert.ok(!run.ctx.RES||run.ctx.RES.empty,kind+' zero spectrum safe');
      assert.equal(run.elements.exportBtn.disabled,true,kind+' zero spectrum export disabled');
      assert.equal(run.ctx.ch1.option.series.length,0,kind+' zero spectrum chart safe');
    }finally{invoke(run,'Math.exp=originalAirTestExp;');}
  }

  const report={passed:true,cases:inputs.length,independent_spectral_bins:spectralBins,max_percent_difference:peakDifference,
    references:'Frozen Python source spectra + independent air attenuation and HVL integration',
    coverage:['ISO N-120/H-60/L-30/H-10','Diagnostic W and Mo including filterless Mo','0/1/2/5/100 m and Mo 0.6 m',
      'baseline recovery','spectral hardening','no inverse-square','UI state/validation/zero spectrum','CSV schema and filename'],
    limitation:'Node VM with simulated DOM/ECharts; no visual browser or real-device conformity validation.'};
  fs.mkdirSync(path.join(root,'reports'),{recursive:true});
  fs.writeFileSync(path.join(root,'reports','air_test_report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){console.error(error.stack);process.exitCode=1;}
