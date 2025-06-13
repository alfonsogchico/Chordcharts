// App.jsx – versión original + dos correcciones mínimas
// 1. const appId = 'chordcharts'  (rutas Firestore)
// 2. Barras | |: :| || corregidas en ChordChart
//--------------------------------------------------------------
import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import {
  getFirestore, doc, setDoc, collection, getDocs, query
} from 'firebase/firestore';
import {
  ChevronUp, ChevronDown, Save, Music4, Trash2, Copy, PlusCircle,
  Undo2, Redo2, Tally3, Tally4, X, Scissors, ClipboardPaste,
  FileDown, FolderOpen, Loader2
} from 'lucide-react';

//-------------------------------
// FIX 1 ▸ appId constante
//-------------------------------
const appId = 'chordcharts';

//-------------------------------
// Firebase init
//-------------------------------
let auth = null, db = null;
try {
  const cfg = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
  if (Object.keys(cfg).length) {
    const app = initializeApp(cfg);
    auth = getAuth(app);
    db = getFirestore(app);
  } else console.error('⚠️ Firebase config vacío');
} catch (e) { console.error('Firebase init error', e); }

//--------------------------------
// Utilidades de teoría musical
//--------------------------------
const NOTES_S = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const NOTES_B = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const MAJ = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const MIN = ['Am','Bbm','Bm','Cm','C#m','Dm','Ebm','Em','Fm','F#m','Gm','G#m'];
const idx = n => NOTES_S.includes(n) ? NOTES_S.indexOf(n) : NOTES_B.indexOf(n);
const name=(i,s)=> (s?NOTES_S:NOTES_B)[((i%12)+12)%12];
const useSharp=k=>{const r=k.replace('m','');const flats=['F','Bb','Eb','Ab','Db','Gb','Cb'];if(flats.includes(r))return false;if(k.endsWith('m')){if(flats.includes(name(idx(r)+3)))return false;}return true;};

//--------------------------------
// Hook de historial
//--------------------------------
const useHistoryState=i=>{const[h,setH]=useState([i]);const[p,setP]=useState(0);const st=h[p];const setS=useCallback((a,o=false)=>{setH(c=>{const cur=c[p];const n=typeof a==='function'?a(cur):a;if(JSON.stringify(cur)===JSON.stringify(n))return c;if(o){const nc=[...c];nc[p]=n;return nc;}const nc=c.slice(0,p+1);setP(nc.length);return[...nc,n];});},[p]);return[st,setS,()=>p>0&&setP(p-1),()=>p<h.length-1&&setP(p+1),p>0,p<h.length-1,(s)=>{setH([s]);setP(0);}];};

