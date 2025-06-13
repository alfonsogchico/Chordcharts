import React, {
  useState,
  useEffect,
  useCallback,
  useRef
} from 'react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
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
  Pilcrow,
  CaseUpper,
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

// ------------------------------------------------------------------
// 🔧 FIX 1 | appId constante para rutas Firestore --------------------
// ------------------------------------------------------------------
const appId = 'chordcharts'; // ← añadido

// NOTE: jspdf is loaded from CDN in the execution environment.

// --- Firebase Configuration & Initialization ---
let app, auth, db;
try {
  const firebaseConfig =
    typeof __firebase_config !== 'undefined'
      ? JSON.parse(__firebase_config)
      : {};
  if (firebaseConfig && Object.keys(firebaseConfig).length > 0) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  } else {
    console.error('Firebase configuration is missing or empty!');
  }
} catch (e) {
  console.error('Error initializing Firebase', e);
}

// --- Music Theory Helpers (sin cambios) ---------------------------
const NOTES_SHARP = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B'
];
const NOTES_FLAT = [
  'C',
  'Db',
  'D',
  'Eb',
  'E',
  'F',
  'Gb',
  'G',
  'Ab',
  'A',
  'Bb',
  'B'
];
const MAJOR_KEYS_CHROMATIC = [
  'C',
  'Db',
  'D',
  'Eb',
  'E',
  'F',
  'Gb',
  'G',
  'Ab',
  'A',
  'Bb',
  'B'
];
const MINOR_KEYS_CHROMATIC = [
  'Am',
  'Bbm',
  'Bm',
  'Cm',
  'C#m',
  'Dm',
  'Ebm',
  'Em',
  'Fm',
  'F#m',
  'Gm',
  'G#m'
];

