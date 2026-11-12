/* PDF 工作台 · 图片尺寸 / 体积调整（Canvas，全程本地） */
(() => {
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

function loadImg(src){
  return new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=src});
}
function toBlob(cv,type,q){
  return new Promise(r=>cv.toBlob(b=>r(b),type,q===undefined?undefined:q/100));
}
function draw(img,w,h){
  const cv=document.createElement('canvas');cv.width=w;cv.height=h;
  const c=cv.getContext('2d');c.imageSmoothingQuality='high';
  if(/\.png$/i.test(W.image.name)||W.image.file?.type==='image/png'){
    // 透明图保留透明底，JPG 则需白底避免黑块
  }
  c.fillStyle='#fff';c.fillRect(0,0,w,h);
  c.drawImage(img,0,0,w,h);
  return cv;
}

W.pickImage=async file=>{
  const src=URL.createObjectURL(file);
  try{
    const img=await loadImg(src);
    W.image={name:file.name,file,w:img.width,h:img.height,bytes:file.size,src};
    $('#imgBefore').src=src;
    $('#imgBeforeInfo').textContent=`${img.width}×${img.height} px · ${fmt(file.size)}`;
    $('#imgName').textContent=file.name;
    $('#iInfo').innerHTML=`已选 <b>${esc(file.name)}</b><br>${img.width}×${img.height} px · ${fmt(file.size)}`;
    $('#imgAfter').removeAttribute('src');$('#imgAfterInfo').textContent='点「开始调整」生成';
    $('#imgStage').classList.remove('hidden');
    $('#drop').classList.add('hidden');$('#workspace').classList.add('hidden');
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
  $('#iRun').onclick=async()=>{
    const I=W.image;if(!I)return toast('请先选择图片','warn');
    toast('正在调整…');
    const img=await loadImg(I.src);
    let w=+$('#iW').value||0,h=+$('#iH').value||0;
    const keep=$('#iKeep').checked;
    if(w||h){
      if(keep){
        const scale=w&&h?Math.min(w/I.w,h/I.h):(w?w/I.w:h/I.h);
        w=Math.max(1,Math.round(I.w*scale));h=Math.max(1,Math.round(I.h*scale));
      }else{w=w||I.w;h=h||I.h}
    }else{w=I.w;h=I.h}
    let cv=draw(img,w,h);
    const type=$('#iFmt').value;
    const maxBytes=(+$('#iMaxKb').value||0)*1024;
    const quality=+$('#iQ').value||88;
    let blob,hit=true,param=quality,resized=(w!==I.w||h!==I.h);

    const bestQ=async(canvas)=>{
      let lo=1,hi=95,best=null;
      while(lo<=hi){
        const mid=(lo+hi)>>1;
        const b=await toBlob(canvas,type,mid);
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
        const small=draw(img,nw,nh);
        const b=await toBlob(small,type);
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
    const url=URL.createObjectURL(blob);
    $('#imgAfter').src=url;
    const ratio=I.bytes?(100-blob.size/I.bytes*100).toFixed(1):0;
    $('#imgAfterInfo').textContent=`${w}×${h} px · ${fmt(blob.size)} · 参数 ${param}${maxBytes?(hit?' · 已达标':' · 未达标'):''}`;
    showResult(`调整完成，缩小 ${ratio}%`,blob,`${stem(I.name)}_已调整.${ext}`,
      hit?'':`目标体积偏小，已尽量压缩；可放宽 KB 或改小尺寸。`);
    toast('调整完成：'+fmt(blob.size));
  };
};
})();