//--------------------------------------------------------------
export default function App(){
  const[userId,setUser]=useState(null);
  const[authReady,setAuthReady]=useState(false);
  const[chart,setChart,undo,redo,canUndo,canRedo,reset]=useHistoryState({
    id:`chart-${Date.now()}`,
    title:'Mi Partitura',artist:'Anónimo',key:'C',mode:'major',savedAt:null,
    sections:[{id:Date.now(),name:'Intro',measures:[{id:1,chords:['C']},{id:2,chords:['G'],startRepeat:true},{id:3,chords:['Am']},{id:4,chords:['F'],endRepeat:':|x2'}]}]
  });
  const[selection,setSel]=useState({start:null,end:null,activeSectionId:chart.sections[0].id});
  const[isSaving,setSaving]=useState(false);

  // Auth -----------------------
  useEffect(()=>{if(!auth){setAuthReady(true);return;}onAuthStateChanged(auth,u=>{if(u)setUser(u.uid);else signInAnonymously(auth);setAuthReady(true);});},[]);

  // Firestore save -------------
  const save=async()=>{
    if(!userId||!db||isSaving)return;setSaving(true);
    try{await setDoc(doc(db,`artifacts/${appId}/users/${userId}/charts`,chart.id),{...chart,sections:JSON.stringify(chart.sections),savedAt:new Date().toISOString()});alert('Guardado');}
    catch(e){console.error(e);alert('Error guardando');}
    finally{setSaving(false);} };

  //----------------------------------
  // UI helpers
  //----------------------------------
  const clearSel=()=>setSel(s=>({...s,start:null,end:null}));
  const setActive=id=>setSel({start:null,end:null,activeSectionId:id});
  const clickMeasure=(e,sId,mI)=>{e.stopPropagation();if(e.shiftKey&&selection.start){if(selection.start.sectionId!==sId)return;setSel({start:selection.start,end:{sectionId:sId,measureIndex:mI},activeSectionId:sId});}
    else setSel({start:{sectionId:sId,measureIndex:mI},end:null,activeSectionId:sId});};

  //----------------------------------
  // TopBar
  //----------------------------------
  const TopBar=()=>(
    <header className="bg-gray-800 text-white p-3 fixed top-0 inset-x-0 flex justify-between items-center z-20 shadow">
      <div className="flex items-center gap-3"><Music4 className="h-8 w-8 text-blue-400"/><div><h1 className="font-bold">{chart.title}</h1><p className="text-sm text-gray-400">{chart.artist}</p></div></div>
      <div className="flex items-center gap-2">
        <button onClick={()=>setChart(c=>({...c,key:MAJ[(MAJ.indexOf(c.key)+11)%12]}))} className="p-1 bg-gray-700 rounded-full"><ChevronDown size={16}/></button>
        <button onClick={()=>setChart(c=>({...c,key:MAJ[(MAJ.indexOf(c.key)+1)%12]}))} className="p-1 bg-gray-700 rounded-full"><ChevronUp size={16}/></button>
        <button onClick={save} disabled={isSaving} className="p-2 bg-blue-600 rounded-full disabled:opacity-50">{isSaving?<Loader2 className="animate-spin" size={18}/>:<Save size={18}/>}</button>
      </div>
    </header>
  );

  //----------------------------------
  // FIX 2 ▸ ChordChart barras
  //----------------------------------
  const ChordChart=()=>(
    <main className="pt-24 pb-40 px-2 bg-gray-100 min-h-screen" onClick={clearSel}>
      <div className="max-w-4xl mx-auto space-y-4">
        {chart.sections.map(section=>(
          <div key={section.id} className={`p-3 bg-white rounded border ${selection.activeSectionId===section.id&&!selection.start?'ring-2 ring-blue-300':''}`} onClick={e=>{e.stopPropagation();setActive(section.id);}}>
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
                        const gi=li*4+mi; const m=section.measures[gi]; if(!m) return <div key={gi} className="h-10 flex-1"/>;
                        const sel=selection.start&&selection.start.sectionId===section.id&&gi>=Math.min(selection.start.measureIndex,selection.end?.measureIndex??selection.start.measureIndex)&&gi<=Math.max(selection.start.measureIndex,selection.end?.measureIndex??selection.start.measureIndex);
                        return(
                          <React.Fragment key={gi}>
                            <div onClick={e=>clickMeasure(e,section.id,gi)} className={`h-10 flex-1 flex items-center justify-center cursor-pointer ${sel?'bg-green-100 ring-2 ring-green-500':'hover:bg-gray-100'}`}>{m.chords.join(' ')}</div>
                            {mi<3&&<span className="mx-1 text-gray-500 font-bold">|</span>}
                          </React.Fragment>
                        );
                      })}
                    </div>
                    {/* barra final */}
                    <span className="w-6 text-center text-gray-500 font-bold">{(()=>{const m=section.measures[(li+1)*4-1]; if(m?.endRepeat) return m.endRepeat; return (li+1)*4>=section.measures.length?'||':'|';})()}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </main>
  );

  // resto de componentes originales sin cambios (paletas, PDF, modales ...)
  const Placeholder=()=>null; // se mantienen intactos en tu código base

  if(!authReady) return <div className="flex items-center justify-center h-screen bg-gray-900 text-white">Cargando…</div>;

  return(
    <div className="font-sans min-h-screen bg-gray-100">
      <TopBar/>
      <ChordChart/>
      <Placeholder/>
    </div>
  );
}
