/* 遇柒 · 功能实现 */
(() => {
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const need = () => { if(!W.bytes){toast('请先打开 PDF','warn');return false} return true };
const stemOf = () => W.name || '文档';

function parseExpr(expr,total){
  const out=new Set();
  for(const tok of (expr||'').split(/[,，;\s]+/)){
    if(!tok)continue;
    const m=tok.match(/^(\d+)\s*[-~–]\s*(\d+)$/);
    if(m){let a=+m[1],b=+m[2];if(a>b)[a,b]=[b,a];for(let p=a;p<=b;p++)if(p>=1&&p<=total)out.add(p-1)}
    else if(/^\d+$/.test(tok)){const p=+tok;if(p>=1&&p<=total)out.add(p-1)}
  }
  return [...out].sort((a,b)=>a-b);
}
function parseRanges(expr,total){
  const out=[];
  for(const tok of (expr||'').split(/[,，;\s]+/)){
    if(!tok)continue;
    const m=tok.match(/^(\d+)\s*[-~–]\s*(\d*)$/);
    let a,b;
    if(m){a=+m[1];b=m[2]?+m[2]:total}
    else if(/^\d+$/.test(tok)){a=b=+tok}
    else continue;
    if(a>b)[a,b]=[b,a];
    a=Math.max(1,a);b=Math.min(total,b);
    if(a<=b)out.push([a-1,b-1]);
  }
  return out;
}
async function subset(indices){
  const src=await PDFLib.PDFDocument.load(W.bytes);
  const out=await PDFLib.PDFDocument.create();
  const pages=await out.copyPages(src,indices);
  pages.forEach(p=>out.addPage(p));
  return out.save();
}
async function pdfjsDoc(){
  return pdfjsLib.getDocument({data:new Uint8Array(W.bytes)}).promise;
}
async function pageText(doc,i){
  const p=await doc.getPage(i+1);
  const tc=await p.getTextContent();
  const lines=[];let lastY=null,cur='';
  for(const it of tc.items){
    const y=Math.round(it.transform[5]);
    if(lastY!==null&&Math.abs(y-lastY)>3){if(cur.trim())lines.push(cur.trim());cur=''}
    cur+=it.str;lastY=y;
  }
  if(cur.trim())lines.push(cur.trim());
  return lines;
}
async function textsOf(indices){
  const doc=await pdfjsDoc();const out=[];
  for(const i of indices)out.push({page:i+1,lines:await pageText(doc,i)});
  await doc.destroy();return out;
}
function canvasBlob(cv,type,q){
  return new Promise(res=>cv.toBlob(b=>res(b),type,q));
}
async function pageImages(indices,dpi,fmt){
  const doc=await pdfjsDoc();const out=[];
  for(const i of indices){
    const p=await doc.getPage(i+1);
    const vp=p.getViewport({scale:dpi/72});
    const cv=document.createElement('canvas');cv.width=Math.ceil(vp.width);cv.height=Math.ceil(vp.height);
    await p.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise;
    out.push({page:i+1,blob:await canvasBlob(cv,'image/'+(fmt==='jpeg'?'jpeg':'png'),0.9)});
  }
  await doc.destroy();return out;
}
async function zipOf(files){
  const z=new JSZip();
  files.forEach(f=>z.file(f.name,f.blob||f.bytes));
  return z.generateAsync({type:'blob'});
}

/* ---------- 最小 DOCX（浏览器内生成，中文 UTF-8） ---------- */
const xmlEsc=s=>(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
async function makeDocx(pages){
  const para=[];
  for(const pg of pages){
    para.push(`<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>— 第 ${pg.page} 页 —</w:t></w:r></w:p>`);
    for(const line of pg.lines)para.push(`<w:p><w:r><w:t xml:space="preserve">${xmlEsc(line)}</w:t></w:r></w:p>`);
  }
  const doc=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${para.join('')}<w:sectPr/></w:body></w:document>`;
  const z=new JSZip();
  z.file('[Content_Types].xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  z.file('_rels/.rels',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  z.file('word/_rels/document.xml.rels',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`);
  z.file('word/styles.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Title"><w:rPr><w:b/><w:color w:val="888888"/></w:rPr></w:style></w:styles>`);
  z.file('word/document.xml',doc);
  return z.generateAsync({type:'blob'});
}

/* ---------- 中文文字 → 透明 PNG（绕过 PDF 字体嵌入） ---------- */
function textPng(text,size,color,opacity){
  const cv=document.createElement('canvas');let ctx=cv.getContext('2d');
  const font=`600 ${size}px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif`;
  ctx.font=font;const w=Math.ceil(ctx.measureText(text).width)+16;
  cv.width=w;cv.height=Math.ceil(size*1.5);
  ctx=cv.getContext('2d');ctx.font=font;ctx.textBaseline='middle';
  ctx.globalAlpha=opacity;ctx.fillStyle=color||'#111111';ctx.fillText(text,8,cv.height/2);
  return cv.toDataURL('image/png');
}

/* ---------- 快捷处理 ---------- */
W.bind.quick=()=>{
  $('#qDelFirst').onclick=async()=>{
    if(!need())return;const n=Math.max(1,Math.min(+$('#qFirst').value||1,W.pages-1));
    await W.mutate(p=>{for(let i=n-1;i>=0;i--)p.removePage(0)},`删除开头 ${n} 页`);
  };
  $('#qDelExpr').onclick=async()=>{
    if(!need())return;const list=parseExpr($('#qExpr').value,W.pages);
    if(!list.length)return toast('没有识别到有效页码','warn');
    if(list.length>=W.pages)return toast('不能把全部页面删掉','warn');
    await W.mutate(p=>{for(let i=list.length-1;i>=0;i--)p.removePage(list[i])},`删除 ${list.length} 页`);
  };
  $('#qCropBtn').onclick=async()=>{
    if(!need())return;const mm=+$('#qCrop').value||0;
    if(mm<=0)return toast('请先填写边距','warn');
    const m=mm*2.83465;
    await W.mutate(p=>{for(const pg of p.getPages()){
      const {width,height}=pg.getSize();
      if(width>2*m+40&&height>2*m+40)pg.setCropBox(m,m,width-m,height-m);
    }},`裁剪白边 ${mm} mm`);
  };
  const nup=n=>async()=>{
    if(!need())return;toast('正在排版…');
    const imgs=await pageImages(all(),100,'png');
    const src=await PDFLib.PDFDocument.load(W.bytes);const first=src.getPage(0).getSize();
    const out=await PDFLib.PDFDocument.create();
    const cols=2,rows=n===2?1:2,cw=first.width/cols,ch=first.height/rows;
    for(let s=0;s<imgs.length;s+=n){
      const pg=out.addPage([first.width,first.height]);
      for(let k=0;k<n&&s+k<imgs.length;k++){
        const buf=new Uint8Array(await imgs[s+k].blob.arrayBuffer());
        const png=await out.embedPng(buf);
        const cx=k%cols,cy=Math.floor(k/cols);
        const scale=Math.min((cw-8)/png.width,(ch-8)/png.height);
        pg.drawImage(png,{x:cx*cw+(cw-png.width*scale)/2,y:first.height-(cy+1)*ch+(ch-png.height*scale)/2,
          width:png.width*scale,height:png.height*scale});
      }
    }
    const bytes=await out.save();W.bytes=bytes;
    W.history=W.history.slice(0,W.hIndex+1);W.history.push({bytes:bytes.slice(),label:`${n} 合 1`});W.hIndex=W.history.length-1;
    await refresh();toast(`${n} 合 1 完成`);
  };
  $('#qNup2').onclick=nup(2);$('#qNup4').onclick=nup(4);
  $('#qBatch').onclick=()=>$('#qBatchInput').click();
  $('#qBatchInput').onchange=async e=>{
    const fs=[...e.target.files].filter(f=>/\.pdf$/i.test(f.name));e.target.value='';
    if(!fs.length)return;toast(`正在处理 ${fs.length} 个文件…`);
    const files=[];
    for(const f of fs){
      try{const p=await PDFLib.PDFDocument.load(await f.arrayBuffer());
        if(p.getPageCount()>1)p.removePage(0);
        files.push({name:stem(f.name)+'_去封面.pdf',bytes:await p.save()});}
      catch(err){toast(f.name+' 处理失败','warn')}
    }
    if(!files.length)return;
    showResult(`已处理 ${files.length} 个文件`,await zipOf(files),'批量去封面.zip');
  };
  updateSelInfo();
};

/* ---------- 页面管理 ---------- */
W.bind.pages=()=>{
  $('#pReset').onclick=()=>resetAll();
  $('#pDelete').onclick=()=>{if(!need())return;const s=sel();if(!s.length)return toast('请先勾选页面','warn');
    if(s.length>=W.pages)return toast('至少保留一页','warn');
    W.mutate(p=>{for(let i=s.length-1;i>=0;i--)p.removePage(s[i])},`删除 ${s.length} 页`)};
  $('#pKeep').onclick=async()=>{if(!need())return;const s=sel();if(!s.length)return toast('请先勾选页面','warn');
    const bytes=await subset(s);W.bytes=bytes;W.history=W.history.slice(0,W.hIndex+1);
    W.history.push({bytes:bytes.slice(),label:'只保留选中页'});W.hIndex=W.history.length-1;
    await refresh();toast('已只保留选中页')};
  $('#pDup').onclick=async()=>{if(!need())return;const s=sel();if(!s.length)return toast('请先勾选页面','warn');
    const src=await PDFLib.PDFDocument.load(W.bytes);const out=await PDFLib.PDFDocument.create();
    const idx=[];for(let i=0;i<W.pages;i++){idx.push(i);if(s.includes(i))idx.push(i)}
    const pages=await out.copyPages(src,idx);pages.forEach(p=>out.addPage(p));
    const bytes=await out.save();W.bytes=bytes;W.history=W.history.slice(0,W.hIndex+1);
    W.history.push({bytes:bytes.slice(),label:'复制页面'});W.hIndex=W.history.length-1;
    await refresh();toast('已复制')};
  const rot=a=>()=>{if(!need())return;const s=sel();if(!s.length)return toast('请先勾选页面','warn');
    W.mutate(p=>{for(const i of s){const pg=p.getPage(i);pg.setRotation(PDFLib.degrees((pg.getRotation().angle+a)%360))}},`旋转 ${s.length} 页`)};
  $('#pR90').onclick=rot(90);$('#pR270').onclick=rot(270);
  $('#pAppend').onclick=()=>$('#pAppendInput').click();
  $('#pAppendInput').onchange=async e=>{
    const fs=[...e.target.files].filter(f=>/\.pdf$/i.test(f.name));e.target.value='';
    if(!fs.length||!need())return;
    const out=await PDFLib.PDFDocument.load(W.bytes);
    for(const f of fs){const src=await PDFLib.PDFDocument.load(await f.arrayBuffer());
      (await out.copyPages(src,src.getPageIndices())).forEach(p=>out.addPage(p))}
    const bytes=await out.save();W.bytes=bytes;W.history=W.history.slice(0,W.hIndex+1);
    W.history.push({bytes:bytes.slice(),label:'追加合并'});W.hIndex=W.history.length-1;
    await refresh();toast('已追加合并');
  };
  $('#pBlank').onclick=()=>W.mutate(p=>{const s=p.getPage(0).getSize();p.addPage([s.width,s.height])},'插入空白页');
  $('#pOdd').onclick=()=>{W.selected=new Set(all().filter(i=>i%2===0));renderGrid();updateSelInfo()};
  $('#pEven').onclick=()=>{W.selected=new Set(all().filter(i=>i%2===1));renderGrid();updateSelInfo()};
  updateSelInfo();
};

/* ---------- 格式转换 ---------- */
W.bind.convert=()=>{
  const idx=()=>range($('#cRange').value);
  const build=async(kind)=>{
    if(!need())return;const ids=idx();if(!ids.length)return toast('请先勾选页面','warn');
    toast('正在提取文字…');
    const pages=await textsOf(ids);
    const chars=pages.reduce((n,p)=>n+p.lines.join('').length,0);
    if(!chars)toast('没提取到文字，可能是扫描件（需 OCR）','warn');
    const base=stemOf();
    if(kind==='word'){showResult('Word 已生成',await makeDocx(pages),base+'.docx')}
    else if(kind==='txt'){
      const t=pages.map(p=>`===== 第 ${p.page} 页 =====\n${p.lines.join('\n')}`).join('\n\n');
      showResult('TXT 已生成',new Blob([t],{type:'text/plain;charset=utf-8'}),base+'.txt');
    }else if(kind==='md'){
      const t=pages.map(p=>`## 第 ${p.page} 页\n\n${p.lines.join('\n\n')}`).join('\n\n');
      showResult('Markdown 已生成',new Blob([t],{type:'text/markdown;charset=utf-8'}),base+'.md');
    }else if(kind==='html'){
      const body=pages.map(p=>`<h2>第 ${p.page} 页</h2>`+p.lines.map(l=>`<p>${xmlEsc(l)}</p>`).join('')).join('');
      const h=`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${xmlEsc(base)}</title><style>body{max-width:760px;margin:40px auto;padding:0 20px;font:16px/1.8 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif}h2{border-bottom:1px solid #ddd;padding-bottom:.3em}</style></head><body>${body}</body></html>`;
      showResult('网页已生成',new Blob([h],{type:'text/html;charset=utf-8'}),base+'.html');
    }else if(kind==='csv'){
      const q=s=>'"'+String(s).replace(/"/g,'""')+'"';
      const t='页码,内容\n'+pages.map(p=>p.lines.map(l=>`${p.page},${q(l)}`).join('\n')).join('\n');
      showResult('CSV 已生成',new Blob(['\ufeff'+t],{type:'text/csv;charset=utf-8'}),base+'.csv');
    }
  };
  $('#cWord').onclick=()=>build('word');$('#cTxt').onclick=()=>build('txt');
  $('#cMd').onclick=()=>build('md');$('#cHtml').onclick=()=>build('html');$('#cCsv').onclick=()=>build('csv');
};

/* ---------- 编辑批注 ---------- */
W.bind.edit=()=>{
  // 水印/页码/插入文字走独立绘图流程（中文以透明 PNG 嵌入）
  $('#eWatermark').onclick=async()=>{
    if(!need())return;const text=$('#eWm').value.trim();if(!text)return toast('请输入水印文字','warn');
    const size=+$('#eSize').value||38,op=Math.min(1,Math.max(.05,+$('#eOpacity').value||.16));
    const scope=$('#eScope').value;let pages;
    if(scope==='selected'){pages=sel();if(!pages.length)return toast('请先勾选页面','warn')}
    else if(scope==='page'){
      const n=+$('#eOnePage').value||1;
      if(n<1||n>W.pages)return toast('页码超出范围','warn');
      pages=[n-1];
    }else pages=all();
    await W.draw(textPng(text,size,'#888888',op),'tile',size,pages);
    toast(pages.length===W.pages?'水印已添加到全部页面':`水印已添加到第 ${pages.map(i=>i+1).join('、')} 页`);
  };
  $('#ePageNum').onclick=async()=>{
    if(!need())return;const tpl=$('#eTpl').value||'第 {n} 页 / 共 {t} 页';
    const pdf=await PDFLib.PDFDocument.load(W.bytes);const total=pdf.getPageCount();
    for(let i=0;i<total;i++){
      const pg=pdf.getPage(i);const {width}=pg.getSize();
      const label=tpl.replace(/\{n\}/g,i+1).replace(/\{t\}/g,total);
      const png=await pdf.embedPng(textPng(label,11,'#666666',1));
      pg.drawImage(png,{x:(width-png.width)/2,y:22,width:png.width,height:png.height});
    }
    const bytes=await pdf.save();W.bytes=bytes;W.history=W.history.slice(0,W.hIndex+1);
    W.history.push({bytes:bytes.slice(),label:'添加页码'});W.hIndex=W.history.length-1;
    await refresh();toast('页码已添加');
  };
  $('#eInsert').onclick=async()=>{
    if(!need())return;const text=$('#eText').value.trim();if(!text)return toast('请输入文字','warn');
    const pno=Math.max(1,+$('#ePage').value||1);if(pno>W.pages)return toast('页码超出范围','warn');
    const size=+$('#eTextSize').value||14,x=+$('#eX').value||72,yTop=+$('#eY').value||72;
    const pdf=await PDFLib.PDFDocument.load(W.bytes);const pg=pdf.getPage(pno-1);
    const png=await pdf.embedPng(textPng(text,size,'#111111',1));
    pg.drawImage(png,{x,y:pg.getHeight()-yTop-png.height,width:png.width,height:png.height});
    const bytes=await pdf.save();W.bytes=bytes;W.history=W.history.slice(0,W.hIndex+1);
    W.history.push({bytes:bytes.slice(),label:'插入文字'});W.hIndex=W.history.length-1;
    await refresh();toast('文字已写入');
  };
};
W.draw=async(dataUrl,mode,size,pages)=>{
  const pdf=await PDFLib.PDFDocument.load(W.bytes);
  const png=await pdf.embedPng(dataUrl); // 只嵌入一次，所有页面复用，避免体积暴涨
  const list=(pages&&pages.length)?pages:pdf.getPageIndices();
  for(const idx of list){
    const pg=pdf.getPage(idx);
    const {width,height}=pg.getSize();
    const w=Math.min(png.width,width*.8),h=png.height*(w/png.width);
    if(mode==='tile'){
      for(let r=0;r<3;r++)for(let c=0;c<2;c++)
        pg.drawImage(png,{x:c*width/2+(width/2-w)/2,y:height*(2-r)/3+(height/3-h)/2,
          width:w,height:h,opacity:0.9,rotate:PDFLib.degrees(35)});
    }
  }
  const bytes=await pdf.save();W.bytes=bytes;W.history=W.history.slice(0,W.hIndex+1);
  W.history.push({bytes:bytes.slice(),label:'添加水印'});W.hIndex=W.history.length-1;
  await refresh();
};

/* ---------- 拆分导出 ---------- */
W.bind.export=()=>{
  $('#xImages').onclick=async()=>{
    if(!need())return;toast('正在渲染图片…');
    const dpi=+$('#xDpi').value||150,fmt=$('#xFmt').value;
    const imgs=await pageImages(all(),dpi,fmt);
    const ext=fmt==='jpeg'?'jpg':'png';
    const files=imgs.map(i=>({name:`${stemOf()}_第${i.page}页.${ext}`,blob:i.blob}));
    showResult(`已导出 ${files.length} 张图片`,await zipOf(files),`${stemOf()}_图片.zip`);
  };
  $('#xSplit').onclick=async()=>{
    if(!need())return;const n=Math.max(1,+$('#xChunk').value||1);const files=[];
    for(let s=0;s<W.pages;s+=n){
      const ids=all().slice(s,s+n);
      files.push({name:`${stemOf()}_第${s+1}-${s+ids.length}页.pdf`,bytes:await subset(ids)});
    }
    showResult(`已拆成 ${files.length} 个 PDF`,await zipOf(files),`${stemOf()}_拆分.zip`);
  };
  $('#xSplitRanges').onclick=async()=>{
    if(!need())return;const rs=parseRanges($('#xRanges').value,W.pages);
    if(!rs.length)return toast('请输入页码段，如 1-3,4-10','warn');
    const files=[];
    for(const [a,b] of rs)files.push({name:`${stemOf()}_第${a+1}-${b+1}页.pdf`,bytes:await subset(all().slice(a,b+1))});
    showResult(`已拆成 ${files.length} 段`,await zipOf(files),`${stemOf()}_分段.zip`);
  };
  $('#xExtract').onclick=async()=>{
    if(!need())return;const s=sel();if(!s.length)return toast('请先勾选页面','warn');
    showResult(`已提取 ${s.length} 页`,await subset(s),`${stemOf()}_提取.pdf`,'application/pdf');
  };
};
})();
