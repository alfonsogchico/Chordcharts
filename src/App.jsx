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

// --- Firebase init ---
// Asegúrate de definir VITE_FIREBASE_CONFIG en Vercel Dashboard
// con el objeto JSON de tu proyecto Firebase
const firebaseConfig =
  typeof import.meta.env.VITE_FIREBASE_CONFIG !== 'undefined'
    ? JSON.parse(import.meta.env.VITE_FIREBASE_CONFIG)
    : {};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export default function App() {
  const [chart, setChart] = useState('C | G | Am | F :|x2');
  const [charts, setCharts] = useState([]);

  // --- CRUD ---
  const saveChart = async () => {
    if (!chart.trim()) return;
    await addDoc(collection(db, 'charts'), {
      chart,
      savedAt: Date.now()
    });
    loadCharts();
  };

  const loadCharts = async () => {
    const snap = await getDocs(
      query(collection(db, 'charts'), orderBy('savedAt', 'desc'))
    );
    setCharts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  useEffect(() => {
    loadCharts();
  }, []);

  // --- helpers ---
  const measures = chart
    .split('|')
    .map(s => s.trim())
    .filter(Boolean);

  const renderMeasure = (m, i) => {
    const isFirst = i === 0;
    const repeat = /:\|/.test(m) || /:\|x\d+$/.test(m);
    const style = {
      padding: '0 8px',
      borderRight: repeat ? 'double #000 3px' : '1px solid #000',
      borderLeft: isFirst ? '2px solid #000' : undefined,
      minWidth: 60,
      textAlign: 'center'
    };

    return (
      <div key={i} style={style}>
        {m.replace(/:\|x?\d*$/, '')}
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 800, margin: '40px auto', fontFamily: 'sans-serif' }}>
      <h1>ChordCharts</h1>

      <textarea
        rows={4}
        value={chart}
        onChange={e => setChart(e.target.value)}
        style={{ width: '100%', fontFamily: 'monospace', fontSize: 16 }}
      />

      <button onClick={saveChart} style={{ margin: '12px 0' }}>
        Guardar
      </button>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          borderTop: '2px solid #000',
          borderBottom: '2px solid #000',
          padding: '4px 0'
        }}
      >
        {measures.map(renderMeasure)}
      </div>

      <h2>Guardados</h2>
      <ul>
        {charts.map(c => (
          <li key={c.id}>
            <button
              onClick={() => setChart(c.chart)}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                margin: 0,
                textDecoration: 'underline',
                cursor: 'pointer'
              }}
            >
              {c.chart}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
