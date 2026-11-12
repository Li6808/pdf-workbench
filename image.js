/* PDF 工作台 · 图片：换背景 / 尺寸 / 体积（Canvas，全程本地） */
(() => {
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

function loadImg(src){
  return new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=src});
}
function toBlob(cv,type,q){
  return new Promise(r=>cv.toBlob(b=>r(b),type,q===undefined?undefined:q/100));
}
function draw(img,w,h,type){
  const cv=document.createElement('canvas');cv.width=w;cv.height=h;
  const c=cv.getContext('2d');c.imageSmoothingQuality='high';
  if(type==='image/jpeg'){c.fillStyle='#fff';c.fillRect(0,0,w,h)} // JPG 无透明通道，先铺白底
  c.drawImage(img,0,0,w,h);
  return cv;
}
function hex2rgb(h){
  const s=(h||'#ffffff').replace('#','');
  return [0,2,4].map(i=>parseInt(s.slice(i,i+2),16));
}
/* 证件照换底色：四角采样估计纯色背景，按颜色距离替换并做边缘羽化 */
function changeBg(img,hex,tol){
  const w=img.naturalWidth||img.width,h=img.naturalHeight||img.height;
  const cv=document.createElement('canvas');cv.width=w;cv.height=h;
  const c=cv.getContext('2d',{willReadFrequently:true});c.drawImage(img,0,0,w,h);
  const d=c.getImageData(0,0,w,h),a=d.data;
  const zones=[[0,0],[w-1,0],[0,h-1],[w-1,h-1],[Math.floor(w/2),0]];
  const samples=zones.map(([x,y])=>{const i=(y*w+x)*4;return [a[i],a[i+1],a[i+2]]});
  const bg=[0,1,2].map(k=>samples.reduce((s,v)=>s+v[k],0)/samples.length);
  const t=hex2rgb(hex),soft=tol+40;
  for(let i=0;i<a.length;i+=4){
    const dist=Math.hypot(a[i]-bg[0],a[i+1]-bg[1],a[i+2]-bg[2]);
    if(dist<=tol){a[i]=t[0];a[i+1]=t[1];a[i+2]=t[2]}
    else if(dist<soft){
      const k=(soft-dist)/(soft-tol);
      a[i]=Math.round(a[i]+(t[0]-a[i])*k);
      a[i+1]=Math.round(a[i+1]+(t[1]-a[i+1])*k);
      a[i+2]=Math.round(a[i+2]+(t[2]-a[i+2])*k);
    }
  }
  c.putImageData(d,0,0);
  return cv;
}

W.pickImage=async file=>{
  const src=URL.createObjectURL(file);
  try{
    const img=await loadImg(src);
    W.image={name:file.name,file,w:img.width,h:img.height,bytes:file.size,
             src,origSrc:src,resultBlob:null,resultName:null};
    $('#imgBefore').src=src;
    $('#imgBeforeInfo').textContent=`${img.width}×${img.height} px · ${fmt(file.size)}`;
    $('#imgName').textContent=file.name;
    $('#iInfo').innerHTML=`已选 <b>${esc(file.name)}</b><br>${img.width}×${img.height} px · ${fmt(file.size)}`;
    $('#imgAfter').removeAttribute('src');$('#imgAfterInfo').textContent='点「开始调整」或「一键换背景」生成';
    $('#imgDownload').disabled=true;
    $('#imgStage').classList.remove('hidden');
    $('#drop').classList.add('hidden');$('#workspace').classList.add('hidden');
    $('#btnReset').disabled=false;
    toast('图片已载入');
  }catch(e){toast('图片读取失败','err')}
};

