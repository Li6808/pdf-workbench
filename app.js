/* 遇柒 · 核心框架（纯前端，文件不出浏览器） */
pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';

const W = {
  bytes:null, name:'', pages:0, selected:new Set(),
  history:[], hIndex:-1, bind:{}, thumbs:[],
  image:{sid:null,name:null,info:null}, mod:'pages', theme:null,
  view:'grid', curPage:0, zoom:1.2
};
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => (s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt = n => n>1048576?(n/1048576).toFixed(1)+' MB':(n/1024).toFixed(0)+' KB';
const stem = n => (n||'文档').replace(/\.[^.]+$/,'').replace(/[\\/:*?"<>|]/g,'_').slice(0,50);

function toast(msg,kind='ok'){
  const el=document.createElement('div'); el.className='toast'+(kind==='ok'?'':' '+kind);
  el.textContent=msg; $('#toasts').appendChild(el);
  setTimeout(()=>{el.style.opacity='0';el.style.transition='.3s';setTimeout(()=>el.remove(),300)},3600);
}
function download(blobOrBytes,name,type){
  const blob = blobOrBytes instanceof Blob ? blobOrBytes : new Blob([blobOrBytes],{type:type||'application/octet-stream'});
  const a=document.createElement('a'); const url=URL.createObjectURL(blob);
  a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),20000);
}
function showResult(title,blobOrBytes,name,warning){
  let url;
  if(blobOrBytes instanceof Blob) url=URL.createObjectURL(blobOrBytes);
  else url=URL.createObjectURL(new Blob([blobOrBytes]));
  $('#result').innerHTML=`<div class="box"><b>✓ ${esc(title)}</b>
    <div class="dim">${esc(name)} · ${fmt(blobOrBytes.size||blobOrBytes.byteLength||0)}</div>
    <a href="${url}" download="${esc(name)}"><button class="act primary" style="margin:9px 0 0">下载文件</button></a>
    ${warning?`<div class="warn">${esc(warning)}</div>`:''}</div>`;
}
const sel = () => [...W.selected].sort((a,b)=>a-b);
const all = () => [...Array(W.pages).keys()];
const range = m => m==='all' ? all() : sel();

/* ---------- tooltip（悬停显示说明，界面不堆文字） ---------- */
let tipTimer=null;
function showTip(el){
  const txt=el.dataset.tip; if(!txt)return;
  const t=$('#tip'); t.textContent=txt; t.classList.add('show');
  const r=el.getBoundingClientRect();
  let x=r.left+r.width/2-t.offsetWidth/2, y=r.bottom+8;
  if(el.closest('.rail')){x=r.right+10;y=r.top+r.height/2-t.offsetHeight/2}
  x=Math.max(8,Math.min(x,innerWidth-t.offsetWidth-8));
  y=Math.max(8,Math.min(y,innerHeight-t.offsetHeight-8));
  t.style.left=x+'px';t.style.top=y+'px';
}
document.addEventListener('mouseover',e=>{
  const el=e.target.closest('[data-tip]');
  if(!el)return; clearTimeout(tipTimer);
  tipTimer=setTimeout(()=>showTip(el),260);
});
document.addEventListener('mouseout',e=>{
  if(e.target.closest('[data-tip]')){clearTimeout(tipTimer);$('#tip').classList.remove('show')}
});
window.addEventListener('scroll',()=>$('#tip').classList.remove('show'),true);

/* ---------- 主题 ---------- */
const savedTheme=localStorage.getItem('wb_theme');
if(savedTheme)document.documentElement.dataset.theme=savedTheme;
function syncThemeIcon(){
  const dark=document.documentElement.dataset.theme==='dark'||
    (!document.documentElement.dataset.theme&&matchMedia('(prefers-color-scheme:dark)').matches);
  $('#btnTheme').innerHTML=`<svg><use href="#i-${dark?'moon':'sun'}"/></svg>`;
}
syncThemeIcon();
$('#btnTheme').onclick=()=>{
  const dark=document.documentElement.dataset.theme==='dark'||
    (!document.documentElement.dataset.theme&&matchMedia('(prefers-color-scheme:dark)').matches);
  const next=dark?'light':'dark';
  document.documentElement.dataset.theme=next;localStorage.setItem('wb_theme',next);syncThemeIcon();
};

/* ---------- 面板（说明全部走 data-tip） ---------- */
const TITLES={pages:'页面',convert:'转换',edit:'编辑',image:'图片',export:'导出'};
const PANELS={
pages:`<div class="selinfo" id="pInfo">尚未勾选页面</div>
<div class="grp"><h3>删除页面</h3>
  <button class="act primary" id="pDelete" data-tip="在中间缩略图上勾选任意页，点这里只删这些页">删除勾选的页</button>
  <div class="row"><button class="act" id="qDelFirst" data-tip="快捷删掉第 1 页">删封面</button>
  <button class="act" id="qDelExpr">按页码删</button></div>
  <div class="fld"><input type="text" id="qExpr" placeholder="页码：1,3-5,12"></div>
  <div class="fld"><label>删封面时删掉开头几页</label><input type="number" id="qFirst" value="1" min="1" max="50"></div></div>
<div class="grp"><h3>页面操作</h3>
  <div class="row"><button class="act" id="pKeep">只保留勾选</button><button class="act" id="pDup">复制勾选</button></div>
  <div class="row"><button class="act" id="pR90">↻ 90°</button><button class="act" id="pR270">↺ 90°</button></div>
  <div class="row"><button class="act" id="pOdd">选奇数页</button><button class="act" id="pEven">选偶数页</button></div>
  <button class="act" id="pBlank">插入空白页</button></div>
<div class="grp"><h3>合并与整理</h3>
  <button class="act" id="pAppend">追加 PDF 合并到末尾</button>
  <input type="file" id="pAppendInput" accept=".pdf" multiple hidden>
  <button class="act" id="qBatch" data-tip="选多个文件，每个单独去封面后打包 ZIP">一叠 PDF 批量去封面</button>
  <input type="file" id="qBatchInput" accept=".pdf" multiple hidden>
  <div class="fld"><label>裁掉四周白边（毫米）</label><input type="number" id="qCrop" value="0" min="0" max="40"></div>
  <button class="act" id="qCropBtn">裁剪白边</button>
  <div class="row"><button class="act" id="qNup2">2 合 1</button><button class="act" id="qNup4">4 合 1</button></div></div>
<div class="grp"><button class="act danger" id="pReset" data-tip="清空当前 PDF 和图片，回到最开始的状态">清空并重置</button></div>
<div class="selinfo dim" data-tip="拖拽缩略图卡片可以直接调整页面顺序">拖拽卡片可调顺序 · 顶栏 ↶ 可撤销</div>`,

convert:`<div class="grp"><h3>输出</h3>
  <div class="fld"><label>页面范围</label><select id="cRange"><option value="all">全部页面</option><option value="selected">仅选中页</option></select></div>
  <button class="act primary" id="cWord" data-tip="生成可编辑的 .docx，保留段落与换行">转 Word</button>
  <div class="row"><button class="act" id="cTxt">TXT</button><button class="act" id="cMd">Markdown</button></div>
  <div class="row"><button class="act" id="cHtml">网页</button><button class="act" id="cCsv">CSV 表格</button></div></div>
<div class="selinfo dim" data-tip="浏览器版从 PDF 文字层提取文字；扫描件需要先做 OCR">扫描件无文字层时导出为空</div>`,

edit:`<div class="grp"><h3>水印</h3>
  <div class="fld"><input type="text" id="eWm" value="内部资料" placeholder="水印文字"></div>
  <div class="row"><div class="fld"><label>字号</label><input type="number" id="eSize" value="38" min="10" max="120"></div>
  <div class="fld"><label>透明度</label><input type="number" id="eOpacity" value="0.16" min="0.05" max="0.8" step="0.01"></div></div>
  <div class="fld"><label>应用范围</label><select id="eScope">
    <option value="all">全部页面</option><option value="selected">仅勾选页</option><option value="page">指定某一页</option></select></div>
  <div class="fld"><label>指定页码（范围为「指定某一页」时生效）</label><input type="number" id="eOnePage" value="1" min="1"></div>
  <button class="act primary" id="eWatermark" data-tip="中文水印以图片方式嵌入；可只加到某一页">添加水印</button></div>
<div class="grp"><h3>页码</h3>
  <div class="fld"><input type="text" id="eTpl" value="第 {n} 页 / 共 {t} 页"></div>
  <button class="act" id="ePageNum" data-tip="{n} 当前页码，{t} 总页数">添加到所有页面</button></div>
<div class="grp"><h3>插入文字</h3>
  <div class="fld"><input type="text" id="eText" placeholder="要写入的文字"></div>
  <div class="row"><div class="fld"><label>页码</label><input type="number" id="ePage" value="1" min="1"></div>
  <div class="fld"><label>字号</label><input type="number" id="eTextSize" value="14" min="6" max="48"></div></div>
  <div class="row"><div class="fld"><label>X</label><input type="number" id="eX" value="72"></div>
  <div class="fld"><label>Y</label><input type="number" id="eY" value="72"></div></div>
  <button class="act" id="eInsert" data-tip="PDF 坐标为左上角原点，单位是点（pt）">写入文字</button></div>`,

image:`<div class="grp"><h3>选择图片</h3>
  <button class="act primary" id="iPick">选择图片</button>
  <input type="file" id="iInput" accept="image/*" hidden>
  <div class="selinfo" id="iInfo">尚未选择图片</div></div>
<div class="grp"><h3>目标体积</h3>
  <div class="pills" id="iPills">
    <button class="pill" data-kb="20">20 KB</button><button class="pill" data-kb="50">50 KB</button>
    <button class="pill" data-kb="100">100 KB</button><button class="pill" data-kb="200">200 KB</button></div>
  <div class="fld"><label>自定义上限（KB，留空不限）</label><input type="number" id="iMaxKb" min="1" placeholder="例如 30"></div></div>
<div class="grp"><h3>尺寸与格式</h3>
  <div class="row"><div class="fld"><label>宽 px</label><input type="number" id="iW" placeholder="原宽"></div>
  <div class="fld"><label>高 px</label><input type="number" id="iH" placeholder="原高"></div></div>
  <div class="fld"><select id="iFmt"><option value="image/jpeg">JPG（体积最小）</option><option value="image/png">PNG（保留透明）</option><option value="image/webp">WebP</option></select></div>
  <div class="fld"><label>不限体积时质量 <span id="iQVal">88</span></label><input type="range" id="iQ" min="10" max="95" value="88"></div>
  <label class="chk"><input type="checkbox" id="iKeep" checked> 保持宽高比</label></div>
<div class="grp"><button class="act primary" id="iRun">开始调整</button></div>`,

export:`<div class="grp"><h3>导出为图片</h3>
  <div class="row"><div class="fld"><label>清晰度</label><select id="xDpi"><option value="120">120 DPI</option><option value="150">150 DPI</option><option value="220">高清</option></select></div>
  <div class="fld"><label>格式</label><select id="xFmt"><option value="png">PNG</option><option value="jpeg">JPG</option></select></div></div>
  <button class="act primary" id="xImages">导出图片 ZIP</button></div>
<div class="grp"><h3>拆分 PDF</h3>
  <div class="fld"><label>每几页一个文件</label><input type="number" id="xChunk" value="1" min="1"></div>
  <button class="act" id="xSplit">按固定页数拆分</button>
  <div class="fld" style="margin-top:10px"><input type="text" id="xRanges" placeholder="1-3,4-10,12"></div>
  <button class="act" id="xSplitRanges">按页码段拆分</button></div>
<div class="grp"><h3>提取与另存</h3>
  <button class="act" id="xExtract">选中页另存 PDF</button></div>`
};

function renderPanel(mod){
  W.mod=mod;
  $('#panelTitle').textContent=TITLES[mod];
  $('#panelBody').innerHTML=PANELS[mod];
  $('#result').innerHTML='';
  if(W.bind[mod])W.bind[mod]();
  if(mod==='pages'&&W.bind.quick)W.bind.quick(); // 合并面板同时挂上快捷操作
  syncStage();
}
function syncStage(){
  const isImg=W.mod==='image';
  $('#imgStage').classList.toggle('hidden',!isImg);
  const has=!!W.bytes;
  $('#drop').classList.toggle('hidden',has||isImg);
  $('#workspace').classList.toggle('hidden',!has||isImg);
  if(has&&!isImg)$('#barTitle').textContent='页面预览';
  if(W.mod==='pages')updateSelInfo();
}
function updateSelInfo(){
  const s=sel();
  const a=$('#pInfo');
  if(a)a.innerHTML=s.length?`已选 <b>${s.length}</b> 页：${s.map(i=>i+1).join('、')}`
    :`尚未勾选页面 · 当前 ${W.pages} 页`;
  const btn=$('#pDelete');
  if(btn)btn.textContent=s.length?`删除勾选的 ${s.length} 页`:'删除勾选的页';
}

/* ---------- 模块切换 ---------- */
function switchMod(mod){
  $$('.rail-btn,.tab').forEach(x=>x.classList.toggle('on',x.dataset.mod===mod));
  renderPanel(mod);
  if(innerWidth<=860){$('#panel').classList.remove('closed');}
  const tipEl=[...$$('.rail-btn,.tab')].find(x=>x.dataset.mod===mod);
  if(innerWidth<=860&&tipEl&&tipEl.dataset.tip)toast(tipEl.dataset.tip.split(' · ')[0]);
}
$$('.rail-btn[data-mod],.tab[data-mod]').forEach(b=>b.onclick=()=>switchMod(b.dataset.mod));
$('#panelClose').onclick=()=>{if(innerWidth<=860)$('#panel').classList.add('closed');else toast('面板已是常驻显示')};
$('#btnHelp').onclick=()=>$('#helpModal').classList.remove('hidden');
$('#helpClose').onclick=()=>$('#helpModal').classList.add('hidden');
$('#helpModal').onclick=e=>{if(e.target.id==='helpModal')$('#helpModal').classList.add('hidden')};

/* ---------- 文件加载 / 渲染 ---------- */
async function loadFiles(list){
  const files=[...list].filter(f=>/\.pdf$/i.test(f.name));
  if(!files.length){toast('请选择 PDF 文件','err');return}
  toast('正在读取…');
  try{
    let bytes;
    if(files.length===1){bytes=new Uint8Array(await files[0].arrayBuffer())}
    else{
      const merged=await PDFLib.PDFDocument.create();
      for(const f of files){
        const src=await PDFLib.PDFDocument.load(await f.arrayBuffer());
        const pages=await merged.copyPages(src,src.getPageIndices());
        pages.forEach(p=>merged.addPage(p));
      }
      bytes=await merged.save();
    }
    W.bytes=bytes;W.name=stem(files[0].name)+(files.length>1?'_合并':'');
    W.history=[{bytes:bytes.slice(),label:'打开文档'}];W.hIndex=0;
    await refresh();
    toast(`已打开 ${W.pages} 页`);
  }catch(e){toast('读取失败：'+e.message,'err')}
}
$('#btnOpen').onclick=()=>$('#fileInput').click();
$('#btnPick').onclick=()=>$('#fileInput').click();
$('#fileInput').onchange=e=>{if(e.target.files.length)loadFiles(e.target.files);e.target.value=''};
const drop=$('#drop');
['dragenter','dragover'].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();$('.drop-card').classList.add('hot')}));
['dragleave','drop'].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();$('.drop-card').classList.remove('hot')}));
drop.addEventListener('drop',e=>{e.stopPropagation();loadFiles(e.dataTransfer.files)});
document.addEventListener('dragover',e=>e.preventDefault());
document.addEventListener('drop',e=>{
  e.preventDefault();const fs=[...e.dataTransfer.files];
  if(!fs.length||e.target.closest('#drop'))return;
  const pic=fs.find(f=>/^image\//.test(f.type));
  if(pic){switchMod('image');if(W.pickImage)W.pickImage(pic);return}
  if(fs.some(f=>/\.pdf$/i.test(f.name)))loadFiles(fs);
});

let refreshSeq=0;
async function refresh(){
  if(!W.bytes)return;
  // 修复「撤销后顺序错乱」：逐页渲染是异步的，快速连续操作时两次刷新会交错写入
  // W.thumbs / W.pages。这里用令牌作废过期刷新，并在最后一次性原子赋值。
  const my=++refreshSeq;
  const label=W.name,size=W.bytes.length;
  const data=new Uint8Array(W.bytes); // pdf.js 会接管传入 buffer，必须给副本
  let doc=null;
  try{
    doc=await pdfjsLib.getDocument({data}).promise;
    const count=doc.numPages,thumbs=[];
    for(let i=1;i<=count;i++){
      if(my!==refreshSeq){await doc.destroy();return}
      const page=await doc.getPage(i);
      const vp=page.getViewport({scale:0.42});
      const cv=document.createElement('canvas');cv.width=Math.ceil(vp.width);cv.height=Math.ceil(vp.height);
      await page.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise;
      thumbs.push(cv.toDataURL('image/png'));
    }
    await doc.destroy();doc=null;
    if(my!==refreshSeq)return;
    W.thumbs=thumbs;W.pages=count;W.selected.clear();
    renderGrid();
    $('#fileChip').innerHTML=`<b>📄 ${esc(label)}</b><span>${count} 页 · ${fmt(size)}</span>`;
    $('#barMeta').textContent=`${count} 页 · 已选 0 页`;
    $('#btnSave').disabled=false;$('#btnReset').disabled=false;
    $('#btnUndo').disabled=W.hIndex<=0;
    $('#btnRedo').disabled=W.hIndex>=W.history.length-1;
    syncStage();updateSelInfo();
    if(W.view==='single')renderSingle();
  }catch(e){
    if(doc){try{await doc.destroy()}catch(_){}}
    if(my===refreshSeq)toast('页面渲染失败：'+e.message,'err');
  }
}
function renderGrid(){
  const g=$('#grid');g.innerHTML='';
  W.thumbs.forEach((src,i)=>{
    const c=document.createElement('div');c.className='card';c.draggable=true;c.dataset.i=i;
    c.innerHTML=`<div class="check"></div><div class="thumb"><img src="${src}" alt="第${i+1}页"></div>
      <div class="card-foot"><span>第 ${i+1} 页</span><span class="card-tools">
      <button class="tiny" data-a="rot" data-tip="旋转 90°">↻</button>
      <button class="tiny" data-a="del" data-tip="删除此页">✕</button></span></div>`;
    c.onclick=e=>{
      const a=e.target.dataset.a,i2=+c.dataset.i;
      if(a==='rot')return W.mutate(p=>p.getPage(i2).setRotation(PDFLib.degrees((p.getPage(i2).getRotation().angle+90)%360)),'旋转页面');
      if(a==='del')return W.mutate(p=>p.removePage(i2),'删除页面');
      W.selected.has(i2)?W.selected.delete(i2):W.selected.add(i2);
      c.classList.toggle('sel',W.selected.has(i2));
      c.querySelector('.check').textContent=W.selected.has(i2)?'✓':'';
      $('#barMeta').textContent=`${W.pages} 页 · 已选 ${W.selected.size} 页`;updateSelInfo();
    };
    c.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',c.dataset.i);c.classList.add('drag')});
    c.addEventListener('dragend',()=>{c.classList.remove('drag');$$('.card').forEach(x=>x.classList.remove('over'))});
    c.addEventListener('dragover',e=>{e.preventDefault();c.classList.add('over')});
    c.addEventListener('dragleave',()=>c.classList.remove('over'));
    c.addEventListener('drop',async e=>{
      e.preventDefault();const from=+e.dataTransfer.getData('text/plain'),to=+c.dataset.i;
      if(from===to)return;
      const order=all();order.splice(to,0,order.splice(from,1)[0]);
      await W.reorder(order);
    });
    g.appendChild(c);
  });
}

/* ---------- 视图：网格预览 / 单页放大翻阅 ---------- */
let singleSeq=0;
async function renderSingle(){
  if(W.view!=='single'||!W.bytes)return;
  const my=++singleSeq;
  let doc;
  try{
    doc=await pdfjsLib.getDocument({data:new Uint8Array(W.bytes)}).promise;
    const n=doc.numPages;
    W.curPage=Math.max(0,Math.min(W.curPage,n-1));
    const p=await doc.getPage(W.curPage+1);
    const vp=p.getViewport({scale:W.zoom});
    const cv=document.createElement('canvas');
    cv.width=Math.ceil(vp.width);cv.height=Math.ceil(vp.height);
    await p.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise;
    await doc.destroy();
    if(my!==singleSeq)return;
    const box=$('#singleCanvas');box.innerHTML='';
    cv.className='page-canvas';box.appendChild(cv);
    $('#pgInfo').textContent=`第 ${W.curPage+1} 页 / 共 ${n} 页`;
    $('#zoomVal').textContent=Math.round(W.zoom*100)+'%';
  }catch(e){if(doc){try{await doc.destroy()}catch(_){}}toast('单页渲染失败：'+e.message,'err')}
}
function setView(v){
  W.view=v;
  $('#btnGrid').classList.toggle('on',v==='grid');
  $('#btnSingle').classList.toggle('on',v==='single');
  $('#grid').classList.toggle('hidden',v!=='grid');
  $('#singleView').classList.toggle('hidden',v!=='single');
  if(v==='single')renderSingle();
}
$('#btnGrid').onclick=()=>setView('grid');
$('#btnSingle').onclick=()=>setView('single');
$('#pgPrev').onclick=()=>{W.curPage--;renderSingle()};
$('#pgNext').onclick=()=>{W.curPage++;renderSingle()};
$('#zoomIn').onclick=()=>{W.zoom=Math.min(3,W.zoom+.2);renderSingle()};
$('#zoomOut').onclick=()=>{W.zoom=Math.max(.6,W.zoom-.2);renderSingle()};
document.addEventListener('keydown',e=>{
  if(W.view!=='single'||!W.bytes)return;
  if(e.key==='ArrowLeft'){W.curPage--;renderSingle()}
  if(e.key==='ArrowRight'){W.curPage++;renderSingle()}
});

/* ---------- 修改 / 历史 ---------- */
W.mutate=async(fn,label)=>{
  if(!W.bytes)return toast('请先打开 PDF','warn');
  try{
    const pdf=await PDFLib.PDFDocument.load(W.bytes);
    fn(pdf);
    const out=await pdf.save();
    W.bytes=out;
    W.history=W.history.slice(0,W.hIndex+1);
    W.history.push({bytes:out.slice(),label});
    if(W.history.length>20){W.history.shift()}
    W.hIndex=W.history.length-1;
    await refresh();toast(label+' · 完成');
  }catch(e){toast('操作失败：'+e.message,'err')}
};
W.reorder=async order=>{
  if(!W.bytes)return;
  const src=await PDFLib.PDFDocument.load(W.bytes);
  const out=await PDFLib.PDFDocument.create();
  const pages=await out.copyPages(src,order);pages.forEach(p=>out.addPage(p));
  const bytes=await out.save();
  W.bytes=bytes;W.history=W.history.slice(0,W.hIndex+1);
  W.history.push({bytes:bytes.slice(),label:'调整顺序'});W.hIndex=W.history.length-1;
  await refresh();toast('顺序已更新');
};
$('#btnUndo').onclick=async()=>{
  if(W.hIndex<=0)return;W.hIndex--;W.bytes=W.history[W.hIndex].bytes.slice();
  await refresh();toast('已撤销：'+W.history[W.hIndex+1].label);
};
$('#btnRedo').onclick=async()=>{
  if(W.hIndex>=W.history.length-1)return;W.hIndex++;W.bytes=W.history[W.hIndex].bytes.slice();
  await refresh();toast('已重做：'+W.history[W.hIndex].label);
};
document.addEventListener('keydown',e=>{
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();$(e.shiftKey?'#btnRedo':'#btnUndo').click()}
});
$('#btnSave').onclick=()=>{
  if(!W.bytes)return;download(W.bytes.slice(),W.name+'.pdf','application/pdf');
};

