/* USA Trip 2026 — shared cloud sync layer
   Strategy: localStorage remains the immediate/offline cache; Supabase is the shared cloud copy.
   One family Supabase Auth account can be used on all family devices for the simplest setup.
*/
(function(){
  'use strict';

  const CFG = window.USA_TRIP_CONFIG || {};
  const META_KEY = 'usa2026_cloud_meta_v1';
  const CLIENT_KEY = 'usa2026_cloud_client_id';
  const TRIP_ID = CFG.tripId || 'usa-2026';
  const CLIENT_ID = localStorage.getItem(CLIENT_KEY) || ('client_'+Date.now()+'_'+Math.random().toString(36).slice(2,10));
  localStorage.setItem(CLIENT_KEY, CLIENT_ID);

  let client = null;
  let session = null;
  let channel = null;
  let cloudReady = false;
  let syncing = false;
  let syncTimer = null;
  let pendingRemote = null;
  let initialChoicePending = false;

  function readMeta(){
    try{return JSON.parse(localStorage.getItem(META_KEY)||'{}')}catch{return {}}
  }
  function writeMeta(patch){
    const next = Object.assign({}, readMeta(), patch);
    localStorage.setItem(META_KEY, JSON.stringify(next));
    return next;
  }
  function configured(){
    return !!(CFG.supabaseUrl && CFG.supabasePublishableKey && !String(CFG.supabaseUrl).includes('PASTE_') && !String(CFG.supabasePublishableKey).includes('PASTE_'));
  }
  function status(text, mode=''){
    const el=document.getElementById('cloudStatus'), tx=document.getElementById('cloudStatusText');
    if(!el||!tx)return;
    tx.textContent=text;
    el.classList.remove('online','offline','warn');
    if(mode)el.classList.add(mode);
  }
  function normalize(s){
    s = s && typeof s==='object' ? s : {};
    s.expenses=Array.isArray(s.expenses)?s.expenses:[];
    s.reservations=Array.isArray(s.reservations)?s.reservations:[];
    s.activities=Array.isArray(s.activities)?s.activities:[];
    s.places=Array.isArray(s.places)?s.places:[];
    s.notes=s.notes&&typeof s.notes==='object'?s.notes:{};
    s.done=s.done&&typeof s.done==='object'?s.done:{};
    s.visited=s.visited&&typeof s.visited==='object'?s.visited:{};
    s.stopEdits=s.stopEdits&&typeof s.stopEdits==='object'?s.stopEdits:{};
    s.dayEdits=s.dayEdits&&typeof s.dayEdits==='object'?s.dayEdits:{};
    return s;
  }
  function meaningful(s){
    s=normalize(JSON.parse(JSON.stringify(s||{})));
    return s.expenses.length||s.reservations.length||s.activities.length||s.places.length||
      Object.keys(s.notes).length||Object.keys(s.done).length||Object.keys(s.visited).length||
      Object.keys(s.stopEdits).length||Object.keys(s.dayEdits).length;
  }
  function cloneState(){return JSON.parse(JSON.stringify(normalize(state)))}
  function refreshUI(){
    try{renderDays(document.getElementById('daySearch')?.value||'')}catch(e){}
    try{renderBudget()}catch(e){}
  }
  function applyRemote(row){
    if(!row || !row.state)return;
    state = normalize(JSON.parse(JSON.stringify(row.state)));
    try{ensureCustomIds()}catch(e){}
    localStorage.setItem(STORE, JSON.stringify(state));
    writeMeta({
      boundUserId: session?.user?.id || null,
      lastCloudUpdatedAt: row.updated_at || null,
      lastSyncAt: new Date().toISOString(),
      dirty:false
    });
    pendingRemote=null;
    refreshUI();
    status(navigator.onLine?'☁️ מסונכרן':'📴 אופליין • נתונים שמורים','online');
  }

  async function fetchRow(){
    const {data,error}=await client.from('trip_state')
      .select('trip_id,state,updated_at,updated_by_client')
      .eq('trip_id',TRIP_ID).maybeSingle();
    if(error)throw error;
    return data;
  }

  async function pushLocal(force=false){
    if(!client||!session||!navigator.onLine||syncing||initialChoicePending)return;
    syncing=true;
    clearTimeout(syncTimer); syncTimer=null;
    try{
      const meta=readMeta();
      if(!force){
        const remote=await fetchRow();
        if(remote && meta.lastCloudUpdatedAt && remote.updated_at && remote.updated_at!==meta.lastCloudUpdatedAt && remote.updated_by_client!==CLIENT_ID){
          pendingRemote=remote;
          status('⚠️ שינוי במכשיר אחר','warn');
          showConflict(remote);
          return;
        }
      }
      status('☁️ מסנכרן…');
      const payload={
        trip_id:TRIP_ID,
        owner_id:session.user.id,
        state:cloneState(),
        updated_by_client:CLIENT_ID
      };
      const {data,error}=await client.from('trip_state')
        .upsert(payload,{onConflict:'trip_id'})
        .select('trip_id,state,updated_at,updated_by_client').single();
      if(error)throw error;
      writeMeta({boundUserId:session.user.id,lastCloudUpdatedAt:data.updated_at,lastSyncAt:new Date().toISOString(),dirty:false});
      status('☁️ מסונכרן','online');
    }catch(err){
      console.error('Trip cloud sync failed',err);
      writeMeta({dirty:true});
      status(navigator.onLine?'⚠️ שגיאת סנכרון':'📴 אופליין • נשמר מקומית',navigator.onLine?'warn':'offline');
    }finally{syncing=false;}
  }

  function queueSync(){
    writeMeta({dirty:true,boundUserId:session?.user?.id||readMeta().boundUserId||null});
    if(!session){status('☁️ כניסה לענן');return;}
    if(!navigator.onLine){status('📴 אופליין • נשמר מקומית','offline');return;}
    clearTimeout(syncTimer);
    syncTimer=setTimeout(()=>pushLocal(false),650);
  }

  function showConflict(remote){
    pendingRemote=remote||pendingRemote;
    if(!pendingRemote)return;
    document.getElementById('modalBody').innerHTML=`
      <h2>⚠️ נמצאו שינויים בשני מכשירים</h2>
      <div class="modal-sub">כדי לא למחוק שינוי בטעות, בחר איזו גרסה לשמור.</div>
      <div class="cloud-info-box">הגרסה בענן עודכנה ממכשיר אחר בזמן שבמכשיר הזה קיימים שינויים שעדיין לא סונכרנו.</div>
      <div class="cloud-panel-actions">
        <button class="primary" onclick="TripCloud.resolveConflict('local')">📱 שמור את הגרסה מהמכשיר הזה</button>
        <button class="secondary" onclick="TripCloud.resolveConflict('cloud')">☁️ טען את הגרסה מהענן</button>
      </div>`;
    openModal();
  }

  async function resolveConflict(choice){
    if(choice==='cloud'){
      try{const row=pendingRemote||await fetchRow(); if(row)applyRemote(row); closeModal();}catch(e){alert('לא הצלחתי לטעון את גרסת הענן.');}
    }else{
      pendingRemote=null; closeModal(); await pushLocal(true);
    }
  }

  function firstBindChoice(remote){
    initialChoicePending=true;
    pendingRemote=remote;
    document.getElementById('modalBody').innerHTML=`
      <h2>☁️ חיבור ראשון לענן</h2>
      <div class="modal-sub">במכשיר הזה כבר קיימים נתונים מקומיים, ובענן קיימת גרסה אחרת.</div>
      <div class="cloud-info-box">בחר איזו גרסה תהפוך לגרסה המשותפת. פעולה זו נדרשת רק בחיבור הראשון של מכשיר שיש בו כבר נתונים.</div>
      <div class="cloud-panel-actions">
        <button class="primary" onclick="TripCloud.finishFirstBind('cloud')">☁️ השתמש בגרסה שבענן</button>
        <button class="secondary" onclick="TripCloud.finishFirstBind('local')">📱 העלה את הנתונים מהמכשיר הזה</button>
      </div>`;
    openModal();
  }
  async function finishFirstBind(choice){
    initialChoicePending=false;
    if(choice==='cloud'){
      if(pendingRemote)applyRemote(pendingRemote);
      closeModal();
    }else{
      writeMeta({boundUserId:session.user.id,lastCloudUpdatedAt:pendingRemote?.updated_at||null,dirty:true});
      pendingRemote=null; closeModal(); await pushLocal(true);
    }
  }

  function subscribeRealtime(){
    if(channel){try{client.removeChannel(channel)}catch(e){}}
    channel=client.channel('usa-trip-'+TRIP_ID+'-'+CLIENT_ID)
      .on('postgres_changes',{
        event:'*',schema:'public',table:'trip_state',filter:'trip_id=eq.'+TRIP_ID
      },payload=>{
        const row=payload.new;
        if(!row||row.updated_by_client===CLIENT_ID)return;
        const meta=readMeta();
        if(meta.dirty){
          pendingRemote=row;
          status('⚠️ שינוי במכשיר אחר','warn');
          return;
        }
        applyRemote(row);
      }).subscribe();
  }

  async function bindCloud(){
    if(!session)return;
    cloudReady=false;
    status('☁️ טוען נתונים…');
    try{
      const remote=await fetchRow();
      const meta=readMeta();
      const localHas=!!meaningful(state);
      const sameBinding=meta.boundUserId===session.user.id;
      if(!remote){
        writeMeta({boundUserId:session.user.id,dirty:true,lastCloudUpdatedAt:null});
        cloudReady=true;
        await pushLocal(true);
      }else if(sameBinding && meta.dirty){
        cloudReady=true;
        if(meta.lastCloudUpdatedAt && remote.updated_at!==meta.lastCloudUpdatedAt && remote.updated_by_client!==CLIENT_ID){
          pendingRemote=remote; showConflict(remote);
        }else{
          await pushLocal(true);
        }
      }else if(!sameBinding && localHas){
        cloudReady=true;
        firstBindChoice(remote);
      }else{
        applyRemote(remote);
        cloudReady=true;
      }
      subscribeRealtime();
    }catch(err){
      console.error(err);
      cloudReady=true;
      status('⚠️ לא ניתן להתחבר לענן','warn');
    }
  }

  async function login(){
    const email=(document.getElementById('cloudEmail')?.value||'').trim();
    const password=document.getElementById('cloudPassword')?.value||'';
    if(!email||!password)return alert('יש למלא אימייל וסיסמה.');
    status('☁️ מתחבר…');
    const {error}=await client.auth.signInWithPassword({email,password});
    if(error){status('⚠️ כניסה נכשלה','warn');return alert('הכניסה נכשלה: '+error.message);}
    closeModal();
  }
  async function logout(){
    if(client)await client.auth.signOut();
    session=null; cloudReady=false;
    if(channel){try{client.removeChannel(channel)}catch(e){} channel=null;}
    status('☁️ כניסה לענן'); closeModal();
  }

  function openPanel(){
    if(!configured()){
      document.getElementById('modalBody').innerHTML=`
        <h2>☁️ הגדרת Supabase</h2>
        <div class="modal-sub">האפליקציה מוכנה לענן, אבל עדיין לא הוזנו פרטי הפרויקט.</div>
        <div class="cloud-info-box">פתח את <b>config.js</b> והדבק את Project URL ואת Publishable Key של Supabase. אין להכניס Secret או service_role.</div>`;
      return openModal();
    }
    if(!session){
      document.getElementById('modalBody').innerHTML=`
        <h2>☁️ כניסה לטיול המשפחתי</h2>
        <div class="modal-sub">היכנסו עם החשבון המשפחתי של Supabase. ההתחברות נשמרת במכשיר.</div>
        <div class="cloud-login-grid">
          <input id="cloudEmail" type="email" autocomplete="username" placeholder="אימייל">
          <input id="cloudPassword" type="password" autocomplete="current-password" placeholder="סיסמה" onkeydown="if(event.key==='Enter')TripCloud.login()">
        </div>
        <div class="cloud-panel-actions"><button class="primary" onclick="TripCloud.login()">התחבר</button></div>`;
      return openModal();
    }
    const meta=readMeta();
    const when=meta.lastSyncAt?new Date(meta.lastSyncAt).toLocaleString('he-IL'):'עדיין לא';
    document.getElementById('modalBody').innerHTML=`
      <h2>☁️ סנכרון משפחתי</h2>
      <div class="cloud-info-box">
        <div><b>משתמש:</b> ${String(session.user.email||'').replace(/[&<>]/g,'')}</div>
        <div><b>טיול:</b> ${TRIP_ID}</div>
        <div><b>סנכרון אחרון:</b> ${when}</div>
        <div><b>מצב:</b> ${navigator.onLine?(meta.dirty?'<span class="cloud-sync-warn">ממתינים לסנכרון</span>':'<span class="cloud-sync-good">מסונכרן</span>'):'Offline — השינויים נשמרים במכשיר'}</div>
      </div>
      <div class="cloud-panel-actions">
        <button class="primary" onclick="TripCloud.syncNow()">↻ סנכרן עכשיו</button>
        <button class="secondary" onclick="TripCloud.exportBackup()">💾 הורד גיבוי JSON</button>
        <button class="secondary" onclick="TripCloud.logout()">יציאה מהחשבון</button>
      </div>`;
    openModal();
  }

  function exportBackup(){
    const payload={tripId:TRIP_ID,exportedAt:new Date().toISOString(),state:cloneState()};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='USA_Trip_2026_backup_'+new Date().toISOString().slice(0,10)+'.json';a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }


  function isSignedIn(){return !!(client&&session?.user?.id);}

  async function resizeImageForUpload(file){
    if(!file || !String(file.type||'').startsWith('image/'))throw new Error('יש לבחור קובץ תמונה.');
    const dataUrl=await new Promise((resolve,reject)=>{
      const fr=new FileReader();
      fr.onload=()=>resolve(fr.result);
      fr.onerror=reject;
      fr.readAsDataURL(file);
    });
    const img=await new Promise((resolve,reject)=>{
      const im=new Image();
      im.onload=()=>resolve(im);
      im.onerror=reject;
      im.src=dataUrl;
    });
    const MAX_W=1600,MAX_H=1100;
    const scale=Math.min(1,MAX_W/img.naturalWidth,MAX_H/img.naturalHeight);
    const w=Math.max(1,Math.round(img.naturalWidth*scale));
    const h=Math.max(1,Math.round(img.naturalHeight*scale));
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#ffffff';ctx.fillRect(0,0,w,h);
    ctx.drawImage(img,0,0,w,h);
    const blob=await new Promise((resolve,reject)=>{
      canvas.toBlob(b=>b?resolve(b):reject(new Error('לא ניתן לעבד את התמונה.')),'image/jpeg',0.84);
    });
    if(blob.size>5*1024*1024)throw new Error('התמונה עדיין גדולה מדי לאחר הכיווץ.');
    return blob;
  }

  async function uploadDayImage(date,file){
    if(!isSignedIn())throw new Error('יש להתחבר לענן לפני העלאת תמונה.');
    if(!navigator.onLine)throw new Error('העלאת תמונה דורשת חיבור לאינטרנט.');
    const blob=await resizeImageForUpload(file);
    const safeDate=String(date||'day').replace(/[^0-9A-Za-z_-]/g,'_');
    const path=`${session.user.id}/${TRIP_ID}/${safeDate}.jpg`;
    const {error}=await client.storage.from('trip-images').upload(path,blob,{
      contentType:'image/jpeg',upsert:true,cacheControl:'3600'
    });
    if(error)throw error;
    const {data}=client.storage.from('trip-images').getPublicUrl(path);
    if(!data?.publicUrl)throw new Error('לא התקבלה כתובת ציבורית לתמונה.');
    return `${data.publicUrl}?v=${Date.now()}`;
  }

  async function init(){
    if('serviceWorker' in navigator){
      window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(e=>console.warn('SW',e)));
    }
    if(!configured()){
      status('☁️ דרושה הגדרת Supabase','warn');
      return;
    }
    if(!window.supabase || !window.supabase.createClient){
      status('⚠️ ספריית Supabase לא נטענה','warn');
      return;
    }
    client=window.supabase.createClient(CFG.supabaseUrl,CFG.supabasePublishableKey,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
    });
    const {data}=await client.auth.getSession();
    session=data.session;
    if(session){await bindCloud();}else{status('☁️ כניסה לענן');}
    client.auth.onAuthStateChange(async(event,newSession)=>{
      const oldId=session?.user?.id||null, newId=newSession?.user?.id||null;
      session=newSession;
      if(newId && newId!==oldId){await bindCloud();}
      if(!newId){status('☁️ כניסה לענן');}
    });
  }

  window.addEventListener('online',()=>{
    if(session){status('☁️ חזר החיבור'); if(readMeta().dirty)pushLocal(false); else bindCloud();}
  });
  window.addEventListener('offline',()=>status('📴 אופליין • נשמר מקומית','offline'));

  window.TripCloud={
    onLocalSave:queueSync,
    openPanel,login,logout,
    syncNow:()=>pushLocal(false),
    resolveConflict,finishFirstBind,exportBackup,
    isSignedIn,uploadDayImage
  };
  init();
})();