W.bind.image=()=>{
  $('#iPick').onclick=()=>$('#iInput').click();
  $('#iInput').onchange=e=>{if(e.target.files[0])W.pickImage(e.target.files[0]);e.target.value=''};
  $('#iQ').oninput=e=>$('#iQVal').textContent=e.target.value;
  $$('#iPills .pill').forEach(b=>b.onclick=()=>{
    $('#iMaxKb').value=b.dataset.kb;
    $$('#iPills .pill').forEach(x=>x.classList.toggle('on',x===b));
  });
  $('#iMaxKb').oninput=()=>$$('#iPills .pill').forEach(x=>x.classList.remove('on'));

  /* 换背景 */
  $$('#bgPills .pill').forEach(b=>b.onclick=()=>{
    $('#bgColor').value=b.dataset.bg;
    $$('#bgPills .pill').forEach(x=>x.classList.toggle('on',x===b));
  });
  $('#bgColor').oninput=()=>$$('#bgPills .pill').forEach(x=>x.classList.remove('on'));
  $('#bgRun').onclick=async()=>{
    const I=W.image;if(!I)return toast('请先选择图片','warn');
    toast('正在识别底色…');
    try{
      const img=await loadImg(I.src);
      const cv=changeBg(img,$('#bgColor').value||'#ffffff',+$('#bgTol').value||55);
      const blob=await toBlob(cv,'image/png');
      const url=URL.createObjectURL(blob);
      $('#imgBefore').src=I.origSrc||I.src;
      $('#imgAfter').src=url;
      $('#imgAfterInfo').textContent=`${cv.width}×${cv.height} px · ${fmt(blob.size)} · 已换背景`;
      W.image.src=url;                       // 后续压缩基于换好背景的图
      W.image.resultBlob=blob;
      W.image.resultName=`${stem(I.name)}_换背景.png`;
      $('#imgDownload').disabled=false;
      showResult('背景已替换',blob,W.image.resultName);
      toast('换背景完成，可继续压缩或直接下载');
    }catch(e){toast('换背景失败：'+e.message,'err')}
  };
  $('#imgDownload').onclick=()=>{
    const I=W.image;
    if(!I||!I.resultBlob)return toast('请先生成结果','warn');
    download(I.resultBlob,I.resultName||'图片结果.png',I.resultBlob.type);
    toast('已开始下载');
  };

  /* 尺寸与体积 */
  $('#iRun').onclick=async()=>{
    const I=W.image;if(!I)return toast('请先选择图片','warn');
    toast('正在调整…');
    const img=await loadImg(I.src);
    let w=+$('#iW').value||0,h=+$('#iH').value||0;
    const keep=$('#iKeep').checked;
    if(w||h){
      if(keep){const scale=w&&h?Math.min(w/I.w,h/I.h):(w?w/I.w:h/I.h);
        w=Math.max(1,Math.round(I.w*scale));h=Math.max(1,Math.round(I.h*scale))}
      else{w=w||I.w;h=h||I.h}
    }else{w=I.w;h=I.h}
    const type=$('#iFmt').value;
    let cv=draw(img,w,h,type);
    const maxBytes=(+$('#iMaxKb').value||0)*1024;
    const quality=+$('#iQ').value||88;
    let blob,hit=true,param=quality,resized=(w!==I.w||h!==I.h);
    const bestQ=async(canvas)=>{
      let lo=1,hi=95,best=null;
      while(lo<=hi){
        const mid=(lo+hi)>>1,b=await toBlob(canvas,type,mid);
        if(b.size<=maxBytes){best={q:mid,b};lo=mid+1}else hi=mid-1;
      }
      return best;
    };
    const scaleDown=async(canvas)=>{
      let lo=10,hi=100,best=null;
      while(lo<=hi){
        const pct=(lo+hi)>>1;
        const nw=Math.max(1,Math.round(canvas.width*pct/100));
        const nh=Math.max(1,Math.round(canvas.height*pct/100));
        const b=await toBlob(draw(img,nw,nh,type),type);
        if(b.size<=maxBytes){best={pct,b,w:nw,h:nh};lo=pct+1}else hi=pct-1;
      }
      return best;
    };
    if(maxBytes){
      if(type!=='image/png'){
        const r=await bestQ(cv);
        if(r){param=r.q;blob=r.b}
        else{
          const s=await scaleDown(cv);
          if(s){param=1;blob=s.b;w=s.w;h=s.h;resized=true}
          else{hit=false;param=1;blob=await toBlob(cv,type,1)}
        }
      }else{
        const s=await scaleDown(cv);
        if(s){blob=s.b;w=s.w;h=s.h;resized=true;param=s.pct}
        else{hit=false;blob=await toBlob(cv,type);param=100}
      }
    }else blob=await toBlob(cv,type,quality);

    const ext=type==='image/png'?'png':(type==='image/webp'?'webp':'jpg');
    $('#imgAfter').src=URL.createObjectURL(blob);
    const ratio=I.bytes?(100-blob.size/I.bytes*100).toFixed(1):0;
    $('#imgAfterInfo').textContent=`${w}×${h} px · ${fmt(blob.size)} · 参数 ${param}${maxBytes?(hit?' · 已达标':' · 未达标'):''}`;
    W.image.resultBlob=blob;
    W.image.resultName=`${stem(I.name)}_已调整.${ext}`;
    $('#imgDownload').disabled=false;
    showResult(`调整完成，缩小 ${ratio}%`,blob,W.image.resultName,
      hit?'':`目标体积偏小，已尽量压缩；可放宽 KB 或改小尺寸。`);
    toast('调整完成：'+fmt(blob.size));
  };
};
})();
