(function(){
  function ready(fn){ if(document.readyState!=='loading'){ fn(); } else { document.addEventListener('DOMContentLoaded', fn); } }
  function $(id){ return document.getElementById(id); }

  ready(function(){
    const state = { rows: [] };
    const logEl = $("log");
    function log(){ if(logEl){ const msg = Array.from(arguments).join(" "); logEl.textContent += msg + "\n"; } console.log.apply(console, arguments); }
    function setStatus(s){ const el=$("status"); if(el){ el.textContent = s; } log(s); }

    function headers(){
      const keyEl=$("apiKey"), pubEl=$("pubKey");
      const h = { "X-Tycoon-Key": (keyEl?.value||"").trim() };
      const p = (pubEl?.value||"").trim();
      if (p) h["X-Tycoon-Public-Key"] = p;
      return h;
    }

    async function fetchJSON(url, opts){
      log("GET", url);
      const res = await fetch(url, opts);
      log("...status", res.status);
      if(!res.ok) throw new Error(res.status+" "+res.statusText);
      return res.json();
    }

    function parsePlayersFromWidget(json){
      const out = [];
      const dig = (obj)=>{
        if(!obj) return;
        if(Array.isArray(obj)){
          obj.forEach(p=>{
            const id = p.id || p.vrp || p.vRP || p.vrp_id || p.netId;
            if(id!=null) out.push({id:String(id), name: p.name || p.playerName || p.PlayerName || "Unknown"});
          });
          return;
        }
        if(Array.isArray(obj.players)){
          obj.players.forEach(p=>{
            const id = p.id || p.vrp || p.vRP || p.vrp_id || p.netId;
            if(id!=null) out.push({id:String(id), name: p.name || p.playerName || p.PlayerName || "Unknown"});
          });
          return;
        }
        if(typeof obj==="object"){
          Object.values(obj).forEach(v=>dig(v));
        }
      };
      dig(json);
      return out;
    }

    function render(){
      const tbody = $("table")?.querySelector("tbody");
      if(!tbody) return;
      const filterEl = $("filter");
      const t = (filterEl?.value||"").toLowerCase();
      const rows = state.rows
        .filter(r => !t || (r.name||"").toLowerCase().includes(t) || (r.id||"").includes(t))
        .sort((a,b)=>(b.streak??-1)-(a.streak??-1));
      const countEl = $("count");
      if(countEl) countEl.textContent = rows.length+" players";
      tbody.innerHTML = rows.map((r,i)=>`<tr>
        <td>${i+1}</td>
        <td class="mono">${r.id}</td>
        <td>${r.name||""}</td>
        <td><b>${r.streak ?? "—"}</b></td>
        <td class="muted">${r.locked?"locked":(r.error||"")}</td>
        <td class="muted mono">${r.serverHint||""}</td>
      </tr>`).join("");
    }

    async function build(){
      try{
        const keyEl = $("apiKey");
        if(!keyEl || !keyEl.value.trim()){ alert("Enter your Private API key"); return; }
        localStorage.setItem("tt_key", keyEl.value.trim());
        const pubEl = $("pubKey");
        if(pubEl) localStorage.setItem("tt_pub", (pubEl.value||"").trim());

        setStatus("Discovering servers…");
        const getVal = (id, dflt)=> ( $(id)?.value || dflt ).trim();
        const base = getVal("apiBase","https://v1.api.tycoon.community");
        const path = getVal("streakPath","/main/streak/{vrpId}");
        const serversJson = getVal("serversJson","https://cdn.tycoon.community/servers.json");
        const proxy = getVal("proxyUrl","");
        const limit = parseInt(getVal("limit","50"),10);
        const minS = parseInt(getVal("minStreak","0"),10);
        const maxS = parseInt(getVal("maxStreak","999999999"),10);

        const srvUrl = proxy ? proxy + "/servers.json" : serversJson;
        const servers = await fetchJSON(srvUrl);
        const list = Array.isArray(servers?.servers) ? servers.servers : Array.isArray(servers) ? servers : [];
        const widgetUrls = [];
        list.forEach(s=>{
          const p = s?.endpoints?.players || s?.players || s?.widget || s?.player_widget;
          if(typeof p === "string") widgetUrls.push(p);
        });
        const seen = new Map();
        for(const w of widgetUrls){
          try{
            const url = proxy ? proxy + "/widget/" + w.replace(/^https?:\/\//,'') : w;
            const json = await fetchJSON(url);
            const players = parsePlayersFromWidget(json);
            players.forEach(p=>{ if(!seen.has(p.id)) seen.set(p.id, {...p, serverHint: w}); });
          }catch(e){ log("widget fail", w, e.message); }
        }
        const all = Array.from(seen.values()).slice(0, limit);
        if(all.length===0){ setStatus("No players discovered."); state.rows=[]; render(); return; }

        setStatus("Querying streaks for "+all.length+" players…");
        const out = [];
        for(const p of all){
          const url = (proxy? proxy: base) + path.replace("{vrpId}", encodeURIComponent(p.id));
          try{
            const data = await fetchJSON(url, { headers: headers() });
            if(data && data.error === "locked"){
              out.push({...p, streak:null, locked:true});
            } else {
              const s = data?.streak ?? data?.rts?.streak ?? data?.value ?? null;
              if(s!=null && s>=minS && s<=maxS){
                out.push({...p, streak:s});
              } else if(s==null){
                out.push({...p, streak:null});
              }
            }
          }catch(e){
            const msg = String(e.message||"error");
            if(/CORS|cors|blocked|Access-Control/i.test(msg)){
              setStatus("CORS blocked. Set a proxy URL (see Advanced).");
              out.push({...p, streak:null, error:"CORS"});
            } else {
              out.push({...p, streak:null, error:msg});
            }
          }
        }
        state.rows = out;
        render();
        setStatus("Done.");
      }catch(err){
        setStatus("Error: "+err.message);
        log("Error", err);
      }
    }

    // Wire up safely with NULL guards
    const keyEl = $("apiKey"); if(keyEl){ keyEl.value = localStorage.getItem("tt_key")||""; }
    const pubEl = $("pubKey"); if(pubEl){ pubEl.value = localStorage.getItem("tt_pub")||""; }
    const refreshBtn = $("refreshBtn"); if(refreshBtn){ refreshBtn.addEventListener("click", build); }
    const testBtn = $("testBtn"); if(testBtn){ testBtn.addEventListener("click", ()=> setStatus("Button works ✔")); }
    const filterEl = $("filter"); if(filterEl){ filterEl.addEventListener("input", render); }
  });
})();