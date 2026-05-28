import { useState, useEffect, useCallback, useRef } from "react";

// ─── Storage ──────────────────────────────────────────────────────────────────
// Data is ALWAYS saved to localStorage immediately (so reload never loses data)
// Google Sheets is synced in the background as a backup + multi-device share
const local = {
  get: async (k) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
  set: async (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ─── Google Sheets API (via Vercel proxy — no CORS issues) ───────────────────
const gsheet = {
  async call(scriptUrl, action, extras = {}) {
    try {
      const res = await fetch("/api/sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptUrl, action, ...extras }),
      });
      return await res.json();
    } catch (e) {
      return { ok: false, error: e.toString() };
    }
  },
  ping:      (url)       => gsheet.call(url, "ping"),
  verifyPin: (url, pin)  => gsheet.call(url, "verifyPin", { pin }),
  read:      (url)       => gsheet.call(url, "read"),
  write:     (url, data) => gsheet.call(url, "write", { data: typeof data === "object" ? JSON.stringify(data) : data }),
};

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const todayStr = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d) => { try { return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); } catch { return d; } };
const fmtCur = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");

const EMPTY = { workers: [], clients: [], suppliers: [], lenders: [], orders: [], pieceLog: [], ledgerEntries: [], activity: [] };
const STAGES = ["Cutting", "Stitching", "Finishing", "Folding", "Quality Check"];
const STAGE_OF_ROLE = { "Cutting Master": "Cutting", "Cutter": "Cutting", "Tailor": "Stitching", "Stitcher": "Stitching", "Finisher": "Finishing", "Embroiderer": "Finishing", "Folder": "Folding", "Packer": "Folding", "QC Inspector": "Quality Check", "Checker": "Quality Check" };
const ALL_ROLES = ["Cutting Master","Cutter","Tailor","Stitcher","Finisher","Embroiderer","Folder","Packer","QC Inspector","Checker","Supervisor","Helper"];