/* ---------- 重置：清空当前 PDF 与图片，回到最开始 ---------- */
function resetAll(){
  refreshSeq++;                                  // 作废所有进行中的渲染
  if(W.image&&W.image.src)URL.revokeObjectURL(W.image.src);
  W.bytes=null;W.name='';W.pages=0;W.selected.clear();W.thumbs=[];
  W.history=[];W.hIndex=-1;W.image={};
  W.view='grid';W.curPage=0;W.zoom=1.2;
  $('#singleView').classList.add('hidden');$('#grid').classList.remove('hidden');
  $('#btnGrid').classList.add('on');$('#btnSingle').classList.remove('on');
  $('#imgDownload').disabled=true;
  $('#imgBefore').removeAttribute('src');$('#imgAfter').removeAttribute('src');
  $('#imgName').textContent='';$('#imgBeforeInfo').textContent='';$('#imgAfterInfo').textContent='';
  const ii=$('#iInfo');if(ii)ii.textContent='尚未选择图片';
  $('#fileChip').innerHTML='<span class="dim">未打开文档</span>';
  $('#grid').innerHTML='';$('#result').innerHTML='';$('#barMeta').textContent='';
  $('#btnSave').disabled=true;$('#btnReset').disabled=true;
  $('#btnUndo').disabled=true;$('#btnRedo').disabled=true;
  renderPanel('pages');
  toast('已重置，可以重新导入 PDF 或图片');
}
$('#btnReset').onclick=resetAll;
$('#btnSelAll').onclick=()=>{W.selected=new Set(all());renderGrid();$('#barMeta').textContent=`${W.pages} 页 · 已选 ${W.pages} 页`;updateSelInfo()};
$('#btnSelNone').onclick=()=>{W.selected.clear();renderGrid();$('#barMeta').textContent=`${W.pages} 页 · 已选 0 页`;updateSelInfo()};

// 等所有功能模块脚本加载完毕再渲染首个面板，确保事件绑定齐全
window.addEventListener('load',()=>renderPanel('pages'));

if('serviceWorker' in navigator && location.protocol.startsWith('http')){
  window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
}
