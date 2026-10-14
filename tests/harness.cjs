// 执行交付页的真实内联脚本；宿主 DOM、存储与图表采用可检查的模拟实现。
'use strict';
const vm=require('node:vm'),assert=require('node:assert/strict');
const strip=v=>String(v).replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");

function buildContext(html,kind,options={}){
  const elements={},numbers=[],events={},charts=[],blobs=[],allElements=[];
  function element(attrs={}){
    const classes=new Set((attrs.class||'').split(/\s+/).filter(Boolean));
    let inner='',ownText='',value=String(attrs.value??'');
    const e={id:attrs.id||'',attributes:{...attrs},children:[],parentElement:null,disabled:Object.hasOwn(attrs,'disabled'),hidden:Object.hasOwn(attrs,'hidden'),
      style:{},dataset:{},validationMessage:'',tagName:(attrs.tagName||'DIV').toUpperCase(),
      classList:{toggle(n,v){if(v===undefined)v=!classes.has(n);if(v)classes.add(n);else classes.delete(n);return v;},
        add(...names){names.forEach(n=>classes.add(n));},remove(...names){names.forEach(n=>classes.delete(n));},contains(n){return classes.has(n);}},
      setAttribute(k,v){this.attributes[k]=String(v);if(k==='class')this.className=String(v);if(k==='hidden')this.hidden=true;
        if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=String(v);},
      removeAttribute(k){delete this.attributes[k];if(k==='hidden')this.hidden=false;},getAttribute(k){return Object.hasOwn(this.attributes,k)?this.attributes[k]:null;},
      setCustomValidity(v){this.validationMessage=v;},appendChild(child){
        if(child.parentElement)child.parentElement.children=child.parentElement.children.filter(c=>c!==child);
        this.children.push(child);child.parentElement=this;return child;},
      addEventListener(name,fn){(this.eventHandlers??={})[name]??=[];this.eventHandlers[name].push(fn);},
      remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(c=>c!==this);this.parentElement=null;},
      click(){this.clicked=true;if(this.onclick)this.onclick({target:this});for(const fn of this.eventHandlers?.click??[])fn({target:this});},
      querySelectorAll(q){return allElements.filter(c=>isDescendant(c,this)&&matches(c,q));},querySelector(q){return this.querySelectorAll(q)[0]||null;}};
    for(const [key,item] of Object.entries(attrs)){
      if(key.startsWith('data-'))e.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=item;
      if(['href','min','max','step','title','lang','type'].includes(key))e[key]=item;
    }
    if(attrs.style)attrs.style.split(';').forEach(item=>{const idx=item.indexOf(':');if(idx>0)e.style[item.slice(0,idx).trim()]=item.slice(idx+1).trim();});
    Object.defineProperty(e,'value',{get(){return value;},set(v){value=String(v);}});
    for(const reflected of ['href','lang','min','max','step','title','type'])Object.defineProperty(e,reflected,{get(){return e.attributes[reflected]||'';},set(v){e.attributes[reflected]=String(v);},configurable:true});
    Object.defineProperty(e,'className',{get(){return [...classes].join(' ');},set(v){classes.clear();String(v).split(/\s+/).filter(Boolean).forEach(c=>classes.add(c));}});
    Object.defineProperty(e,'textContent',{get(){return ownText+e.children.map(c=>c.textContent).join('');},set(v){ownText=String(v);inner=String(v);e.children=[];}});
    Object.defineProperty(e,'innerHTML',{get(){return inner;},set(v){inner=String(v);e.children=[];ownText=strip(inner);}});
    e.addText=v=>{ownText+=strip(v);};
    allElements.push(e);return e;
  }
  function isDescendant(e,parent){for(let p=e.parentElement;p;p=p.parentElement)if(p===parent)return true;return false;}
  function simpleMatch(e,q){
    q=q.trim();if(!q)return false;
    const tag=/^[a-z][\w:-]*/i.exec(q);if(tag&&e.tagName!==tag[0].toUpperCase())return false;
    const id=/#([\w-]+)/.exec(q);if(id&&e.id!==id[1])return false;
    for(const cls of q.matchAll(/\.([\w-]+)/g))if(!e.classList.contains(cls[1]))return false;
    for(const attr of q.matchAll(/\[([\w-]+)(?:\s*=\s*["']?([^\]"']+)["']?)?\]/g)){
      if(e.getAttribute(attr[1])===null)return false;if(attr[2]!==undefined&&e.getAttribute(attr[1])!==attr[2])return false;
    }
    return true;
  }
  function matches(e,q){return q.split(',').some(branch=>{
    const parts=branch.trim().split(/\s+(?![^\[]*\])/);if(!simpleMatch(e,parts.pop()))return false;
    let p=e.parentElement;while(parts.length){const wanted=parts.pop();while(p&&!simpleMatch(p,wanted))p=p.parentElement;if(!p)return false;p=p.parentElement;}return true;
  });}
  // 解析静态正文中所有元素，保留没有 id 的标签和语言标记。
  const markup=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<!--[\s\S]*?-->/g,'');
  const stack=[],voidTags=new Set(['AREA','BASE','BR','COL','EMBED','HR','IMG','INPUT','LINK','META','PARAM','SOURCE','TRACK','WBR']);
  for(const token of markup.matchAll(/<\/?[a-z][^>]*>|[^<]+/gi)){
    const text=token[0];if(!text.startsWith('<')){if(stack.length)stack.at(-1).addText(text);continue;}
    const tag=/^<(\/?)([a-z][\w:-]*)\b/i.exec(text);if(!tag)continue;
    if(tag[1]){const expected=tag[2].toUpperCase();while(stack.length){if(stack.pop().tagName===expected)break;}continue;}
    const attrs={tagName:tag[2]};for(const a of text.matchAll(/([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g)){
      if(a.index===1)continue;attrs[a[1]]=strip(a[2]??a[3]??'');}
    const e=element(attrs);if(e.id){assert.ok(!elements[e.id],'Duplicate DOM id '+e.id);elements[e.id]=e;if(attrs.type==='number')numbers.push(e.id);}
    if(stack.length)stack.at(-1).appendChild(e);if(!voidTags.has(e.tagName)&&!text.endsWith('/>'))stack.push(e);
  }
  for(const select of allElements.filter(e=>e.tagName==='SELECT')){
    const opts=select.children.filter(e=>e.tagName==='OPTION'),choice=opts.find(e=>e.getAttribute('selected')!==null)||opts[0];
    if(choice)select.value=choice.getAttribute('value')??choice.textContent;
  }
  const document={title:strip(/<title>([\s\S]*?)<\/title>/i.exec(html)?.[1]||''),documentElement:allElements.find(e=>e.tagName==='HTML')||element({tagName:'HTML'}),
    getElementById(id){assert.ok(elements[id],'Unknown DOM id '+id);return elements[id];},createElement(tag){return element({tagName:tag});},
    body:allElements.find(e=>e.tagName==='BODY')||element({tagName:'BODY'}),head:allElements.find(e=>e.tagName==='HEAD')||element({tagName:'HEAD'}),
    querySelectorAll(q){return allElements.filter(e=>matches(e,q));},querySelector(q){return this.querySelectorAll(q)[0]||null;},
    addEventListener(name,fn){(events[name]??=[]).push(fn);}};
  const storageData={...(options.storage||{})},storageCalls=[],localStorage={
    getItem(key){storageCalls.push(['get',key]);if(options.storageThrows===true||options.storageThrows==='get')throw new Error('Storage access denied');return Object.hasOwn(storageData,key)?String(storageData[key]):null;},
    setItem(key,value){storageCalls.push(['set',key,value]);if(options.storageThrows===true||options.storageThrows==='set')throw new Error('Storage access denied');storageData[key]=String(value);},
    removeItem(key){delete storageData[key];},clear(){Object.keys(storageData).forEach(k=>delete storageData[k]);}};
  const location={search:options.search||'',pathname:'/'+(kind==='diagnostic'?'diagnostic.html':'index.html'),hash:options.hash||'',
    href:'https://example.invalid/'+(kind==='diagnostic'?'diagnostic.html':'index.html')+(options.search||'')+(options.hash||'')};
  const history={replaceState(state,title,url){if(options.historyThrows)throw new Error('History modification denied');const parsed=new URL(url,location.href);location.href=parsed.href;location.search=parsed.search;location.hash=parsed.hash;location.pathname=parsed.pathname;}};
  function chart(){const c={option:null,history:[],setOption(option){
    const finite=v=>{if(typeof v==='number')assert.ok(Number.isFinite(v),'Nonfinite chart data');else if(Array.isArray(v))v.forEach(finite);else if(v&&typeof v==='object')Object.values(v).forEach(finite);};
    finite(option);this.option=option;this.history.push(option);},resize(){},dispose(){},clear(){this.option=null;}};charts.push(c);return c;}
  const ctx=vm.createContext({document,window:{__echartsReady:{then(fn){if(Object.hasOwn(options,'chartLoadResult'))fn(options.chartLoadResult);}},addEventListener(){},localStorage,location,history},
    localStorage,location,history,URLSearchParams,setTimeout(){return 1;},clearTimeout(){},Blob:function(parts){blobs.push(parts.join(''));},
    URL:{createObjectURL(){return 'blob:test';},revokeObjectURL(){}},console});
  for(const e of allElements)if(e.attributes.onclick){const handler=vm.runInContext('(function(event){'+e.attributes.onclick+'})',ctx,{timeout:5000});e.onclick=event=>handler.call(e,event);}
  const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
  assert.ok(scripts.some(code=>kind==='diagnostic'?code.includes('function calculateDiag('):code.includes('function recalc(')&&code.includes('function findHVL(')),kind+' main calculator JS not found');
  for(const script of scripts){if(script.includes('window.__echartsReady')&&script.includes('new Promise'))continue;if(script.trim())vm.runInContext(script,ctx,{timeout:20000});}
  for(const fn of events.DOMContentLoaded??[])fn();
  ctx.ch1=chart();ctx.ch2=chart();ctx.ch3=chart();
  if(typeof ctx.draw==='function')ctx.draw();else if(typeof ctx.drawDiag==='function')ctx.drawDiag();
  return {ctx,elements,numbers,events,charts,blobs,allElements,html,document,storageData,storageCalls,location};
}
const invoke=(run,expression)=>vm.runInContext(expression,run.ctx,{timeout:5000});
module.exports={buildContext,invoke,strip};
