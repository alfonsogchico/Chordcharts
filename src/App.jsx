import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy
} from 'firebase/firestore';

// ------------- Firebase init (safe) -------------
// Define VITE_FIREBASE_CONFIG in Vercel → JSON string with apiKey, authDomain, etc.
const firebaseConfig =
  typeof import.meta.env.VITE_FIREBASE_CONFIG !== 'undefined'
    ? JSON.parse(import.meta.env.VITE_FIREBASE_CONFIG)
    : {};

let db = null;
try {
  if (firebaseConfig && firebaseConfig.apiKey) {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
  } else {
    console.warn('Firebase config missing: guardado/carga desactivados');
  }
} catch (e) {
  console.error('Firebase init error', e);
}

// ------------- UI helpers -------------
const StaffLines = () => (
  <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
    {[...Array(5)].map((_, i) => (
      <div key={i} className="border-t border-black/70" />
    ))}
  </div>
);

export default function App() {
  const [chart, setChart] = useState('C | G | Am | F :|x2');
  const [charts, setCharts] = useState([]);

  // ---------- CRUD ----------
  const saveChart = async () => {
    if (!db || !chart.trim()) return;
    await addDoc(collection(db, 'charts'), {
      chart,
      savedAt: Date.now()
    });
    loadCharts();
  };

  const loadCharts = async () => {
    if (!db) return;
    const snap = await getDocs(
      query(collection(db, 'charts'), orderBy('savedAt', 'desc'))
    );
    setCharts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  };

  useEffect(() => {
    loadCharts();
  }, [db]);

  // ---------- Chart parsing ----------
  const measures = chart
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);

  const renderMeasure = (m, i) => {
    const isFirst = i === 0;
    const repeat = /:\|x?\d*$/.test(m); // detect final :| or :|x2 etc.

    const classes = [
      'px-3',
      'min-w-[70px]',
      'text-center',
      'border-black',
      repeat ? 'border-double border-r-4' : 'border-r',
      isFirst ? 'border-l-2' : ''
    ].join(' ');

    return (
      <div key={i} className={classes}>
        {m.replace(/:\|x?\d*$/, '')}
      </div>
    );
  };

  // ---------- Render ----------
  return (
    <div className="max-w-3xl mx-auto mt-10 font-sans px-4">
      <h1 className="text-2xl font-bold mb-4">ChordCharts</h1>

      {/* Editor */}
      <textarea
        rows={4}
        value={chart}
        onChange={(e) => setChart(e.target.value)}
        className="w-full font-mono text-base border border-gray-300 rounded p-2 mb-4"
      />

      <button
        onClick={saveChart}
        className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded mb-6"
      >
        Guardar
      </button>

      {/* Staff */}
      <div className="relative overflow-x-auto">
        <StaffLines />
        <div className="flex border-y-2 border-black bg-white/80 backdrop-blur-sm">
          {measures.map(renderMeasure)}
        </div>
      </div>

      {/* Saved charts */}
      {db && (
        <>
          <h2 className="text-xl font-semibold mt-8 mb-2">Guardados</h2>
          <ul className="space-y-1">
            {charts.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => setChart(c.chart)}
                  className="underline text-blue-700 hover:text-blue-900"
                >
                  {c.chart}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
