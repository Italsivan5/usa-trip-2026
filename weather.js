/* USA Trip 2026 — V12 Weather layer
   Free non-commercial forecast via Open-Meteo. No API key required.
   The last successful forecast is cached locally for offline viewing.
*/
(function(){
  'use strict';

  const CACHE_KEY='usa2026_weather_cache_v1';
  const CACHE_TTL=3*60*60*1000; // refresh at most every 3 hours
  const MAX_FORECAST_AHEAD_DAYS=15; // today + 15 = up to 16 forecast days
  const inflight={};

  const WEATHER_NAMES=[
    'JFK / Garden City',
    'Edison',
    'Newtown',
    'New Hope / Lambertville',
    'Atlantic City',
    'Cape May',
    'Washington DC',
    'Washington DC',
    'Washington DC',
    'Hershey',
    'Corning',
    'Watkins Glen',
    'Niagara Falls',
    'Niagara Falls',
    'Schenectady',
    'The Big E • West Springfield',
    'Newport',
    'Mystic',
    'New Haven',
    'New York City',
    'New York City',
    'New York City',
    'New York City',
    'EWR / Newark',
    'Frankfurt'
  ];

  function readCache(){
    try{return JSON.parse(localStorage.getItem(CACHE_KEY)||'{}')}catch(e){return {}}
  }
  function writeCache(cache){
    try{localStorage.setItem(CACHE_KEY,JSON.stringify(cache))}catch(e){}
  }
  function localYMD(date=new Date()){
    const y=date.getFullYear();
    const m=String(date.getMonth()+1).padStart(2,'0');
    const d=String(date.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  }
  function dateAtNoon(ymd){
    const [y,m,d]=ymd.split('-').map(Number);
    return new Date(y,m-1,d,12,0,0,0);
  }
  function dayDiff(fromYmd,toYmd){
    return Math.round((dateAtNoon(toYmd)-dateAtNoon(fromYmd))/86400000);
  }
  function condition(code){
    code=Number(code);
    if(code===0)return ['☀️','בהיר'];
    if(code===1)return ['🌤️','בהיר ברובו'];
    if(code===2)return ['⛅','מעונן חלקית'];
    if(code===3)return ['☁️','מעונן'];
    if(code===45||code===48)return ['🌫️','ערפל'];
    if([51,53,55].includes(code))return ['🌦️','טפטוף'];
    if([56,57].includes(code))return ['🌧️','טפטוף קופא'];
    if([61,63,65].includes(code))return ['🌧️','גשם'];
    if([66,67].includes(code))return ['🌧️','גשם קופא'];
    if([71,73,75,77].includes(code))return ['🌨️','שלג'];
    if([80,81,82].includes(code))return ['🌦️','ממטרים'];
    if([85,86].includes(code))return ['🌨️','ממטרי שלג'];
    if([95,96,99].includes(code))return ['⛈️','סופות רעמים'];
    return ['🌦️','מזג אוויר'];
  }
  function targetForDate(date){
    const i=DAYS.findIndex(d=>d.date===date);
    if(i<0 || !DAY_VISUALS[i])return null;
    return {
      index:i,
      name:WEATHER_NAMES[i] || DAYS[i].title,
      lat:DAY_VISUALS[i].lat,
      lon:DAY_VISUALS[i].lon
    };
  }
  function formatUpdated(ts){
    try{
      return new Intl.DateTimeFormat('he-IL',{hour:'2-digit',minute:'2-digit'}).format(new Date(ts));
    }catch(e){return ''}
  }
  function isFresh(entry){
    return entry && entry.fetchedAt && Date.now()-entry.fetchedAt<CACHE_TTL;
  }
  function usableCached(entry){
    return !!(entry && Number.isFinite(Number(entry.max)) && Number.isFinite(Number(entry.min)));
  }
  function waitingResult(date,target){
    return {state:'waiting',date,name:target?.name||'',message:'התחזית תופיע אוטומטית כשנתקרב לטווח התחזית.'};
  }

  async function fetchWeather(date,force=false){
    const target=targetForDate(date);
    if(!target)return {state:'error',message:'לא הוגדר יעד מזג אוויר ליום זה.'};

    const cache=readCache();
    const cached=cache[date];
    const diff=dayDiff(localYMD(),date);

    // For past/out-of-range dates, keep showing the last forecast if one was cached.
    if(diff<0){
      if(usableCached(cached))return Object.assign({state:'cached',offline:!navigator.onLine},cached);
      return {state:'past',name:target.name,message:'היום כבר עבר; אין תחזית עדכנית להצגה.'};
    }
    if(diff>MAX_FORECAST_AHEAD_DAYS){
      if(usableCached(cached))return Object.assign({state:'cached',offline:!navigator.onLine},cached);
      return waitingResult(date,target);
    }
    if(!navigator.onLine){
      if(usableCached(cached))return Object.assign({state:'cached',offline:true},cached);
      return {state:'offline',name:target.name,message:'אין חיבור כרגע. התחזית תיטען כשיחזור האינטרנט.'};
    }
    if(!force && isFresh(cached)){
      return Object.assign({state:'ok',fromCache:true},cached);
    }
    if(inflight[date])return inflight[date];

    const url='https://api.open-meteo.com/v1/forecast'
      +`?latitude=${encodeURIComponent(target.lat)}`
      +`&longitude=${encodeURIComponent(target.lon)}`
      +'&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max'
      +'&temperature_unit=celsius&wind_speed_unit=kmh&timezone=auto&forecast_days=16';

    inflight[date]=(async()=>{
      try{
        const res=await fetch(url,{cache:'no-store'});
        if(!res.ok)throw new Error('Weather HTTP '+res.status);
        const json=await res.json();
        const times=json?.daily?.time||[];
        const p=times.indexOf(date);
        if(p<0)return waitingResult(date,target);

        const entry={
          date,
          name:target.name,
          code:Number(json.daily.weather_code?.[p]),
          max:Math.round(Number(json.daily.temperature_2m_max?.[p])),
          min:Math.round(Number(json.daily.temperature_2m_min?.[p])),
          rain:Math.round(Number(json.daily.precipitation_probability_max?.[p] ?? 0)),
          wind:Math.round(Number(json.daily.wind_speed_10m_max?.[p] ?? 0)),
          fetchedAt:Date.now()
        };
        cache[date]=entry;
        writeCache(cache);
        return Object.assign({state:'ok'},entry);
      }catch(e){
        console.warn('Weather fetch failed',e);
        if(usableCached(cached))return Object.assign({state:'cached',offline:true},cached);
        return {state:'error',name:target.name,message:'לא ניתן לטעון כרגע את התחזית.'};
      }finally{
        delete inflight[date];
      }
    })();

    return inflight[date];
  }

  function miniHtml(w){
    if(w.state==='waiting')return `<span class="weather-mini waiting">🌦️ התחזית תופיע כשנתקרב</span>`;
    if(w.state==='past')return `<span class="weather-mini waiting">🗓️ יום שעבר</span>`;
    if(w.state==='offline')return `<span class="weather-mini waiting">📴 תחזית לא זמינה אופליין</span>`;
    if(w.state==='error')return `<span class="weather-mini error">⚠️ מזג האוויר לא נטען</span>`;
    const [icon,label]=condition(w.code);
    const cacheFlag=w.state==='cached'&&w.offline?' • 📴 שמור':'';
    return `<span class="weather-mini">${icon} ${Math.round(w.max)}°/${Math.round(w.min)}° • 🌧️ ${Math.round(w.rain)}%${cacheFlag} <small>· Open‑Meteo</small></span>`;
  }

  function panelHtml(w){
    if(['waiting','past','offline','error'].includes(w.state)){
      const msg=w.message||'התחזית אינה זמינה כרגע.';
      return `<div class="weather-panel-main"><div class="weather-panel-icon">${w.state==='offline'?'📴':'🌦️'}</div><div><div class="weather-panel-title">${w.name||'מזג אוויר'}</div><div>${msg}</div></div></div><div class="weather-panel-foot">Weather data: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open‑Meteo</a></div>`;
    }
    const [icon,label]=condition(w.code);
    const updated=formatUpdated(w.fetchedAt);
    const cacheText=w.state==='cached'&&w.offline?' • <span class="weather-offline">מוצגת התחזית האחרונה שנשמרה</span>':'';
    return `<div class="weather-panel-main">
      <div class="weather-panel-icon">${icon}</div>
      <div><div class="weather-panel-title">${w.name} • ${label}</div>
      <div class="weather-panel-stats">
        <span class="weather-stat">🌡️ ${Math.round(w.max)}° / ${Math.round(w.min)}°</span>
        <span class="weather-stat">🌧️ סיכוי לגשם ${Math.round(w.rain)}%</span>
        <span class="weather-stat">💨 עד ${Math.round(w.wind)} קמ״ש</span>
      </div></div>
    </div>
    <div class="weather-panel-foot">עודכן ${updated}${cacheText} • Weather data: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open‑Meteo</a></div>`;
  }

  async function hydrateCards(){
    const nodes=[...document.querySelectorAll('[data-weather-card-date]')];
    await Promise.all(nodes.map(async el=>{
      const date=el.dataset.weatherCardDate;
      const w=await fetchWeather(date);
      if(document.body.contains(el))el.innerHTML=miniHtml(w);
    }));
  }

  async function hydrateDay(date){
    const nodes=[...document.querySelectorAll(`[data-weather-day-date="${date}"]`)];
    if(!nodes.length)return;
    const w=await fetchWeather(date);
    nodes.forEach(el=>{if(document.body.contains(el))el.innerHTML=panelHtml(w)});
  }

  function init(){
    hydrateCards();
    window.addEventListener('online',()=>{
      document.querySelectorAll('[data-weather-card-date]').forEach(el=>{});
      hydrateCards();
      const open=document.querySelector('[data-weather-day-date]');
      if(open)hydrateDay(open.dataset.weatherDayDate);
    });
  }

  window.TripWeather={init,hydrateCards,hydrateDay,refresh:(date)=>fetchWeather(date,true)};
  init();
})();