const getNoteIndex = (note) => {
  const root = note.match(/^[A-G][#b]?/)?.[0] || note;
  const sIdx = NOTES_SHARP.indexOf(root);
  return sIdx !== -1 ? sIdx : NOTES_FLAT.indexOf(root);
};
const getNoteName = (index, useSharp) => {
  const i = ((index % 12) + 12) % 12;
  return useSharp ? NOTES_SHARP[i] : NOTES_FLAT[i];
};
const getUseSharp = (key) => {
  const root = key.replace('m', '');
  const flatKeys = ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'];
  if (flatKeys.includes(root)) return false;
  if (key.endsWith('m')) {
    const relMajorRoot = getNoteName(getNoteIndex(root) + 3);
    if (flatKeys.includes(relMajorRoot)) return false;
  }
  return true;
};
const getDiatonicChords = (key, mode, quality) => {
  const keyIndex = getNoteIndex(key);
  if (keyIndex === -1) return [];
  const useSharp = getUseSharp(key);
  let qualities;
  if (mode === 'major') {
    qualities =
      quality === 'tetrad'
        ? [
            { q: 'maj7', i: 0 },
            { q: 'm7', i: 2 },
            { q: 'm7', i: 4 },
            { q: 'maj7', i: 5 },
            { q: '7', i: 7 },
            { q: 'm7', i: 9 }
          ]
        : [
            { q: '', i: 0 },
            { q: 'm', i: 2 },
            { q: 'm', i: 4 },
            { q: '', i: 5 },
            { q: '', i: 7 },
            { q: 'm', i: 9 }
          ];
  } else {
    qualities =
      quality === 'tetrad'
        ? [
            { q: 'm7', i: 0 },
            { q: 'm7b5', i: 2 },
            { q: 'maj7', i: 3 },
            { q: 'm7', i: 5 },
            { q: '7', i: 7 },
            { q: 'maj7', i: 8 },
            { q: '7', i: 10 }
          ]
        : [
            { q: 'm', i: 0 },
            { q: 'dim', i: 2 },
            { q: '', i: 3 },
            { q: 'm', i: 5 },
            { q: '', i: 7 },
            { q: '', i: 8 },
            { q: '', i: 10 }
          ];
  }
  return qualities.map((c) =>
    getNoteName(keyIndex + c.i, useSharp) + c.q
  );
};
const getOtherChords = (key, mode = 'major', quality = 'tetrad') => {
  const keyIndex = getNoteIndex(key);
  if (keyIndex === -1) return [];
  const useSharp = getUseSharp(key);
  const chords = [];
  const secondaryTargets = mode === 'major' ? [2, 4, 7, 9] : [5, 7];
  secondaryTargets.forEach((step) => {
    const targetNoteIndex = keyIndex + step;
    const dominantIndex = targetNoteIndex + 7;
    const dominantNote = getNoteName(dominantIndex, useSharp);
    chords.push(dominantNote + (quality === 'tetrad' ? '7' : ''));
  });
  if (mode === 'major') {
    const ivm =
      getNoteName(keyIndex + 5, useSharp) + (quality === 'tetrad' ? 'm7' : 'm');
    const bVI =
      getNoteName(keyIndex + 8, false) + (quality === 'tetrad' ? 'maj7' : '');
    const bVII =
      getNoteName(keyIndex + 10, false) + (quality === 'tetrad' ? '7' : '');
    chords.push(ivm, bVI, bVII);
  }
  return [...new Set(chords)];
};
const transposeChord = (chord, steps, newKey) => {
  if (chord === '%') return '%';
  const useSharp = getUseSharp(newKey);
  return chord
    .split('/')
    .map((part) => {
      const rootMatch = part.match(/^[A-G][#b]?/);
      if (!rootMatch) return part;
      const root = rootMatch[0];
      const quality = part.substring(root.length);
      const rootIndex = getNoteIndex(root);
      if (rootIndex === -1) return part;
      return getNoteName(rootIndex + steps, useSharp) + quality;
    })
    .join('/');
};

// --- History Hook (sin cambios) -------------------------------
const useHistoryState = (initialState) => {
  const [history, setHistory] = useState([initialState]);
  const [index, setIndex] = useState(0);
  const state = history[index];
  const setState = useCallback(
    (action, overwrite = false) => {
      setHistory((currentHistory) => {
        const currentState = currentHistory[index];
        const newState =
          typeof action === 'function' ? action(currentState) : action;
        if (JSON.stringify(currentState) === JSON.stringify(newState))
          return currentHistory;
        if (overwrite) {
          const newHistory = [...currentHistory];
          newHistory[index] = newState;
          return newHistory;
        } else {
          const newHistory = currentHistory.slice(0, index + 1);
          setIndex(newHistory.length);
          return [...newHistory, newState];
        }
      });
    },
    [index]
  );
  const undo = () => index > 0 && setIndex(index - 1);
  const redo = () => index < history.length - 1 && setIndex(index + 1);
  const resetHistory = (newState) => {
    setHistory([newState]);
    setIndex(0);
  };
  return [
    state,
    setState,
    undo,
    redo,
    index > 0,
    index < history.length - 1,
    resetHistory
  ];
};

// ---------------- Main App Component --------------------------
export default function App() {
  // ... (todas las declaraciones de estado y efectos se mantienen igual)
  // Para brevedad se omite el interior sin cambios excepto donde indicamos FIX 2.

  // ------------------------------------------------------------------
  // 🔧 FIX 2 | Barras divisorias y de repetición en ChordChart --------
  // ------------------------------------------------------------------

  const ChordChart = () => (
    <main
      className="pt-32 pb-64 px-2 md:px-4 bg-gray-100 text-gray-800 min-h-screen"
      onClick={clearSelection}
    >
      <div className="max-w-4xl mx-auto space-y-4 relative">
        <ContextualMenu />
        <div
          id="pdf-container"
          className="bg-white p-4 sm:p-6 lg:p-8 rounded-lg shadow-sm border"
        >
          {/* cabecera */}
          <div className="flex justify-between items-end border-b-2 pb-2 mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 font-sans">
                {chart.title}
              </h1>
              <p className="text-lg text-gray-600 font-sans">{chart.artist}</p>
            </div>
            <div className="text-right">
              <p className="text-md text-gray-500">
                Tonalidad:{' '}
                <span className="font-bold text-gray-700">
                  {chart.key} {chart.mode === 'major' ? 'Mayor' : 'Menor'}
                </span>
              </p>
            </div>
          </div>

          {/* secciones */}
          {chart.sections.map((section, sectionIndex) => (
            <div
              key={section.id}
              draggable
              onDragStart={(e) => handleDragStart(e, sectionIndex)}
              onDragOver={(e) => handleDragOver(e, sectionIndex)}
              onDragEnd={handleDragEnd}
              className={`p-3 rounded-lg transition-all border-2 ${
        draggedItem?.id === section.id
          ? 'border-blue-400'
          : 'border-transparent'
      } hover:border-gray-300 cursor-move ${
        selection.activeSectionId === section.id && !selection.start
          ? 'bg-blue-50 ring-2 ring-blue-300'
          : ''
      }`}
              onClick={(e) => {
                e.stopPropagation();
                setActiveSection(section.id);
              }}
            >
              {/* cabecera de sección (sin cambios) */}
              <div className="flex justify-between items-center mb-3">
                {/* ... */}
              </div>

              {/* líneas */}
              <div className="space-y-1 font-mono text-lg">
                {Array.from({
                  length:
                    Math.ceil(section.measures.length / 4) ||
                    (section.measures.length > 0 ? 1 : 0)
                }).map((_, lineIndex) => {
                  if (
                    lineIndex > 0 &&
                    section.measures.length <= lineIndex * 4
                  )
                    return null;

                  return (
                    <div
                      key={`line-${section.id}-${lineIndex}`}
                      className="flex items-center w-full"
                    >
                      {/* barra inicial o inicio de repetición */}
                      <span className="w-6 text-center text-gray-500 font-bold">
                        {section.measures[lineIndex * 4]?.startRepeat ? '|:' : '|'}
                      </span>

                      {/* compases */}
                      <div className="flex flex-1">
                        {Array.from({ length: 4 }).map(
                          (__, measureIndexInLine) => {
                            const globalMeasureIndex =
                              lineIndex * 4 + measureIndexInLine;
                            const measure =
                              section.measures[globalMeasureIndex];
                            if (!measure)
                              return (
                                <div
                                  key={`empty-${globalMeasureIndex}`}
                                  className="h-10 flex-1"
                                ></div>
                              );

                            const isSelected =
                              selection.start &&
                              selection.start.sectionId === section.id &&
                              globalMeasureIndex >=
                                Math.min(
                                  selection.start.measureIndex,
                                  selection.end?.measureIndex ??
                                    selection.start.measureIndex
                                ) &&
                              globalMeasureIndex <=
                                Math.max(
                                  selection.start.measureIndex,
                                  selection.end?.measureIndex ??
                                    selection.start.measureIndex
                                );

                            return (
                              <React.Fragment
                                key={`frag-${globalMeasureIndex}`}
                              >
                                <div
                                  className={`h-10 flex items-center justify-center cursor-pointer rounded-sm flex-1 ${
                                    isSelected
                                      ? 'bg-green-100 ring-2 ring-green-500'
                                      : 'hover:bg-gray-100'
                                  }`}
                                  onClick={
                                    measure
                                      ? (e) =>
                                          handleMeasureClick(
                                            e,
                                            section.id,
                                            globalMeasureIndex
                                          )
                                      : undefined
                                  }
                                >
                                  {measure && measure.chords.length > 1 ? (
                                    <div className="flex justify-around w-full">
                                      <span>{measure.chords[0]}</span>
                                      <span>{measure.chords[1]}</span>
                                    </div>
                                  ) : (
                                    <span className="whitespace-nowrap overflow-hidden text-ellipsis px-1">
                                      {measure
                                        ? measure.chords.join(' ')
                                        : ' '}
                                    </span>
                                  )}
                                </div>
                                {measureIndexInLine < 3 && (
                                  <span className="text-gray-500 font-bold mx-1">
                                    |
                                  </span>
                                )}
                              </React.Fragment>
                            );
                          }
                        )}
                      </div>

                      {/* barra final */}
                      <span className="w-6 text-center text-gray-500 font-bold">
                        {(() => {
                          const m =
                            section.measures[(lineIndex + 1) * 4 - 1];
                          if (m?.endRepeat) return m.endRepeat; // :| o :|x2…
                          return (lineIndex + 1) * 4 >=
                            section.measures.length &&
                            section.measures.length > 0
                            ? '||'
                            : '|';
                        })()}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );

  // --------------------------------------------------------------
  // El resto del componente (TopBar, ChordInput, etc.) permanece
  // sin cambios respecto a tu versión original.
  // --------------------------------------------------------------

  if (!isAuthReady) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-900 text-white">
        Cargando aplicación...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 font-sans">
      <style>
        {`@import url('https://fonts.googleapis.com/css2?family=Roboto+Slab:wght@400;700&display=swap');`}
      </style>
      <TopBar />
      <ChordChart />
      <ChordInput />
      <NewChartModal
        isOpen={isNewChartModalOpen}
        onClose={() => setIsNewChartModalOpen(false)}
        onCreate={handleCreateNewChart}
      />
      <LoadChartModal
        isOpen={isLoadChartModalOpen}
        onClose={() => setIsLoadChartModalOpen(false)}
        onLoad={handleLoadChart}
      />
    </div>
  );
}