const C = {
  navy:"#1B3A6B", navyDark:"#112447", navyLight:"#EEF2F9",
  gold:"#C8962A", goldDark:"#9E7520", goldLight:"#FDF6E8",
  red:"#CC2200", teal:"#006E6E", tealLight:"#E0F4F4",
  green:"#1A6E3C", greenLight:"#E8F5EE",
  bg:"#F2F5FB", card:"#FFFFFF", border:"#DDE3EF", muted:"#6B7A99", text:"#1A1A1A",
};

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Source+Sans+3:wght@400;500;600;700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
html,body{height:100%;background:${C.bg};font-family:'Source Sans 3',sans-serif;color:${C.text};-webkit-font-smoothing:antialiased;}
::-webkit-scrollbar{width:3px;}::-webkit-scrollbar-thumb{background:${C.border};}
.app{max-width:480px;margin:0 auto;min-height:100vh;display:flex;flex-direction:column;}
.hdr{background:${C.navy};color:white;position:sticky;top:0;z-index:60;box-shadow:0 2px 16px rgba(17,36,71,.35);}
.hdr-inner{display:flex;align-items:center;gap:11px;padding:12px 16px 10px;}
.hdr-logo{width:38px;height:38px;background:white;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.hdr-title{font-family:'Playfair Display',serif;font-size:18px;font-weight:900;line-height:1.1;}
.hdr-sub{font-size:10px;color:rgba(255,255,255,.5);letter-spacing:.9px;text-transform:uppercase;margin-top:1px;}
.hdr-right{margin-left:auto;display:flex;align-items:center;gap:8px;}
.hdr-date{font-size:11px;color:rgba(255,255,255,.5);text-align:right;line-height:1.5;}
.hdr-stripe{height:3.5px;background:linear-gradient(90deg,#CC2200 0%,#E05A00 18%,#C8962A 36%,#4A90D9 54%,#006E6E 72%,#1A1A1A 100%);}
.sync-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
@keyframes pulse{0%,100%{opacity:1;}50%{opacity:.4;}}
.sync-ing{animation:pulse 1s infinite;}
.bnav{position:sticky;bottom:0;background:white;border-top:2px solid ${C.border};display:flex;z-index:60;box-shadow:0 -3px 16px rgba(17,36,71,.08);}
.nb{flex:1;padding:9px 2px 7px;border:none;background:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;font-family:'Source Sans 3',sans-serif;font-size:10px;font-weight:700;color:${C.muted};transition:color .15s;}
.nb.on{color:${C.navy};}
.nb-icon{font-size:20px;line-height:1;}
.nb-dot{width:3px;height:3px;border-radius:50%;background:${C.gold};visibility:hidden;}
.nb.on .nb-dot{visibility:visible;}
.page{flex:1;padding:16px;overflow-y:auto;animation:fadeUp .2s ease;}
@keyframes fadeUp{from{opacity:0;transform:translateY(7px);}to{opacity:1;transform:translateY(0);}}
.pg-title{font-family:'Playfair Display',serif;font-size:24px;font-weight:900;color:${C.navy};}
.pg-sub{font-size:13px;color:${C.muted};margin-top:2px;}
.pg-head{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px;}
.sec-lbl{font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${C.muted};margin:14px 0 7px;}
.card-lbl{font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:${C.muted};margin-bottom:10px;}
.card{background:${C.card};border:1.5px solid ${C.border};border-radius:12px;padding:14px 16px;margin-bottom:10px;box-shadow:0 1px 4px rgba(17,36,71,.05);}
.card-sm{background:${C.card};border:1.5px solid ${C.border};border-radius:10px;padding:12px 14px;margin-bottom:8px;}
.stat-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;}
.stat{background:${C.card};border:1.5px solid ${C.border};border-radius:12px;padding:14px 12px;position:relative;overflow:hidden;}
.stat::before{content:'';position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--c);}
.stat-val{font-family:'Playfair Display',serif;font-size:26px;font-weight:900;line-height:1;color:${C.navy};}
.stat-lbl{font-size:11px;color:${C.muted};margin-top:4px;font-weight:600;}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:none;cursor:pointer;font-family:'Source Sans 3',sans-serif;font-weight:700;border-radius:9px;transition:all .15s;}
.btn-sm{padding:8px 16px;font-size:13px;border-radius:8px;}
.btn-xs{padding:5px 11px;font-size:12px;border-radius:6px;}
.btn-navy{background:${C.navy};color:white;}.btn-navy:hover{background:${C.navyDark};}
.btn-outline{background:white;color:${C.navy};border:1.5px solid ${C.navy};}
.btn-ghost{background:${C.bg};color:${C.text};border:1.5px solid ${C.border};}
.btn-green{background:${C.green};color:white;}
.btn-red{background:${C.red};color:white;}
.field{margin-bottom:13px;}
.lbl{display:block;font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:${C.muted};margin-bottom:5px;}
.inp{width:100%;padding:10px 13px;border:1.5px solid ${C.border};border-radius:8px;font-family:'Source Sans 3',sans-serif;font-size:14px;color:${C.text};background:white;outline:none;transition:border-color .15s;}
.inp:focus{border-color:${C.navy};}
select.inp{appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='7'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%236B7A99' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center;padding-right:32px;}
.pill{display:inline-flex;align-items:center;padding:3px 9px;border-radius:20px;font-size:11px;font-weight:700;}
.p-navy{background:${C.navyLight};color:${C.navy};}.p-gold{background:${C.goldLight};color:${C.goldDark};}.p-green{background:${C.greenLight};color:${C.green};}.p-red{background:#FDECEA;color:${C.red};}.p-gray{background:#F0F0F5;color:#666;}.p-teal{background:${C.tealLight};color:${C.teal};}
.row{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid ${C.border};}.row:last-child{border-bottom:none;}
.av{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0;}
.av-navy{background:${C.navyLight};color:${C.navy};}.av-gold{background:${C.goldLight};color:${C.goldDark};}.av-green{background:${C.greenLight};color:${C.green};}.av-red{background:#FDECEA;color:${C.red};}.av-teal{background:${C.tealLight};color:${C.teal};}
.overlay{position:fixed;inset:0;background:rgba(17,36,71,.6);z-index:100;display:flex;align-items:flex-end;justify-content:center;animation:fIn .18s ease;}
@keyframes fIn{from{opacity:0;}to{opacity:1;}}
.modal{background:${C.bg};border-radius:20px 20px 0 0;width:100%;max-width:480px;padding:6px 18px 40px;max-height:92vh;overflow-y:auto;animation:sUp .22s ease;}
@keyframes sUp{from{transform:translateY(30px);opacity:0;}to{transform:translateY(0);opacity:1;}}
.modal-handle{width:36px;height:4px;background:${C.border};border-radius:2px;margin:10px auto 14px;}
.modal-title{font-family:'Playfair Display',serif;font-size:20px;font-weight:700;color:${C.navy};margin-bottom:16px;}
.tabs{display:flex;background:white;border:1.5px solid ${C.border};border-radius:10px;padding:3px;margin-bottom:14px;gap:3px;}
.tab{flex:1;padding:8px 4px;border:none;background:none;border-radius:7px;font-family:'Source Sans 3',sans-serif;font-size:11px;font-weight:700;color:${C.muted};cursor:pointer;transition:all .15s;text-align:center;}
.tab.on{background:${C.navy};color:white;}
.sr{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px dashed ${C.border};}.sr:last-child{border-bottom:none;}
.sr-k{font-size:13px;color:${C.muted};}.sr-v{font-size:13px;font-weight:700;}
.act{display:flex;gap:10px;padding:9px 0;border-bottom:1px solid ${C.border};}.act:last-child{border-bottom:none;}
.act-dot{width:7px;height:7px;border-radius:50%;background:${C.gold};margin-top:5px;flex-shrink:0;}
.act-txt{font-size:13px;line-height:1.5;}.act-date{font-size:11px;color:${C.muted};}
.amt-in{color:${C.green};}.amt-out{color:${C.red};}
.prog{background:${C.border};border-radius:4px;height:6px;overflow:hidden;margin-top:6px;}
.prog-fill{height:100%;border-radius:4px;background:${C.navy};transition:width .5s ease;}
.empty{text-align:center;padding:40px 20px;color:${C.muted};}
.empty-icon{font-size:40px;margin-bottom:10px;}.empty-txt{font-size:14px;line-height:1.7;}
.ibox{border-radius:9px;padding:10px 13px;font-size:13px;margin-bottom:12px;}
.i-navy{background:${C.navyLight};color:${C.navy};}.i-green{background:${C.greenLight};color:${C.green};}.i-gold{background:${C.goldLight};color:${C.goldDark};}.i-red{background:#FDECEA;color:${C.red};}
.pin-screen{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:${C.navy};padding:32px 24px;}
.pin-logo{width:72px;height:72px;background:white;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:16px;}
.pin-title{font-family:'Playfair Display',serif;font-size:26px;font-weight:900;color:white;margin-bottom:4px;}
.pin-sub{font-size:13px;color:rgba(255,255,255,.55);margin-bottom:32px;}
.pin-dots{display:flex;gap:14px;margin-bottom:28px;}
.pin-dot{width:16px;height:16px;border-radius:50%;border:2px solid rgba(255,255,255,.4);transition:all .2s;}
.pin-dot.filled{background:${C.gold};border-color:${C.gold};}
.pin-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;width:100%;max-width:280px;}
.pin-btn{padding:18px;border:none;background:rgba(255,255,255,.1);color:white;font-family:'Source Sans 3',sans-serif;font-size:22px;font-weight:700;border-radius:12px;cursor:pointer;transition:all .15s;}
.pin-btn:hover{background:rgba(255,255,255,.2);}
.pin-err{color:#ff6b6b;font-size:13px;margin-top:12px;font-weight:600;}
`;

function LionsLogo({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="42" r="30" fill="#1B3A8C"/>
      <circle cx="50" cy="42" r="30" fill="none" stroke="#C8962A" strokeWidth="4"/>
      <text x="50" y="52" textAnchor="middle" fill="#C8962A" fontSize="26" fontWeight="bold" fontFamily="Georgia,serif">L</text>
      <text x="50" y="28" textAnchor="middle" fill="white" fontSize="8" fontWeight="bold" fontFamily="Arial,sans-serif" letterSpacing="2">LIONS</text>
      <text x="50" y="62" textAnchor="middle" fill="white" fontSize="5.5" fontWeight="bold" fontFamily="Arial,sans-serif" letterSpacing="0.5">INTERNATIONAL</text>
      {[[-24,"#CC2200"],[-14,"#E05A00"],[-4,"#C8962A"],[6,"#1B3A8C"],[16,"#4A90D9"],[26,"#006E6E"]].map(([x,col],i)=>(
        <rect key={i} x={x} y="78" width="9" height="14" rx="4" fill={col} transform={`rotate(${-15+i*6} 50 100)`}/>
      ))}
    </svg>
  );
}

function Loader({ msg="Loading…" }) {
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",flexDirection:"column",gap:16,background:C.navy}}>
      <div style={{width:60,height:60,background:"white",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center"}}><LionsLogo size={44}/></div>
      <div style={{color:"rgba(255,255,255,.6)",fontSize:14}}>{msg}</div>
    </div>
  );
}

function SetupScreen({ onSave }) {
  const [url,setUrl]=useState("");
  const [st,setSt]=useState("idle");
  const test=async()=>{
    if(!url.trim()) return;
    setSt("testing");
    const res=await gsheet.ping(url.trim());
    setSt(res.ok?"ok":"err");
    if(res.ok) setTimeout(()=>onSave(url.trim()),700);
  };
  return(
    <div style={{minHeight:"100vh",background:C.navy,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"32px 24px"}}>
      <div style={{width:64,height:64,background:"white",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:16}}><LionsLogo size={48}/></div>
      <div style={{fontFamily:"'Playfair Display',serif",fontSize:24,fontWeight:900,color:"white",marginBottom:6}}>Sui Dhaga</div>
      <div style={{fontSize:13,color:"rgba(255,255,255,.55)",marginBottom:32,textAlign:"center",lineHeight:1.6}}>Paste your Google Apps Script URL below.</div>
      <div style={{width:"100%",maxWidth:400}}>
        <div style={{fontSize:11,color:"rgba(255,255,255,.6)",fontWeight:700,letterSpacing:.5,marginBottom:6,textTransform:"uppercase"}}>Apps Script Web App URL</div>
        <input style={{width:"100%",padding:"12px 14px",borderRadius:10,border:"1.5px solid rgba(255,255,255,.2)",background:"rgba(255,255,255,.1)",color:"white",fontFamily:"'Source Sans 3',sans-serif",fontSize:13,outline:"none",marginBottom:12}} placeholder="https://script.google.com/macros/s/..." value={url} onChange={e=>{setUrl(e.target.value);setSt("idle");}}/>
        <button style={{width:"100%",padding:"13px",background:C.gold,color:"white",border:"none",borderRadius:10,fontFamily:"'Source Sans 3',sans-serif",fontSize:15,fontWeight:700,cursor:"pointer"}} onClick={test}>{st==="testing"?"Testing…":"Connect & Continue"}</button>
        {st==="ok"&&<div style={{color:"#4CAF50",fontSize:13,fontWeight:600,marginTop:10,textAlign:"center"}}>✅ Connected! Loading…</div>}
        {st==="err"&&<div style={{color:"#ff6b6b",fontSize:13,fontWeight:600,marginTop:10,textAlign:"center"}}>❌ Could not connect. Check the URL.</div>}
      </div>
    </div>
  );
}

function PinScreen({ scriptUrl, onSuccess }) {
  const [pin,setPin]=useState("");
  const [err,setErr]=useState("");
  const [busy,setBusy]=useState(false);
  const press=async(v)=>{
    if(v==="del"){setPin(p=>p.slice(0,-1));setErr("");return;}
    const next=pin+v;setPin(next);setErr("");
    if(next.length===4){
      setBusy(true);
      const res=await gsheet.verifyPin(scriptUrl,next);
      if(res.ok) onSuccess(res.role);
      else{setErr("Wrong PIN. Try again.");setPin("");}
      setBusy(false);
    }
  };
  return(
    <div className="pin-screen">
      <div className="pin-logo"><LionsLogo size={52}/></div>
      <div className="pin-title">Sui Dhaga</div>
      <div className="pin-sub">LIONS CLUB · SILIGURI</div>
      <div className="pin-dots">{[0,1,2,3].map(i=><div key={i} className={`pin-dot ${i<pin.length?"filled":""}`}/>)}</div>
      <div className="pin-grid">
        {["1","2","3","4","5","6","7","8","9","","0","del"].map((k,i)=>
          k===""?<div key={i}/>:<button key={i} className="pin-btn" onClick={()=>!busy&&press(k)}>{k==="del"?"⌫":k}</button>
        )}
      </div>
      {err&&<div className="pin-err">{err}</div>}
      {busy&&<div style={{color:"rgba(255,255,255,.6)",fontSize:13,marginTop:12}}>Checking…</div>}
    </div>
  );
}

export default function SuiDhaga() {
  const [scriptUrl,setScriptUrl]=useState(null);
  const [role,setRole]=useState(null);
  const [tab,setTab]=useState("dash");
  const [data,setData]=useState(null);
  const [sync,setSync]=useState("idle");
  const [loading,setLoading]=useState(true);
  const timer=useRef(null);

  useEffect(()=>{
    (async()=>{ const s=await local.get("sd_cfg_v1"); if(s?.scriptUrl) setScriptUrl(s.scriptUrl); setLoading(false); })();
  },[]);

  useEffect(()=>{
    if(!scriptUrl||!role) return;
    (async()=>{
      // 1. Load from localStorage first so app works instantly
      const localData = await local.get("sd_data_v1");
      if(localData) setData(localData);

      // 2. Try to sync from Google Sheets in background
      setSync("syncing");
      const res = await gsheet.read(scriptUrl);
      if(res.ok && res.data){
        // Use sheets data only if it has more entries than local (sheets is master)
        const sheetEntries = (res.data.ledgerEntries||[]).length + (res.data.pieceLog||[]).length + (res.data.orders||[]).length;
        const localEntries = localData ? (localData.ledgerEntries||[]).length + (localData.pieceLog||[]).length + (localData.orders||[]).length : 0;
        if(sheetEntries >= localEntries){
          setData(res.data);
          await local.set("sd_data_v1", res.data);
        }
        setSync("ok");
      } else {
        if(!localData) setData({...EMPTY});
        setSync(res.ok?"ok":"error");
      }
    })();
  },[scriptUrl,role]);

  useEffect(()=>{
    if(!data||!role) return;
    // Always save to localStorage immediately (survives reload)
    local.set("sd_data_v1", data);
    // Also sync to Google Sheets if manager
    if(!scriptUrl||role!=="manager") return;
    clearTimeout(timer.current);
    setSync("syncing");
    timer.current=setTimeout(async()=>{
      const res=await gsheet.write(scriptUrl,data);
      setSync(res.ok?"ok":"error");
    },2000);
  },[data]);

  const saveUrl=async(url)=>{ await local.set("sd_cfg_v1",{scriptUrl:url}); setScriptUrl(url); };
  const update=useCallback((patch)=>{ if(role==="viewer") return; setData(d=>({...d,...patch})); },[role]);
  const addAct=useCallback((txt)=>{ if(role==="viewer") return; setData(d=>({...d,activity:[{id:uid(),txt,date:todayStr()},...(d.activity||[])].slice(0,50)})); },[role]);

  if(loading) return <><style>{CSS}</style><Loader/></>;
  if(!scriptUrl) return <><style>{CSS}</style><SetupScreen onSave={saveUrl}/></>;
  if(!role) return <><style>{CSS}</style><PinScreen scriptUrl={scriptUrl} onSuccess={setRole}/></>;
  if(!data) return <><style>{CSS}</style><Loader msg="Loading data…"/></>;

  const PAGES={dash:Dashboard,orders:Orders,output:Output,ledger:Ledger,workers:WorkersPage};
  const Page=PAGES[tab];
  const dateStr=new Date().toLocaleDateString("en-IN",{weekday:"short",day:"numeric",month:"short"});
  const dotColor={idle:"transparent",syncing:C.gold,ok:"#4CAF50",error:C.red}[sync];

  return(
    <><style>{CSS}</style>
    <div className="app">
      <header className="hdr">
        <div className="hdr-inner">
          <div className="hdr-logo"><LionsLogo size={34}/></div>
          <div><div className="hdr-title">Sui Dhaga</div><div className="hdr-sub">Lions Club · Siliguri</div></div>
          <div className="hdr-right">
            <div className={`sync-dot ${sync==="syncing"?"sync-ing":""}`} style={{background:dotColor}} title={sync}/>
            <div className="hdr-date">{dateStr}<br/><span style={{fontSize:10,opacity:.7}}>{role==="manager"?"Manager":"Viewer"}</span></div>
            <button onClick={()=>setRole(null)} style={{background:"rgba(255,255,255,.15)",border:"none",color:"white",borderRadius:6,padding:"4px 8px",fontSize:11,cursor:"pointer",fontWeight:600}}>Lock</button>
          </div>
        </div>
        <div className="hdr-stripe"/>
      </header>
      <div className="page"><Page data={data} update={update} addActivity={addAct} role={role}/></div>
      <nav className="bnav">
        {[{id:"dash",icon:"📊",label:"Dashboard"},{id:"orders",icon:"📦",label:"Orders"},{id:"output",icon:"✂️",label:"Output"},{id:"ledger",icon:"📒",label:"Ledger"},{id:"workers",icon:"👷",label:"Workers"}].map(n=>(
          <button key={n.id} className={`nb ${tab===n.id?"on":""}`} onClick={()=>setTab(n.id)}>
            <span className="nb-icon">{n.icon}</span><span>{n.label}</span><span className="nb-dot"/>
          </button>
        ))}
      </nav>
    </div></>
  );
}

function Dashboard({data}){
  const{orders=[],pieceLog=[],ledgerEntries=[],activity=[]}=data;
  const s=(arr,fn)=>arr.reduce((t,x)=>t+fn(x),0);
  const activeOrders=orders.filter(o=>o.status!=="Delivered").length;
  const totalPieces=s(pieceLog,p=>p.pieces);
  const totalBilled=s(orders,o=>(o.totalQty*o.ratePerPiece)||0);
  const clientRec=s(ledgerEntries.filter(e=>e.type==="client"&&e.direction==="in"),e=>e.amount);
  const clientOwes=totalBilled-clientRec;
  const suppOut=s(ledgerEntries.filter(e=>e.type==="supplier"&&e.direction==="out"),e=>e.amount);
  const suppIn=s(ledgerEntries.filter(e=>e.type==="supplier"&&e.direction==="in"),e=>e.amount);
  const weOweSupp=suppOut-suppIn;
  const wEarned=s(pieceLog,p=>p.pieces*p.rate);
  const wPaid=s(ledgerEntries.filter(e=>e.type==="worker"&&e.direction==="out"),e=>e.amount);
  const weOweW=wEarned-wPaid;
  const lIn=s(ledgerEntries.filter(e=>e.type==="loan"&&e.direction==="in"),e=>e.amount);
  const lOut=s(ledgerEntries.filter(e=>e.type==="loan"&&e.direction==="out"),e=>e.amount);
  const loanBal=lIn-lOut;
  return(<>
    <div className="pg-head"><div><div className="pg-title">Overview</div><div className="pg-sub">Factory health at a glance</div></div></div>
    <div className="stat-grid">
      <div className="stat" style={{"--c":C.navy}}><div className="stat-val">{activeOrders}</div><div className="stat-lbl">Active Orders</div></div>
      <div className="stat" style={{"--c":C.gold}}><div className="stat-val">{totalPieces.toLocaleString()}</div><div className="stat-lbl">Pieces Logged</div></div>
      <div className="stat" style={{"--c":C.green}}><div className="stat-val" style={{fontSize:20}}>{fmtCur(clientOwes)}</div><div className="stat-lbl">Clients Owe Us</div></div>
      <div className="stat" style={{"--c":C.red}}><div className="stat-val" style={{fontSize:20}}>{fmtCur(loanBal)}</div><div className="stat-lbl">Loan Remaining</div></div>
    </div>
    <div className="card">
      <div className="card-lbl">Financial Summary</div>
      <div className="sr"><span className="sr-k">Clients owe us</span><span className="sr-v amt-in">{fmtCur(clientOwes)}</span></div>
      <div className="sr"><span className="sr-k">We owe suppliers</span><span className="sr-v amt-out">{fmtCur(weOweSupp)}</span></div>
      <div className="sr"><span className="sr-k">We owe workers</span><span className="sr-v amt-out">{fmtCur(weOweW)}</span></div>
      <div className="sr"><span className="sr-k">Loan outstanding</span><span className="sr-v amt-out">{fmtCur(loanBal)}</span></div>
    </div>
    {activeOrders>0&&<div className="card">
      <div className="card-lbl">Active Orders</div>
      {orders.filter(o=>o.status!=="Delivered").map(o=>{
        const stitched=pieceLog.filter(p=>p.orderId===o.id&&p.stage==="Stitching").reduce((s,p)=>s+p.pieces,0);
        const pct=Math.min(100,Math.round((stitched/(o.totalQty||1))*100));
        return(<div key={o.id} style={{marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between"}}><div style={{fontWeight:700,fontSize:14}}>{o.item}</div><span className={`pill ${o.status==="In Progress"?"p-gold":"p-gray"}`}>{o.status}</span></div>
          <div style={{fontSize:12,color:C.muted,margin:"3px 0 6px"}}>{o.clientName} · {o.totalQty} pcs · {fmtDate(o.deadline)}</div>
          <div className="prog"><div className="prog-fill" style={{width:pct+"%"}}/></div>
          <div style={{fontSize:11,color:C.muted,marginTop:3}}>{pct}% stitched</div>
        </div>);
      })}
    </div>}
    <div className="card">
      <div className="card-lbl">Recent Activity</div>
      {activity.length===0?<div style={{padding:"12px 0",fontSize:13,color:C.muted,textAlign:"center"}}>No activity yet!</div>
        :activity.slice(0,7).map(a=>(<div key={a.id} className="act"><div className="act-dot"/><div><div className="act-txt">{a.txt}</div><div className="act-date">{fmtDate(a.date)}</div></div></div>))}
    </div>
  </>);
}

function Orders({data,update,addActivity,role}){
  const{orders=[],clients=[],pieceLog=[]}=data;
  const[modal,setModal]=useState(null);
  const[form,setForm]=useState({});
  const canEdit=role==="manager";
  const save=()=>{
    if(!form.item||!form.totalQty) return;
    const client=clients.find(c=>c.id===form.clientId);
    const o={id:uid(),...form,totalQty:+form.totalQty,ratePerPiece:+(form.ratePerPiece||0),clientName:client?.name||form.clientName||"Unknown",status:"Pending",createdAt:todayStr()};
    update({orders:[...orders,o]});addActivity(`New order: "${o.item}" for ${o.clientName}`);setModal(null);
  };
  const setStatus=(id,status)=>{
    const o=orders.find(x=>x.id===id);
    update({orders:orders.map(x=>x.id===id?{...x,status}:x)});addActivity(`Order "${o?.item}" → ${status}`);setModal(null);
  };
  const SC={"Pending":"p-gray","In Progress":"p-gold","Delivered":"p-green"};
  return(<>
    <div className="pg-head"><div><div className="pg-title">Orders</div><div className="pg-sub">{orders.length} total</div></div>{canEdit&&<button className="btn btn-sm btn-navy" onClick={()=>{setForm({deadline:todayStr(),clientId:"",clientName:""});setModal("add");}}>+ New Order</button>}</div>
    {orders.length===0&&<div className="empty"><div className="empty-icon">📦</div><div className="empty-txt">No orders yet.</div></div>}
    {[...orders].reverse().map(o=>{
      const stitched=pieceLog.filter(p=>p.orderId===o.id&&p.stage==="Stitching").reduce((s,p)=>s+p.pieces,0);
      const pct=Math.min(100,Math.round((stitched/(o.totalQty||1))*100));
      return(<div key={o.id} className="card" onClick={()=>setModal(o)} style={{cursor:"pointer"}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><div style={{fontWeight:700,fontSize:15,fontFamily:"'Playfair Display',serif",color:C.navy}}>{o.item}</div><span className={`pill ${SC[o.status]||"p-gray"}`}>{o.status}</span></div>
        <div style={{fontSize:13,color:C.muted,marginBottom:5}}>{o.clientName} · {o.totalQty} pcs{o.ratePerPiece?` · ${fmtCur(o.totalQty*o.ratePerPiece)}`:""}</div>
        <div style={{fontSize:12,color:C.muted,marginBottom:7}}>Deadline: {fmtDate(o.deadline)}</div>
        <div className="prog"><div className="prog-fill" style={{width:pct+"%"}}/></div>
        <div style={{fontSize:11,color:C.muted,marginTop:3}}>{stitched}/{o.totalQty} stitched ({pct}%)</div>
      </div>);
    })}
    {modal==="add"&&(<div className="overlay" onClick={()=>setModal(null)}><div className="modal" onClick={e=>e.stopPropagation()}>
      <div className="modal-handle"/><div className="modal-title">New Order</div>
      <div className="field"><label className="lbl">Client</label>
        <select className="inp" value={form.clientId||""} onChange={e=>{const c=clients.find(x=>x.id===e.target.value);setForm(f=>({...f,clientId:e.target.value,clientName:c?.name||""}));}}>
          <option value="">-- Select client --</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}<option value="__new">Type name below</option>
        </select>
      </div>
      {(!form.clientId||form.clientId==="__new")&&<div className="field"><label className="lbl">Client Name</label><input className="inp" placeholder="Client name" value={form.clientName||""} onChange={e=>setForm(f=>({...f,clientName:e.target.value}))}/></div>}
      <div className="field"><label className="lbl">Item</label><input className="inp" placeholder="e.g. School Uniforms" value={form.item||""} onChange={e=>setForm(f=>({...f,item:e.target.value}))}/></div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div className="field"><label className="lbl">Total Pieces</label><input className="inp" type="number" placeholder="0" value={form.totalQty||""} onChange={e=>setForm(f=>({...f,totalQty:e.target.value}))}/></div>
        <div className="field"><label className="lbl">Rate/piece (₹)</label><input className="inp" type="number" placeholder="0" value={form.ratePerPiece||""} onChange={e=>setForm(f=>({...f,ratePerPiece:e.target.value}))}/></div>
      </div>
      <div className="field"><label className="lbl">Deadline</label><input className="inp" type="date" value={form.deadline||todayStr()} onChange={e=>setForm(f=>({...f,deadline:e.target.value}))}/></div>
      {form.totalQty&&form.ratePerPiece&&<div className="ibox i-navy" style={{fontWeight:600}}>Total value: {fmtCur(form.totalQty*form.ratePerPiece)}</div>}
      <div style={{display:"flex",gap:8}}><button className="btn btn-sm btn-ghost" style={{flex:1}} onClick={()=>setModal(null)}>Cancel</button><button className="btn btn-sm btn-navy" style={{flex:2}} onClick={save}>Save Order</button></div>
    </div></div>)}
    {modal&&modal!=="add"&&(<div className="overlay" onClick={()=>setModal(null)}><div className="modal" onClick={e=>e.stopPropagation()}>
      <div className="modal-handle"/><div className="modal-title">{modal.item}</div>
      <div className="card-sm" style={{marginBottom:14}}>
        <div className="sr"><span className="sr-k">Client</span><span className="sr-v">{modal.clientName}</span></div>
        <div className="sr"><span className="sr-k">Total pieces</span><span className="sr-v">{modal.totalQty}</span></div>
        {modal.ratePerPiece>0&&<><div className="sr"><span className="sr-k">Rate/piece</span><span className="sr-v">{fmtCur(modal.ratePerPiece)}</span></div><div className="sr"><span className="sr-k">Total value</span><span className="sr-v">{fmtCur(modal.totalQty*modal.ratePerPiece)}</span></div></>}
        <div className="sr"><span className="sr-k">Deadline</span><span className="sr-v">{fmtDate(modal.deadline)}</span></div>
      </div>
      <div className="sec-lbl">Piece Reconciliation</div>
      {STAGES.map(stage=>{const count=pieceLog.filter(p=>p.orderId===modal.id&&p.stage===stage).reduce((s,p)=>s+p.pieces,0);return count>0?<div key={stage} className="sr"><span className="sr-k">{stage}</span><span className="sr-v" style={{color:C.navy}}>{count} pcs</span></div>:null;})}
      {canEdit&&<><div className="sec-lbl" style={{marginTop:16}}>Update Status</div>
      <div style={{display:"flex",gap:6}}>{["Pending","In Progress","Delivered"].map(s=><button key={s} className={`btn btn-xs ${modal.status===s?"btn-navy":"btn-ghost"}`} style={{flex:1}} onClick={()=>setStatus(modal.id,s)}>{s}</button>)}</div></>}
    </div></div>)}
  </>);
}

function Output({data,update,addActivity,role}){
  const{workers=[],orders=[],pieceLog=[]}=data;
  const[outTab,setOutTab]=useState("log");
  const[modal,setModal]=useState(false);
  const[form,setForm]=useState({});
  const canEdit=role==="manager";
  const activeOrders=orders.filter(o=>o.status!=="Delivered");
  const openLog=()=>{const w=workers.find(x=>x.active);setForm({workerId:w?.id||"",orderId:activeOrders[0]?.id||"",stage:w?(STAGE_OF_ROLE[w.role]||"Stitching"):"Stitching",pieces:"",date:todayStr()});setModal(true);};
  const saveLog=()=>{
    if(!form.workerId||!form.orderId||!form.pieces) return;
    const w=workers.find(x=>x.id===form.workerId),o=orders.find(x=>x.id===form.orderId);
    update({pieceLog:[...pieceLog,{id:uid(),workerId:w.id,workerName:w.name,role:w.role,orderId:o.id,orderName:o.item,stage:form.stage,pieces:+form.pieces,rate:w.rate||0,date:form.date}]});
    addActivity(`${w.name} (${w.role}) — ${form.pieces} pcs [${form.stage}] on "${o.item}"`);setModal(false);
  };
  const wSum=workers.map(w=>{const logs=pieceLog.filter(p=>p.workerId===w.id);return{...w,pieces:logs.reduce((s,p)=>s+p.pieces,0),earned:logs.reduce((s,p)=>s+p.pieces*p.rate,0)};}).sort((a,b)=>b.pieces-a.pieces);
  const recon=orders.map(o=>{const bs={};STAGES.forEach(s=>{bs[s]=pieceLog.filter(p=>p.orderId===o.id&&p.stage===s).reduce((sum,p)=>sum+p.pieces,0);});return{...o,bs};});
  const selW=workers.find(w=>w.id===form.workerId);
  return(<>
    <div className="pg-head"><div><div className="pg-title">Output</div><div className="pg-sub">Piece-by-piece tracking</div></div>{canEdit&&<button className="btn btn-sm btn-navy" onClick={openLog}>+ Log</button>}</div>
    <div className="tabs">{[["log","Daily Logs"],["workers","By Worker"],["recon","Reconcile"]].map(([k,l])=><button key={k} className={`tab ${outTab===k?"on":""}`} onClick={()=>setOutTab(k)}>{l}</button>)}</div>
    {outTab==="log"&&(<>{pieceLog.length===0&&<div className="empty"><div className="empty-icon">✂️</div><div className="empty-txt">No output logged yet.</div></div>}
      {[...pieceLog].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,40).map(e=>(
        <div key={e.id} className="card-sm" style={{display:"flex",alignItems:"center",gap:12}}>
          <div className="av av-navy">{(e.workerName||"?")[0]}</div>
          <div style={{flex:1}}><div style={{fontWeight:600,fontSize:14}}>{e.workerName}</div><div style={{fontSize:12,color:C.muted}}>{e.role} · <span className="pill p-navy" style={{padding:"1px 7px",fontSize:10}}>{e.stage}</span></div><div style={{fontSize:12,color:C.muted}}>{e.orderName} · {fmtDate(e.date)}</div></div>
          <div style={{textAlign:"right"}}><div style={{fontWeight:700,fontSize:17,fontFamily:"'Playfair Display',serif"}}>{e.pieces}</div><div style={{fontSize:10,color:C.muted}}>pcs</div>{e.rate>0&&<div style={{fontSize:12,color:C.green,fontWeight:600}}>{fmtCur(e.pieces*e.rate)}</div>}</div>
        </div>
      ))}</>)}
    {outTab==="workers"&&(<>{wSum.length===0&&<div className="empty"><div className="empty-icon">👷</div><div className="empty-txt">No workers yet.</div></div>}
      {wSum.map(w=><div key={w.id} className="card-sm" style={{display:"flex",alignItems:"center",gap:12}}>
        <div className="av av-gold">{w.name[0]}</div>
        <div style={{flex:1}}><div style={{fontWeight:600,fontSize:14}}>{w.name}</div><div style={{fontSize:12,color:C.muted}}>{w.role} · ₹{w.rate}/pc</div></div>
        <div style={{textAlign:"right"}}><div style={{fontWeight:700,fontSize:17,fontFamily:"'Playfair Display',serif",color:C.navy}}>{w.pieces.toLocaleString()}</div><div style={{fontSize:10,color:C.muted}}>pieces</div><div style={{fontSize:12,color:C.green,fontWeight:600}}>{fmtCur(w.earned)}</div></div>
      </div>)}</>)}
    {outTab==="recon"&&(<>
      <div className="ibox i-navy" style={{fontSize:12}}><strong>Reconciliation:</strong> Cut → Stitched → Finished should all match.</div>
      {recon.map(o=>{
        const cut=o.bs["Cutting"]||0,st=o.bs["Stitching"]||0,fin=(o.bs["Finishing"]||0)+(o.bs["Folding"]||0),qc=o.bs["Quality Check"]||0,gap=cut-st;
        return(<div key={o.id} className="card">
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><div style={{fontWeight:700,fontSize:14,color:C.navy}}>{o.item}</div><span style={{fontSize:12,color:C.muted}}>{o.clientName}</span></div>
          <div style={{fontSize:12,color:C.muted,marginBottom:10}}>Target: <strong style={{color:C.navy}}>{o.totalQty} pcs</strong></div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:5,marginBottom:8}}>
            {[["✂️","Cut",cut],["🧵","Stitched",st],["🏁","Finished",fin],["✅","QC'd",qc]].map(([icon,lbl,val])=>(
              <div key={lbl} style={{textAlign:"center",background:val>0?C.navy:C.navyLight,borderRadius:8,padding:"8px 4px"}}>
                <div style={{fontSize:15}}>{icon}</div>
                <div style={{fontFamily:"'Playfair Display',serif",fontSize:17,fontWeight:900,color:val>0?"white":C.muted}}>{val}</div>
                <div style={{fontSize:10,color:val>0?"rgba(255,255,255,.65)":C.muted,fontWeight:600}}>{lbl}</div>
              </div>
            ))}
          </div>
          {cut>0&&gap>0&&<div className="ibox i-gold" style={{fontSize:12,fontWeight:600}}>⚠️ {gap} pieces cut but not yet stitched</div>}
          {cut>0&&gap===0&&st>0&&<div className="ibox i-green" style={{fontSize:12,fontWeight:600}}>✅ Cut & stitched match</div>}
          {st>o.totalQty&&<div className="ibox i-red" style={{fontSize:12,fontWeight:600}}>🚨 More stitched than ordered!</div>}
        </div>);
      })}
    </>)}
    {modal&&canEdit&&(<div className="overlay" onClick={()=>setModal(false)}><div className="modal" onClick={e=>e.stopPropagation()}>
      <div className="modal-handle"/><div className="modal-title">Log Pieces</div>
      <div className="field"><label className="lbl">Worker</label>
        <select className="inp" value={form.workerId} onChange={e=>{const w=workers.find(x=>x.id===e.target.value);setForm(f=>({...f,workerId:e.target.value,stage:w?(STAGE_OF_ROLE[w.role]||"Stitching"):f.stage}));}}>
          <option value="">-- Select worker --</option>{workers.filter(w=>w.active).map(w=><option key={w.id} value={w.id}>{w.name} — {w.role}</option>)}
        </select>
      </div>
      <div className="field"><label className="lbl">Order</label>
        <select className="inp" value={form.orderId} onChange={e=>setForm(f=>({...f,orderId:e.target.value}))}>
          <option value="">-- Select order --</option>{activeOrders.map(o=><option key={o.id} value={o.id}>{o.item} ({o.clientName})</option>)}
        </select>
      </div>
      <div className="field"><label className="lbl">Stage</label>
        <select className="inp" value={form.stage||"Stitching"} onChange={e=>setForm(f=>({...f,stage:e.target.value}))}>{STAGES.map(s=><option key={s} value={s}>{s}</option>)}</select>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div className="field"><label className="lbl">Pieces</label><input className="inp" type="number" placeholder="0" value={form.pieces||""} onChange={e=>setForm(f=>({...f,pieces:e.target.value}))}/></div>
        <div className="field"><label className="lbl">Date</label><input className="inp" type="date" value={form.date||todayStr()} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/></div>
      </div>
      {form.pieces>0&&selW?.rate>0&&<div className="ibox i-green" style={{fontWeight:600}}>Earnings: {form.pieces} × ₹{selW.rate} = {fmtCur(form.pieces*selW.rate)}</div>}
      <div style={{display:"flex",gap:8,marginTop:4}}><button className="btn btn-sm btn-ghost" style={{flex:1}} onClick={()=>setModal(false)}>Cancel</button><button className="btn btn-sm btn-navy" style={{flex:2}} onClick={saveLog}>Save Log</button></div>
    </div></div>)}
  </>);
}

function Ledger({data,update,addActivity,role}){
  const{clients=[],suppliers=[],workers=[],lenders=[],ledgerEntries=[],orders=[],pieceLog=[]}=data;
  const[lTab,setLTab]=useState("clients");
  const[eModal,setEModal]=useState(null);
  const[aModal,setAModal]=useState(false);
  const[form,setForm]=useState({});
  const[pf,setPf]=useState({});
  const canEdit=role==="manager";
  const CFG={clients:{label:"Clients",type:"client",list:clients,av:"av-navy",icon:"🏢"},suppliers:{label:"Suppliers",type:"supplier",list:suppliers,av:"av-gold",icon:"🧵"},workers:{label:"Workers",type:"worker",list:workers,av:"av-teal",icon:"✂️"},loans:{label:"Loans",type:"loan",list:lenders,av:"av-green",icon:"💰"}};
  const cfg=CFG[lTab];
  const getD=(party)=>{
    if(lTab==="clients"){const billed=orders.filter(o=>o.clientId===party.id).reduce((s,o)=>s+(o.totalQty*o.ratePerPiece||0),0);const ins=ledgerEntries.filter(e=>e.partyId===party.id&&e.type==="client"&&e.direction==="in").reduce((s,e)=>s+e.amount,0);return{label:"Outstanding",val:billed-ins,good:(billed-ins)<=0};}
    if(lTab==="suppliers"){const outs=ledgerEntries.filter(e=>e.partyId===party.id&&e.type==="supplier"&&e.direction==="out").reduce((s,e)=>s+e.amount,0);const ins=ledgerEntries.filter(e=>e.partyId===party.id&&e.type==="supplier"&&e.direction==="in").reduce((s,e)=>s+e.amount,0);return{label:"We owe",val:outs-ins,good:(outs-ins)<=0};}
    if(lTab==="workers"){const earned=pieceLog.filter(p=>p.workerId===party.id).reduce((s,p)=>s+p.pieces*p.rate,0);const paid=ledgerEntries.filter(e=>e.partyId===party.id&&e.type==="worker"&&e.direction==="out").reduce((s,e)=>s+e.amount,0);return{label:"We owe",val:earned-paid,earned,paid,good:(earned-paid)<=0};}
    const ins=ledgerEntries.filter(e=>e.partyId===party.id&&e.type==="loan"&&e.direction==="in").reduce((s,e)=>s+e.amount,0);const outs=ledgerEntries.filter(e=>e.partyId===party.id&&e.type==="loan"&&e.direction==="out").reduce((s,e)=>s+e.amount,0);return{label:"Remaining",val:ins-outs,good:(ins-outs)<=0};
  };
  const openE=(party)=>{setForm({partyId:party.id,partyName:party.name,type:cfg.type,desc:"",amount:"",direction:lTab==="clients"||lTab==="loans"?"in":"out",date:todayStr()});setEModal(party);};
  const saveE=()=>{if(!form.desc||!form.amount) return;update({ledgerEntries:[...ledgerEntries,{id:uid(),...form,amount:+form.amount}]});addActivity(`Ledger (${form.partyName}): ${form.desc} — ${form.direction==="in"?"+":"–"}${fmtCur(form.amount)}`);setEModal(null);};
  const saveP=()=>{
    if(!pf.name) return;
    const p={id:uid(),name:pf.name,phone:pf.phone||""};
    let nW=[...workers],nC=[...clients],nS=[...suppliers],nL=[...lenders],nE=[...ledgerEntries];
    if(lTab==="workers") nW=[...workers,{...p,role:pf.role||"Tailor",rate:+(pf.rate||0),active:true}];
    else if(lTab==="clients") nC=[...clients,p];
    else if(lTab==="suppliers") nS=[...suppliers,p];
    else nL=[...lenders,p];
    if(pf.openingBal&&+pf.openingBal>0){
      const dir=lTab==="clients"||lTab==="loans"?"in":"out";
      nE=[...nE,{id:uid(),type:cfg.type,partyId:p.id,partyName:p.name,desc:"Opening balance",amount:+(pf.openingBal),direction:dir,date:pf.obDate||todayStr()}];
    }
    update({workers:nW,clients:nC,suppliers:nS,lenders:nL,ledgerEntries:nE});
    addActivity(`Added ${cfg.label.slice(0,-1)}: ${pf.name}${pf.openingBal?" (opening: "+fmtCur(pf.openingBal)+")":""}`);
    setAModal(false);setPf({});
  };
  return(<>
    <div className="pg-head"><div><div className="pg-title">Ledger</div><div className="pg-sub">Accounts & balances</div></div>{canEdit&&<button className="btn btn-sm btn-navy" onClick={()=>setAModal(true)}>+ Add</button>}</div>
    <div className="tabs">{Object.entries(CFG).map(([k,v])=><button key={k} className={`tab ${lTab===k?"on":""}`} onClick={()=>setLTab(k)}>{v.label}</button>)}</div>
    {cfg.list.length===0&&<div className="empty"><div className="empty-icon">{cfg.icon}</div><div className="empty-txt">No {cfg.label.toLowerCase()} yet.</div></div>}
    {cfg.list.map(party=>{
      const d=getD(party);const entries=ledgerEntries.filter(e=>e.partyId===party.id&&e.type===cfg.type);
      return(<div key={party.id} className="card">
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
          <div className={`av ${cfg.av}`}>{party.name[0]}</div>
          <div style={{flex:1}}><div style={{fontWeight:700,fontSize:15}}>{party.name}</div>{party.phone&&<div style={{fontSize:12,color:C.muted}}>{party.phone}</div>}{lTab==="workers"&&<div style={{fontSize:12,color:C.muted}}>{party.role} · ₹{party.rate}/pc</div>}</div>
          <div style={{textAlign:"right"}}><div style={{fontWeight:700,fontSize:16,fontFamily:"'Playfair Display',serif",color:d.good?C.green:C.red}}>{fmtCur(d.val)}</div><div style={{fontSize:11,color:C.muted}}>{d.label}</div></div>
        </div>
        {lTab==="workers"&&d.earned>0&&<div className="ibox i-navy" style={{fontSize:12,display:"flex",gap:16,marginBottom:8}}><span>Earned: <strong>{fmtCur(d.earned)}</strong></span><span>Paid: <strong>{fmtCur(d.paid)}</strong></span></div>}
        {entries.slice(-3).reverse().map(e=><div key={e.id} className="row" style={{padding:"7px 0"}}>
          <div style={{flex:1}}><div style={{fontSize:13,fontWeight:500}}>{e.desc}</div><div style={{fontSize:11,color:C.muted}}>{fmtDate(e.date)}</div></div>
          <div style={{fontWeight:700,fontSize:14,fontFamily:"'Playfair Display',serif"}} className={e.direction==="in"?"amt-in":"amt-out"}>{e.direction==="in"?"+":"–"}{fmtCur(e.amount)}</div>
        </div>)}
        {canEdit&&<button className="btn btn-sm btn-outline" style={{width:"100%",marginTop:10}} onClick={()=>openE(party)}>+ Add Entry</button>}
      </div>);
    })}
    {eModal&&(<div className="overlay" onClick={()=>setEModal(null)}><div className="modal" onClick={e=>e.stopPropagation()}>
      <div className="modal-handle"/><div className="modal-title">{eModal.name}</div>
      <div className="field"><label className="lbl">Description</label><input className="inp" placeholder="e.g. Advance payment received" value={form.desc} onChange={e=>setForm(f=>({...f,desc:e.target.value}))}/></div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div className="field"><label className="lbl">Amount (₹)</label><input className="inp" type="number" placeholder="0" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))}/></div>
        <div className="field"><label className="lbl">Date</label><input className="inp" type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/></div>
      </div>
      <div className="field"><label className="lbl">Type</label>
        <div style={{display:"flex",gap:8}}>
          {[["in",lTab==="clients"?"Payment Received":lTab==="loans"?"Loan Received":"Received"],["out",lTab==="workers"?"Paid to Worker":lTab==="suppliers"?"Paid to Supplier":"Paid Out"]].map(([dir,lbl])=>(
            <button key={dir} className={`btn btn-sm ${form.direction===dir?(dir==="in"?"btn-green":"btn-red"):"btn-ghost"}`} style={{flex:1,fontSize:12}} onClick={()=>setForm(f=>({...f,direction:dir}))}>{lbl}</button>
          ))}
        </div>
      </div>
      <div style={{display:"flex",gap:8,marginTop:4}}><button className="btn btn-sm btn-ghost" style={{flex:1}} onClick={()=>setEModal(null)}>Cancel</button><button className="btn btn-sm btn-navy" style={{flex:2}} onClick={saveE}>Save Entry</button></div>
    </div></div>)}
    {aModal&&(<div className="overlay" onClick={()=>setAModal(false)}><div className="modal" onClick={e=>e.stopPropagation()}>
      <div className="modal-handle"/><div className="modal-title">Add {cfg.label.slice(0,-1)}</div>
      <div className="field"><label className="lbl">Name</label><input className="inp" placeholder="Full name or business name" value={pf.name||""} onChange={e=>setPf(f=>({...f,name:e.target.value}))}/></div>
      <div className="field"><label className="lbl">Phone (optional)</label><input className="inp" type="tel" placeholder="9800000000" value={pf.phone||""} onChange={e=>setPf(f=>({...f,phone:e.target.value}))}/></div>
      {lTab==="workers"&&<><div className="field"><label className="lbl">Role</label><select className="inp" value={pf.role||"Tailor"} onChange={e=>setPf(f=>({...f,role:e.target.value}))}>{ALL_ROLES.map(r=><option key={r} value={r}>{r}</option>)}</select></div><div className="field"><label className="lbl">Rate/piece (₹)</label><input className="inp" type="number" placeholder="0" value={pf.rate||""} onChange={e=>setPf(f=>({...f,rate:e.target.value}))}/></div></>}
      <div className="field" style={{borderTop:"1.5px dashed #DDE3EF",paddingTop:12,marginTop:4}}>
        <label className="lbl" style={{color:"#C8962A"}}>Opening Balance (optional)</label>
        <input className="inp" type="number" placeholder="Enter if they already have a balance" value={pf.openingBal||""} onChange={e=>setPf(f=>({...f,openingBal:e.target.value}))}/>
        {pf.openingBal&&+pf.openingBal>0&&<div style={{fontSize:12,color:"#6B7A99",marginTop:5}}>
          {lTab==="clients"?"Means client already owes you this amount":lTab==="loans"?"Means this loan was already received":"Means you already owe them this amount"}
        </div>}
      </div>
      {pf.openingBal&&+pf.openingBal>0&&<div className="field"><label className="lbl">Opening Balance Date</label><input className="inp" type="date" value={pf.obDate||todayStr()} onChange={e=>setPf(f=>({...f,obDate:e.target.value}))}/></div>}
      <div style={{display:"flex",gap:8,marginTop:4}}><button className="btn btn-sm btn-ghost" style={{flex:1}} onClick={()=>setAModal(false)}>Cancel</button><button className="btn btn-sm btn-navy" style={{flex:2}} onClick={saveP}>Add {cfg.label.slice(0,-1)}</button></div>
    </div></div>)}
  </>);
}

function WorkersPage({data,update,addActivity,role}){
  const{workers=[],pieceLog=[],ledgerEntries=[]}=data;
  const[modal,setModal]=useState(false);
  const[form,setForm]=useState({role:"Tailor"});
  const canEdit=role==="manager";
  const save=()=>{if(!form.name||!form.role) return;update({workers:[...workers,{id:uid(),name:form.name,role:form.role,rate:+(form.rate||0),phone:form.phone||"",active:true}]});addActivity(`New worker: ${form.name} (${form.role})`);setModal(false);setForm({role:"Tailor"});};
  const toggle=(id)=>update({workers:workers.map(w=>w.id===id?{...w,active:!w.active}:w)});
  const stats=workers.map(w=>{const logs=pieceLog.filter(p=>p.workerId===w.id);const earned=logs.reduce((s,p)=>s+p.pieces*p.rate,0);const paid=ledgerEntries.filter(e=>e.partyId===w.id&&e.type==="worker"&&e.direction==="out").reduce((s,e)=>s+e.amount,0);return{...w,pieces:logs.reduce((s,p)=>s+p.pieces,0),earned,paid,owed:earned-paid};});
  const groups=ALL_ROLES.reduce((acc,r)=>{const ws=stats.filter(w=>w.role===r);if(ws.length)acc[r]=ws;return acc;},{});
  const avMap={"Cutting Master":"av-gold","Cutter":"av-gold","Tailor":"av-navy","Stitcher":"av-navy","Finisher":"av-teal","Embroiderer":"av-teal","Folder":"av-green","Packer":"av-green","QC Inspector":"av-red","Checker":"av-red"};
  return(<>
    <div className="pg-head"><div><div className="pg-title">Workers</div><div className="pg-sub">{workers.filter(w=>w.active).length} active · {workers.length} total</div></div>{canEdit&&<button className="btn btn-sm btn-navy" onClick={()=>{setForm({role:"Tailor"});setModal(true);}}>+ Add Worker</button>}</div>
    {workers.length===0&&<div className="empty"><div className="empty-icon">👷</div><div className="empty-txt">No workers yet.<br/>Add cutting masters, tailors,<br/>folders and other staff here.</div></div>}
    {Object.entries(groups).map(([r,ws])=>(<div key={r}>
      <div className="sec-lbl">{r}{ws.length>1?"s":""} ({ws.length})</div>
      {ws.map(w=><div key={w.id} className="card-sm" style={{opacity:w.active?1:.55}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div className={`av ${avMap[w.role]||"av-navy"}`}>{w.name[0]}</div>
          <div style={{flex:1}}><div style={{fontWeight:700,fontSize:14}}>{w.name}</div><div style={{fontSize:12,color:C.muted}}>{w.role} · ₹{w.rate}/pc{w.phone?` · ${w.phone}`:""}</div>{w.pieces>0&&<div style={{fontSize:12,marginTop:3}}><span style={{color:C.navy,fontWeight:600}}>{w.pieces.toLocaleString()} pcs</span><span style={{color:C.muted}}> · </span><span style={{color:C.green,fontWeight:600}}>{fmtCur(w.earned)}</span>{w.owed>0&&<><span style={{color:C.muted}}> · Owed: </span><span style={{color:C.red,fontWeight:600}}>{fmtCur(w.owed)}</span></>}</div>}</div>
          {canEdit&&<button className={`btn btn-xs ${w.active?"btn-ghost":"btn-navy"}`} onClick={()=>toggle(w.id)} style={{fontSize:11}}>{w.active?"Pause":"Restore"}</button>}
        </div>
      </div>)}
    </div>))}
    {modal&&canEdit&&(<div className="overlay" onClick={()=>setModal(false)}><div className="modal" onClick={e=>e.stopPropagation()}>
      <div className="modal-handle"/><div className="modal-title">Add Factory Worker</div>
      <div className="field"><label className="lbl">Full Name</label><input className="inp" placeholder="Worker's name" value={form.name||""} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></div>
      <div className="field"><label className="lbl">Role</label><select className="inp" value={form.role||"Tailor"} onChange={e=>setForm(f=>({...f,role:e.target.value}))}>{ALL_ROLES.map(r=><option key={r} value={r}>{r}</option>)}</select></div>
      {form.role&&STAGE_OF_ROLE[form.role]&&<div className="ibox i-navy" style={{fontSize:12,marginBottom:12}}>Works at the <strong>{STAGE_OF_ROLE[form.role]}</strong> stage.</div>}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div className="field"><label className="lbl">Rate/piece (₹)</label><input className="inp" type="number" placeholder="0" value={form.rate||""} onChange={e=>setForm(f=>({...f,rate:e.target.value}))}/></div>
        <div className="field"><label className="lbl">Phone (optional)</label><input className="inp" type="tel" placeholder="98..." value={form.phone||""} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/></div>
      </div>
      <div style={{display:"flex",gap:8,marginTop:4}}><button className="btn btn-sm btn-ghost" style={{flex:1}} onClick={()=>setModal(false)}>Cancel</button><button className="btn btn-sm btn-navy" style={{flex:2}} onClick={save}>Add Worker</button></div>
    </div></div>)}
  </>);
}
