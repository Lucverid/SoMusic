const CONFIG_KEY='somusic_firebase_config_v1';
let sdk=null,app=null,db=null,auth=null,venueId='default';
let unsubs=[];

export function getFirebaseConfig(){try{return JSON.parse(localStorage.getItem(CONFIG_KEY)||'null')}catch{return null}}
export function saveFirebaseConfig(cfg){
  const copy={...cfg}; if(copy.venueId){venueId=String(copy.venueId).trim()||'default'}
  localStorage.setItem(CONFIG_KEY,JSON.stringify(copy)); return copy;
}
export function clearFirebaseConfig(){localStorage.removeItem(CONFIG_KEY)}
export function isCloudReady(){return !!db}
export function getVenueId(){return venueId}

export async function initFirebase(){
  const cfg=getFirebaseConfig(); if(!cfg?.apiKey||!cfg?.projectId) return false;
  venueId=String(cfg.venueId||'default').replace(/[^a-zA-Z0-9_-]/g,'')||'default';
  const v='11.10.0';
  const [fa,ff,au]=await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${v}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${v}/firebase-firestore.js`),
    import(`https://www.gstatic.com/firebasejs/${v}/firebase-auth.js`)
  ]);
  sdk={...fa,...ff,...au}; app=fa.initializeApp(cfg); db=ff.getFirestore(app); auth=au.getAuth(app);
  return true;
}
export async function ensureGuestAuth(){
  if(!auth) return null; if(auth.currentUser) return auth.currentUser;
  try{return (await sdk.signInAnonymously(auth)).user}catch(e){console.warn('Anonymous auth unavailable',e);return null}
}
export async function adminLogin(email,password){if(!auth) throw new Error('Firebase belum aktif.');return (await sdk.signInWithEmailAndPassword(auth,email,password)).user}
export async function adminLogout(){
  if(!auth) return null;
  await sdk.signOut(auth);
  try{return (await sdk.signInAnonymously(auth)).user}catch(e){console.warn('Guest auth after logout unavailable',e);return null}
}
export function currentUser(){return auth?.currentUser||null}
export function onAuth(fn){if(!auth){fn(null);return()=>{}}return sdk.onAuthStateChanged(auth,fn)}

const metaRef=()=>sdk.doc(db,'venues',venueId,'meta','public');
const reqCol=()=>sdk.collection(db,'venues',venueId,'requests');
const queueCol=()=>sdk.collection(db,'venues',venueId,'queue');
const histCol=()=>sdk.collection(db,'venues',venueId,'history');

const snapData=d=>({...d.data(),id:d.id});
const withoutClientId=value=>{const {id:ignored,...rest}=value||{};return rest};

export function subscribeCloud({onMeta,onRequests,onQueue,onError}){
  if(!db) return ()=>{};
  unsubs.push(sdk.onSnapshot(metaRef(),s=>{if(s.exists()) onMeta?.({...s.data(),id:s.id})},onError));
  unsubs.push(sdk.onSnapshot(sdk.query(reqCol(),sdk.orderBy('createdAt','asc')),s=>onRequests?.(s.docs.map(snapData)),onError));
  unsubs.push(sdk.onSnapshot(sdk.query(queueCol(),sdk.orderBy('position','asc')),s=>onQueue?.(s.docs.map(snapData)),onError));
  return ()=>{unsubs.forEach(f=>f?.());unsubs=[]}
}
export async function writeMeta(meta){if(!db) throw new Error('Cloud belum aktif.');return sdk.setDoc(metaRef(),meta,{merge:true})}
export async function createRequest(r){
  if(!db) throw new Error('Cloud belum aktif.');
  const user=await ensureGuestAuth();
  if(!user) throw new Error('Guest authentication gagal. Cek Firebase Anonymous Auth.');
  const ref=sdk.doc(reqCol());
  const data=withoutClientId(r);
  await sdk.setDoc(ref,{
    ...data,
    ownerUid:user.uid,
    createdAt:sdk.serverTimestamp(),
    createdAtMs:Date.now()
  });
  return ref.id;
}
export async function updateRequest(id,patch){return sdk.updateDoc(sdk.doc(db,'venues',venueId,'requests',id),patch)}
export async function deleteRequest(id){return sdk.deleteDoc(sdk.doc(db,'venues',venueId,'requests',id))}
export async function approveRequestAtomic(id){
  if(!db) throw new Error('Cloud belum aktif.');
  const requestId=String(id||'').trim();
  if(!requestId) throw new Error('Request ID kosong.');
  const rRef=sdk.doc(db,'venues',venueId,'requests',requestId);
  const qRef=sdk.doc(db,'venues',venueId,'queue',requestId.replace(/\//g,'_'));
  const now=Date.now();

  await sdk.runTransaction(db,async tx=>{
    const snap=await tx.get(rRef);
    if(!snap.exists()) throw new Error('Request sudah tidak ditemukan.');
    const r=snap.data();
    if(['rejected','played','cancelled','playing'].includes(r.status)){
      throw new Error(`Request tidak bisa di-approve karena statusnya ${r.status}.`);
    }
    tx.set(qRef,{
      requestId,
      tableId:String(r.tableId||''),
      title:String(r.title||''),
      artist:String(r.artist||''),
      trackId:String(r.trackId||''),
      uri:String(r.uri||''),
      durationMs:Number(r.durationMs||0),
      image:String(r.image||''),
      position:Number(r.approvedAtMs||now),
      createdAt:sdk.serverTimestamp(),
      createdAtMs:Number(r.createdAtMs||now)
    },{merge:true});
    tx.update(rRef,{status:'approved',approvedAtMs:now});
  });
  return requestId;
}
export async function addQueue(item){
  if(!db) throw new Error('Cloud belum aktif.');
  const data=withoutClientId(item);
  const requestId=String(data?.requestId||'').trim();
  const ref=requestId
    ? sdk.doc(queueCol(), requestId.replace(/\//g,'_'))
    : sdk.doc(queueCol());
  await sdk.setDoc(ref,{...data,createdAt:sdk.serverTimestamp(),createdAtMs:Date.now()},{merge:true});
  return ref.id;
}
export async function updateQueue(id,patch){return sdk.updateDoc(sdk.doc(db,'venues',venueId,'queue',id),patch)}
export async function removeQueue(id){return sdk.deleteDoc(sdk.doc(db,'venues',venueId,'queue',id))}
export async function addHistory(item){
  if(!db) throw new Error('Cloud belum aktif.');
  const ref=sdk.doc(histCol());
  const data=withoutClientId(item);
  await sdk.setDoc(ref,{...data,playedAt:sdk.serverTimestamp(),playedAtMs:Date.now()});
  return ref.id;
}
