
import { getFirebaseConfig, isCloudReady, writeMeta, approveRequestAtomic } from './firebase-adapter.js';

const LOCAL_KEY='somusic_local_state_v1';
const $=(s,el=document)=>el.querySelector(s);
const $$=(s,el=document)=>[...el.querySelectorAll(s)];

function notify(title,message=''){
  const host=$('#toastHost');
  if(!host) return;
  const el=document.createElement('div');
  el.className='toast';
  el.innerHTML=`<strong>${escapeHtml(title)}</strong>${message?`<span>${escapeHtml(message)}</span>`:''}`;
  host.append(el);
  setTimeout(()=>el.remove(),3600);
}
function escapeHtml(v=''){
  return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
function cleanTableLabel(value){
  return String(value||'')
    .trim()
    .replace(/\s+/g,' ')
    .replace(/[^0-9A-Za-zÀ-ÿ _-]/g,'')
    .slice(0,16);
}
function currentTablesFromDom(){
  return $$('.qr-card .stat-value').map(el=>el.textContent.trim()).filter(Boolean);
}
function nextTableLabel(tables){
  const nums=tables.map(x=>Number(x)).filter(Number.isFinite);
  if(nums.length){
    const next=Math.max(...nums)+1;
    return String(next).padStart(2,'0');
  }
  return String(tables.length+1).padStart(2,'0');
}
async function saveTables(tables){
  tables=[...new Set(tables.map(cleanTableLabel).filter(Boolean))].slice(0,50);
  if(getFirebaseConfig()?.apiKey){
    if(!isCloudReady()) throw new Error('Firebase belum siap. Reload halaman lalu coba lagi.');
    await writeMeta({tables});
  }else{
    const raw=localStorage.getItem(LOCAL_KEY);
    const state=raw?JSON.parse(raw):{};
    state.meta=state.meta||{};
    state.meta.tables=tables;
    localStorage.setItem(LOCAL_KEY,JSON.stringify(state));
    try{new BroadcastChannel('somusic-v1').postMessage({type:'sync'})}catch{}
    setTimeout(()=>location.reload(),80);
  }
}
function openDialog({title,body='',value='',confirmText='Simpan',danger=false,onConfirm,input=true}){
  const wrap=document.createElement('div');
  wrap.className='modal-backdrop';
  wrap.innerHTML=`<div class="glass modal"><div class="premium-dialog">
    <div><div class="eyebrow">TABLE MANAGER</div><h3>${escapeHtml(title)}</h3></div>
    ${body?`<p>${escapeHtml(body)}</p>`:''}
    ${input?`<input id="premiumTableInput" maxlength="16" value="${escapeHtml(value)}" autocomplete="off">`:''}
    <div class="premium-dialog-actions">
      <button type="button" data-cancel>Batal</button>
      <button type="button" class="${danger?'delete':'confirm'}" data-confirm>${escapeHtml(confirmText)}</button>
    </div>
  </div></div>`;
  document.body.append(wrap);
  const close=()=>wrap.remove();
  $('[data-cancel]',wrap).addEventListener('click',close);
  wrap.addEventListener('click',e=>{if(e.target===wrap)close()});
  const field=$('#premiumTableInput',wrap);
  field?.focus();
  field?.select();
  $('[data-confirm]',wrap).addEventListener('click',async()=>{
    const val=field?.value??'';
    try{
      await onConfirm(val);
      close();
    }catch(e){notify('Tidak bisa disimpan',e.message)}
  });
  field?.addEventListener('keydown',e=>{
    if(e.key==='Enter') $('[data-confirm]',wrap).click();
    if(e.key==='Escape') close();
  });
}
async function addTable(){
  const tables=currentTablesFromDom();
  openDialog({
    title:'Tambah meja',
    body:'Nomor atau nama meja akan langsung punya QR customer sendiri.',
    value:nextTableLabel(tables),
    confirmText:'Generate QR',
    onConfirm:async raw=>{
      const label=cleanTableLabel(raw);
      if(!label) throw new Error('Nama meja tidak boleh kosong.');
      if(tables.some(x=>x.toLowerCase()===label.toLowerCase())) throw new Error('Meja tersebut sudah ada.');
      await saveTables([...tables,label]);
      notify('QR dibuat',`Meja ${label} ditambahkan.`);
    }
  });
}
async function editTable(oldLabel){
  const tables=currentTablesFromDom();
  openDialog({
    title:`Edit Meja ${oldLabel}`,
    body:'QR akan memakai URL dengan nama meja yang baru.',
    value:oldLabel,
    confirmText:'Simpan perubahan',
    onConfirm:async raw=>{
      const label=cleanTableLabel(raw);
      if(!label) throw new Error('Nama meja tidak boleh kosong.');
      if(tables.some(x=>x.toLowerCase()===label.toLowerCase()&&x!==oldLabel)) throw new Error('Nama meja sudah dipakai.');
      await saveTables(tables.map(x=>x===oldLabel?label:x));
      notify('Meja diperbarui',`${oldLabel} → ${label}`);
    }
  });
}
async function deleteTable(label){
  const tables=currentTablesFromDom();
  openDialog({
    title:`Hapus Meja ${label}?`,
    body:'QR lama sebaiknya tidak dipakai lagi. Request baru dari meja ini akan diblok jika Firestore Rules premium ikut dipublish.',
    confirmText:'Hapus meja',
    danger:true,
    input:false,
    onConfirm:async()=>{
      await saveTables(tables.filter(x=>x!==label));
      notify('Meja dihapus',`Meja ${label} sudah tidak aktif.`);
    }
  });
}
function downloadQr(card,label){
  const canvas=$('.qr-box canvas',card);
  const img=$('.qr-box img',card);
  const href=canvas?.toDataURL?.('image/png')||img?.src;
  if(!href){notify('QR belum siap','Tunggu sebentar lalu coba lagi.');return}
  const a=document.createElement('a');
  a.href=href;
  a.download=`SoMusic-Meja-${label}.png`;
  document.body.append(a);
  a.click();
  a.remove();
}
function enhanceTables(){
  if(!location.hash.startsWith('#admin/tables')) return;
  const grid=$('.qr-grid');
  if(!grid) return;
  const panel=grid.closest('.panel');
  if(panel&&!$('.table-toolbar',panel)){
    const toolbar=document.createElement('div');
    toolbar.className='table-toolbar';
    toolbar.innerHTML=`<input id="quickTableName" maxlength="16" placeholder="Nomor / nama meja, contoh 11 atau VIP A">
      <button class="primary-btn" id="quickAddTable">＋ Generate QR</button>
      <div class="table-help">Create • edit • delete • download QR. Maksimal 50 meja.</div>`;
    const notice=$('.notice',panel);
    notice?.insertAdjacentElement('afterend',toolbar);
    $('#quickAddTable',toolbar).addEventListener('click',()=>{
      const quick=$('#quickTableName',toolbar);
      const raw=cleanTableLabel(quick.value);
      if(!raw){addTable();return}
      const tables=currentTablesFromDom();
      if(tables.some(x=>x.toLowerCase()===raw.toLowerCase())){notify('Meja sudah ada',raw);return}
      saveTables([...tables,raw]).then(()=>notify('QR dibuat',`Meja ${raw} ditambahkan.`)).catch(e=>notify('Gagal',e.message));
    });
    $('#quickTableName',toolbar).addEventListener('keydown',e=>{if(e.key==='Enter')$('#quickAddTable',toolbar).click()});
  }
  $$('.qr-card',grid).forEach(card=>{
    if($('.qr-card-actions',card)) return;
    const label=$('.stat-value',card)?.textContent.trim();
    if(!label) return;
    const actions=document.createElement('div');
    actions.className='qr-card-actions';
    actions.innerHTML=`<button type="button" data-edit-table="${escapeHtml(label)}">✎ Edit</button>
      <button type="button" class="qr-delete" data-delete-table="${escapeHtml(label)}">⌫ Hapus</button>
      <button type="button" class="qr-download" data-download-table="${escapeHtml(label)}">↓ Download QR PNG</button>`;
    card.append(actions);
  });
}
function enhanceSettings(){
  if(!location.hash.startsWith('#admin/settings')) return;
  const count=$('#tableCount');
  if(!count||count.dataset.premiumHandled) return;
  count.dataset.premiumHandled='1';
  const field=count.closest('.field');
  field?.classList.add('premium-table-count-disabled');
  field?.insertAdjacentHTML('beforeend','<div class="premium-table-count-note">Jumlah & nama meja sekarang dikelola dari menu Tables & QR.</div>');
  const save=$('#saveRulesBtn');
  if(save&&!save.dataset.premiumHandled){
    save.dataset.premiumHandled='1';
    save.addEventListener('click',async e=>{
      e.preventDefault();
      e.stopImmediatePropagation();
      const policy={
        maxActive:Math.max(1,Math.min(5,Number($('#maxActive')?.value||1))),
        cooldownMin:Math.max(0,Math.min(120,Number($('#cooldownMin')?.value||0))),
        maxDurationMin:Math.max(1,Math.min(20,Number($('#maxDurationMin')?.value||7))),
        manualApproval:!!$('#manualApproval')?.checked,
        blockDuplicate:true,
        explicitAllowed:false
      };
      try{
        if(getFirebaseConfig()?.apiKey){
          if(!isCloudReady()) throw new Error('Firebase belum siap. Reload halaman lalu coba lagi.');
          await writeMeta({policy});
        }else{
          const state=JSON.parse(localStorage.getItem(LOCAL_KEY)||'{}');
          state.meta=state.meta||{};
          state.meta.policy={...(state.meta.policy||{}),...policy};
          localStorage.setItem(LOCAL_KEY,JSON.stringify(state));
          try{new BroadcastChannel('somusic-v1').postMessage({type:'sync'})}catch{}
          setTimeout(()=>location.reload(),120);
        }
        notify('Rules disimpan','Daftar meja tidak diubah.');
      }catch(err){notify('Rules gagal',err.message)}
    },true);
  }
}
function enhanceHero(){
  const stage=$('.cassette-stage');
  if(!stage||stage.dataset.premiumReady) return;
  stage.dataset.premiumReady='1';
  const tag=$('.cassette-tag',stage);
  if(tag) tag.textContent='SoMusic • Live Session';
  const move=e=>{
    const r=stage.getBoundingClientRect();
    const x=(e.clientX-r.left)/r.width-.5;
    const y=(e.clientY-r.top)/r.height-.5;
    stage.style.setProperty('--ry',`${(x*9).toFixed(2)}deg`);
    stage.style.setProperty('--rx',`${(-y*7).toFixed(2)}deg`);
    stage.classList.add('is-engaged');
  };
  stage.addEventListener('pointermove',move);
  stage.addEventListener('pointerenter',()=>stage.classList.add('is-engaged'));
  stage.addEventListener('pointerleave',()=>{
    stage.style.setProperty('--ry','0deg');
    stage.style.setProperty('--rx','0deg');
    stage.classList.remove('is-engaged');
  });
  stage.addEventListener('pointerdown',()=>stage.classList.add('is-engaged'));
}

let qrRepairTimer=null;
let qrRepairTicks=0;
function repairQrFallbacks(){
  if(typeof window.QRCode!=='function') return false;
  let repaired=false;
  $$('.qr-box').forEach(box=>{
    if(box.querySelector('canvas,img')) return;
    const fallback=box.querySelector('.qr-fallback');
    const text=fallback?.textContent?.trim();
    if(!text) return;
    try{
      box.innerHTML='';
      new window.QRCode(box,{
        text,
        width:134,
        height:134,
        colorDark:'#111111',
        colorLight:'#ffffff',
        correctLevel:window.QRCode.CorrectLevel?.M
      });
      repaired=true;
    }catch{}
  });
  return repaired;
}
function scheduleQrRepair(){
  if(qrRepairTimer) return;
  qrRepairTicks=0;
  qrRepairTimer=setInterval(()=>{
    qrRepairTicks++;
    repairQrFallbacks();
    if(qrRepairTicks>=40){
      clearInterval(qrRepairTimer);
      qrRepairTimer=null;
    }
  },250);
}
function setupAtomicApprove(){
  document.addEventListener('click',async e=>{
    const btn=e.target.closest('[data-approve]');
    if(!btn||!isCloudReady()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if(btn.dataset.atomicBusy==='1') return;
    btn.dataset.atomicBusy='1';
    btn.disabled=true;
    const old=btn.textContent;
    btn.textContent='Approving…';
    try{
      await approveRequestAtomic(btn.dataset.approve);
      notify('Request approved','Request masuk antrean secara atomik.');
    }catch(err){
      notify('Approve gagal',err.message);
      btn.disabled=false;
      btn.textContent=old;
      btn.dataset.atomicBusy='0';
    }
  },true);
}
function addClickLocks(){
  document.addEventListener('click',e=>{
    const btn=e.target.closest('[data-approve],[data-reject],[data-play-queue],[data-remove-queue]');
    if(!btn) return;
    if(btn.dataset.busy==='1'){
      e.preventDefault();e.stopImmediatePropagation();return;
    }
    btn.dataset.busy='1';
    btn.style.pointerEvents='none';
    setTimeout(()=>{btn.dataset.busy='0';btn.style.pointerEvents='';},6000);
  },true);
}
document.addEventListener('click',e=>{
  const edit=e.target.closest('[data-edit-table]');
  if(edit){editTable(edit.dataset.editTable);return}
  const del=e.target.closest('[data-delete-table]');
  if(del){deleteTable(del.dataset.deleteTable);return}
  const dl=e.target.closest('[data-download-table]');
  if(dl){downloadQr(dl.closest('.qr-card'),dl.dataset.downloadTable);return}
});
const observer=new MutationObserver(()=>{
  enhanceHero();
  enhanceTables();
  enhanceSettings();
  repairQrFallbacks();
});
observer.observe(document.documentElement,{subtree:true,childList:true});
window.addEventListener('hashchange',()=>setTimeout(()=>{enhanceTables();enhanceSettings();enhanceHero();scheduleQrRepair()},0));
setupAtomicApprove();
addClickLocks();
scheduleQrRepair();
enhanceHero();
enhanceTables();
enhanceSettings();
