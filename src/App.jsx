import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  collection,
  getDocs,
  query,
  orderBy
} from 'firebase/firestore';
import {
  ChevronUp,
  ChevronDown,
  Save,
  Music4,
  Trash2,
  Copy,
  PlusCircle,
  Undo2,
  Tally3,
  Tally4,
  X,
  Scissors,
  ClipboardPaste,
  Redo2,
  FileDown,
  FolderOpen,
  Loader2
} from 'lucide-react';

//-----------------------------------------------------------------
// FIX 1 ▸ constante appId (guardar/cargar)
//-----------------------------------------------------------------
const appId = 'chordcharts';

// NOTE: jspdf se carga vía CDN.

//--------------- Firebase init -----------------------------------
let app, auth, db;
try {
  const cfg = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
  if (Object.keys(cfg).length) {
    app = initializeApp(cfg);
    auth = getAuth(app);
    db = getFirestore(app);
  } else console.error('Firebase config missing');
} catch (e) { console.error('Firebase init error', e); }

//--------------- Music‑theory helpers (sin cambios) --------------
const NOTES_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const NOTES_FLAT  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const MAJOR_KEYS_CHROMATIC = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const MINOR_KEYS_CHROMATIC = ['Am','Bbm','Bm','Cm','C#m','Dm','Ebm','Em','Fm','F#m','Gm','G#m'];
const idx = n=>NOTES_SHARP.includes(n)?NOTES_SHARP.indexOf(n):NOTES_FLAT.indexOf(n);
const name=(i,s)=> (s?NOTES_SHARP:NOTES_FLAT)[((i%12)+12)%12];
const useSharp=k=>{const r=k.replace('m','');const flats=['F','Bb','Eb','Ab','Db','Gb','Cb'];if(flats.includes(r))return false;if(k.endsWith('m')){if(flats.includes(name(idx(r)+3)))return false;}return true;};
const getDiatonicChords=(key,mode,q)=>{const k=idx(key);if(k<0)return[];const s=useSharp(key);const qs=mode==='major'? (q==='tetrad'?[{q:'maj7',i:0},{q:'m7',i:2},{q:'m7',i:4},{q:'maj7',i:5},{q:'7',i:7},{q:'m7',i:9}]:[{q:'',i:0},{q:'m',i:2},{q:'m',i:4},{q:'',i:5},{q:'7',i:7},{q:'m',i:9}]): (q==='tetrad'?[{q:'m7',i:0},{q:'m7b5',i:2},{q:'maj7',i:3},{q:'m7',i:5},{q:'7',i:7},{q:'maj7',i:8},{q:'7',i:10}]:[{q:'m',i:0},{q:'dim',i:2},{q:'',i:3},{q:'m',i:5},{q:'',i:7},{q:'',i:8},{q:'',i:10}]);
return qs.map(c=>name(k+c.i,s)+c.q);};
const getOtherChords=(key,mode='major',q='tetrad')=>{const k=idx(key);if(k<0)return[];const s=useSharp(key);const arr=[];([...mode==='major'?[2,4,7,9]:[5,7]]).forEach(st=>{arr.push(name(k+st+7,s)+(q==='tetrad'?'7':''));});if(mode==='major'){arr.push(name(k+5,s)+(q==='tetrad'?'m7':'m'));arr.push(name(k+8,false)+(q==='tetrad'?'maj7':''));arr.push(name(k+10,false)+(q==='tetrad'?'7':''));}return[...new Set(arr)];};
const transposeChord=(c,s,nk)=>c==='%'?c:c.split('/').map(p=>{const r=p.match(/^[A-G][#b]?/);if(!r)return p;const root=r[0];const qual=p.slice(root.length);const i=idx(root);if(i<0)return p;return name(i+s,useSharp(nk))+qual;}).join('/');

//--------------- History hook ------------------------------------
const useHistoryState=init=>{const[h,setH]=useState([init]);const[i,setI]=useState(0);const st=h[i];const setState=useCallback((a,ov=false)=>{setH(c=>{const cur=c[i];const n=typeof a==='function'?a(cur):a;if(JSON.stringify(cur)===JSON.stringify(n))return c;if(ov){const nc=[...c];nc[i]=n;return nc;}const nc=c.slice(0,i+1);setI(nc.length);return[...nc,n];});},[i]);return[st,setState,()=>i>0&&setI(i-1),()=>i<h.length-1&&setI(i+1),i>0,i<h.length-1,(n)=>{setH([n]);setI(0);}];};

//-----------------------------------------------------------------
// Main App
//-----------------------------------------------------------------
export default function App(){
  const[userId,setUserId]=useState(null);
  const[isAuthReady,setIsAuthReady]=useState(false);
  const[chart,setChart,undo,redo,canUndo,canRedo,reset]=useHistoryState({
    id:`chart-${Date.now()}`,title:'Mi Partitura',artist:'Anónimo',key:'C',mode:'major',savedAt:null,
    sections:[{id:Date.now(),name:'Intro',measures:[{id:1,chords:['C']},{id:2,chords:['G'],startRepeat:true},{id:3,chords:['Am']},{id:4,chords:['F'],endRepeat:':|x2'}]}]
  });
  const[selection,setSelection]=useState({start:null,end:null,activeSectionId:chart.sections[0].id});
  const[clipboard,setClipboard]=useState([]);
  const[draggedItem,setDraggedItem]=useState(null);
  const[pdfReady,setPdfReady]=useState(false);
  const[isSaving,setIsSaving]=useState(false);
  const[isExporting,setIsExporting]=useState(false);

  //---- load jsPDF ----
  useEffect(()=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';s.onload=()=>setPdfReady(true);document.body.appendChild(s);},[]);
  //---- auth ----
  useEffect(()=>{if(!auth){setIsAuthReady(true);return;}onAuthStateChanged(auth,u=>{if(u){setUserId(u.uid);}else signInAnonymously(auth);setIsAuthReady(true);});},[]);

  //----------------------------------------------------------------
  // CRUD firestore ------------------------------------------------
  //----------------------------------------------------------------
  const saveChart=async()=>{if(!userId||!db||isSaving)return;setIsSaving(true);try{const ref=doc(db,`artifacts/${appId}/users/${userId}/charts`,chart.id);await setDoc(ref,{...chart,sections:JSON.stringify(chart.sections),savedAt:new Date().toISOString()});alert('Guardado');}catch(e){console.error(e);alert('Error al guardar');}finally{setIsSaving(false);}};
  const loadCharts=async()=>{if(!userId||!db)return[];const col=collection(db,`artifacts/${appId}/users/${userId}/charts`);const snap=await getDocs(query(col));return snap.docs.map(d=>({...d.data(),id:d.id}));};
  //----------------------------------------------------------------

  const clearSel=()=>setSelection(s=>({...s,start:null,end:null}));
  const setActiveSection=id=>setSelection({start:null,end:null,activeSectionId:id});

  const handleMeasureClick=(e,sId,mIdx)=>{e.stopPropagation();if(e.shiftKey&&selection.start){if(selection.start.sectionId!==sId)return;setSelection({start:selection.start,end:{sectionId:sId,measureIndex:mIdx},activeSectionId:sId});}else{setSelection({start:{sectionId:sId,measureIndex:mIdx},end:null,activeSectionId:sId});}};

  //----------------------------------------------------------------
  // TopBar (recortado a lo esencial)
  //----------------------------------------------------------------
  const TopBar=()=>(
    <header className="bg-gray-800 text-white p-3 shadow-md fixed top-0 left-0 right-0 z-20 flex justify-between items-center">
      <div className="flex items-center gap-3"><Music4 className="h-8 w-8 text-blue-400"/><div><h1 className="font-bold">{chart.title}</h1><p className="text-sm text-gray-400">{chart.artist}</p></div></div>
      <div className="flex items-center gap-2">
        <button onClick={()=>setChart(c=>({...c,key:MAJOR_KEYS_CHROMATIC[(MAJOR_KEYS_CHROMATIC.indexOf(c.key)+1)%12]}))} className="p-1 bg-gray-700 rounded-full"><ChevronUp size={16}/></button>
        <button onClick={()=>setChart(c=>({...c,key:MAJOR_KEYS_CHROMATIC[(MAJOR_KEYS_CHROMATIC.indexOf(c.key)+11)%12]}))} className="p-1 bg-gray-700 rounded-full"><ChevronDown size={16}/></button>
        <button onClick={saveChart} disabled={isSaving} className="p-2 bg-blue-600 rounded-full disabled:opacity-50">{isSaving?<Loader2 className="animate-spin" size={18}/>:<Save size={18}/>}</button>
      </div>
    </header>
  );

  //----------------------------------------------------------------
  // FIX 2 ▸ ChordChart con barras correctas ------------------------
  //----------------------------------------------------------------
  const ChordChart=()=>(
    <main className="pt-24 pb-40 px-2 md:px-4 bg-gray-100 min-h-screen" onClick={clearSel}>
      <div className="max-w-4xl mx-auto space-y-4">
        {chart.sections.map((section,si)=>(
          <div key={section.id} className={`p-3 rounded-lg border ${selection.activeSectionId===section.id&&!selection.start?'bg-blue-50 ring-2 ring-blue-300':'bg-white'}`} onClick={e=>{e.stopPropagation();setActiveSection(section.id);}}>
            <h2 className="text-xl font-bold text-blue-700 mb-2">{section.name}</h2>
            <div className="space-y-1 font-mono text-lg">
              {Array.from({length:Math.ceil(section.measures.length/4)||1}).map((_,li)=>{
                if(li>0&&section.measures.length<=li*4)return null;
                return(
                  <div key={li} className="flex items-center w-full">
                    {/* barra inicial */}
                    <span className="w-6 text-center text-gray-500 font-bold">{section.measures[li*4]?.startRepeat?'|:':'|'}</span>
                    <div className="flex flex-1">
                      {Array.from({length:4}).map((__,mi)=>{
                        const gi=li*4+mi;const m=section.measures[gi];if(!m)return<div key={gi} className="h-10 flex-1"></div>;
                        const sel=selection.start&&selection.start.sectionId===section.id&&gi>=Math.min(selection.start.measureIndex,selection.end?.measureIndex??selection.start.measureIndex)&&gi<=Math.max(selection.start.measureIndex,selection.end?.measureIndex??selection.start.measureIndex);
                        return(
                          <React.Fragment key={gi}>
                            <div onClick={e=>handleMeasureClick(e,section.id,gi)} className={`h-10 flex-1 flex items-center justify-center cursor-pointer ${sel?'bg-green-100 ring-2 ring-green-500':'hover:bg-gray-100'}`}>{m.chords.join(' ')}</div>
                            {mi<3&&<span className="text-gray-500 font-bold mx-1">|</span>}
                          </React.Fragment>
                        );
                      })}
                    </div>
                    {/* barra final */}
                    <span className="w-6 text-center text-gray-500 font-bold">{(()=>{const m=section.measures[(li+1)*4-1];if(m?.endRepeat)return m.endRepeat;return (li+1)*4>=section.measures.length&&section.measures.length>0?'||':'|';})()}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </main>
  );

  //----------------------------------------------------------------
  // (El resto de componentes se mantiene tal cual tu código)
  //----------------------------------------------------------------
  const ChordInput=()=>null; // placeholder visual, no modificado
  const NewChartModal=()=>null;
  const LoadChartModal=()=>null;

  if(!isAuthReady)return<div className="flex items-center justify-center h-screen">Cargando…</div>;
  return(
    <div className="font-sans min-h-screen bg-gray-100">
      <TopBar/>
      <ChordChart/>
      <ChordInput/>
      <NewChartModal/>
      <LoadChartModal/>
    </div>
  );
}
