import React, { useState, useEffect, useCallback, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, query, deleteDoc } from 'firebase/firestore';
import { ChevronUp, ChevronDown, Save, Music4, Trash2, Copy, PlusCircle, Pilcrow, CaseUpper, Undo2, Tally3, Tally4, X, Scissors, ClipboardPaste, Redo2, FileDown, FolderOpen, Loader2, CheckCircle, XCircle, LogOut } from 'lucide-react';

// NOTA: jspdf se carga desde un CDN en el entorno de ejecución.

// --- Configuración e inicialización de Firebase ---
let app, auth, db;
let appId; // Se definirá después de la configuración

try {
    let firebaseConfig;

    // Prioridad 1: Entorno Canvas (usa variables globales inyectadas)
    if (typeof __firebase_config !== 'undefined' && __firebase_config && __firebase_config !== "{}") {
        firebaseConfig = JSON.parse(__firebase_config);
        appId = typeof __app_id !== 'undefined' ? __app_id : firebaseConfig.appId;
    }
    // Prioridad 2: Entorno VITE (Vercel)
    else if (import.meta.env.VITE_FIREBASE_API_KEY) {
        firebaseConfig = {
            apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
            authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
            projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
            storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
            messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
            appId: import.meta.env.VITE_FIREBASE_APP_ID,
        };
        appId = firebaseConfig.projectId;
    }

    if (firebaseConfig && Object.keys(firebaseConfig).length > 0) {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
        if (!appId) appId = firebaseConfig.projectId || 'default-app-id'; // Asegura que appId tenga un valor
    } else {
        console.error("FATAL: No se encontró la configuración de Firebase. Revisa la configuración de Environment Variables en Vercel (con prefijo VITE_) y haz un 'Redeploy'.");
        appId = 'default-app-id'; // Fallback
    }
} catch (e) {
    console.error("Error al inicializar Firebase", e);
    appId = 'default-app-id'; // Fallback
}


// --- Ayudantes de Teoría Musical ---
const NOTES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const MAJOR_KEYS_CHROMATIC = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const MINOR_KEYS_CHROMATIC = ['Am', 'Bbm', 'Bm', 'Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m'];

const getNoteIndex = (note) => { const root = note.match(/^[A-G][#b]?/)?.[0] || note; const sIdx = NOTES_SHARP.indexOf(root); return sIdx !== -1 ? sIdx : NOTES_FLAT.indexOf(root); };
const getNoteName = (index, useSharp) => { const i = (index % 12 + 12) % 12; return useSharp ? NOTES_SHARP[i] : NOTES_FLAT[i]; };
const getUseSharp = (key) => { const root = key.replace('m', ''); const flatKeys = ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb']; if (flatKeys.includes(root)) return false; if (key.endsWith('m')) { const relMajorRoot = getNoteName(getNoteIndex(root) + 3); if (flatKeys.includes(relMajorRoot)) return false; } return true; };
const getDiatonicChords = (key, mode, quality) => { const keyIndex = getNoteIndex(key); if (keyIndex === -1) return []; const useSharp = getUseSharp(key); let qualities; if (mode === 'major') { qualities = quality === 'tetrad' ? [{q:'maj7',i:0},{q:'m7',i:2},{q:'m7',i:4},{q:'maj7',i:5},{q:'7',i:7},{q:'m7',i:9}] : [{q:'',i:0},{q:'m',i:2},{q:'m',i:4},{q:'',i:5},{q:'7',i:7},{q:'m',i:9}]; } else { qualities = quality === 'tetrad' ? [{q:'m7',i:0},{q:'m7b5',i:2},{q:'maj7',i:3},{q:'m7',i:5},{q:'7',i:7},{q:'maj7',i:8},{q:'7',i:10}] : [{q:'m',i:0},{q:'dim',i:2},{q:'',i:3},{q:'m',i:5},{q:'',i:7},{q:'',i:8},{q:'',i:10}]; } return qualities.map(c => getNoteName(keyIndex + c.i, useSharp) + c.q); };
const getOtherChords = (key, mode = 'major', quality = 'tetrad') => { const keyIndex = getNoteIndex(key); if (keyIndex === -1) return []; const useSharp = getUseSharp(key); const chords = []; const secondaryTargets = mode === 'major' ? [2, 4, 7, 9] : [5, 7]; secondaryTargets.forEach(step => { const targetNoteIndex = keyIndex + step; const dominantIndex = targetNoteIndex + 7; const dominantNote = getNoteName(dominantIndex, useSharp); chords.push(dominantNote + (quality === 'tetrad' ? '7' : '')); }); if (mode === 'major') { const ivm = getNoteName(keyIndex + 5, useSharp) + (quality === 'tetrad' ? 'm7' : 'm'); const bVI = getNoteName(keyIndex + 8, false) + (quality === 'tetrad' ? 'maj7' : ''); const bVII = getNoteName(keyIndex + 10, false) + (quality === 'tetrad' ? '7' : ''); chords.push(ivm, bVI, bVII); } return [...new Set(chords)]; };
const transposeChord = (chord, steps, newKey) => { if (chord === '%') return '%'; const useSharp = getUseSharp(newKey); return chord.split('/').map(part => { const rootMatch = part.match(/^[A-G][#b]?/); if (!rootMatch) return part; const root = rootMatch[0]; const quality = part.substring(root.length); const rootIndex = getNoteIndex(root); if (rootIndex === -1) return part; return getNoteName(rootIndex + steps, useSharp) + quality; }).join('/'); };

// --- Hook de Historial ---
const useHistoryState = (initialState) => {
    const [history, setHistory] = useState([initialState]);
    const [index, setIndex] = useState(0);
    const state = history[index];
    const setState = useCallback((action, overwrite = false) => {
        setHistory(currentHistory => {
            const currentState = currentHistory[index];
            const newState = typeof action === 'function' ? action(currentState) : action;
            if (JSON.stringify(currentState) === JSON.stringify(newState)) return currentHistory;
            if (overwrite) {
                const newHistory = [...currentHistory]; newHistory[index] = newState; return newHistory;
            } else {
                const newHistory = currentHistory.slice(0, index + 1); setIndex(newHistory.length); return [...newHistory, newState];
            }
        });
    }, [index]);
    const undo = () => index > 0 && setIndex(index - 1);
    const redo = () => index < history.length - 1 && setIndex(index + 1);
    const resetHistory = (newState) => { setHistory([newState]); setIndex(0); };
    return [state, setState, undo, redo, index > 0, index < history.length - 1, resetHistory];
};

// --- Componente Principal de la App ---
export default function App() {
    const [user, setUser] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [chart, setChart, undoChart, redoChart, canUndo, canRedo, resetHistory] = useHistoryState({
        id: `chart-${Date.now()}`, title: 'Mi Partitura', artist: 'Anónimo',
        key: 'C', mode: 'major', savedAt: null,
        sections: [{ id: Date.now(), name: 'Intro', measures: [{id:1, chords:['C']}, {id:2, chords:['G'], startRepeat:true}, {id:3, chords:['Am']}, {id:4, chords:['F'], endRepeat:':|x2'}] }]
    });
    const [editingSection, setEditingSection] = useState(null);
    const [draggedItem, setDraggedItem] = useState(null);
    const [selection, setSelection] = useState({ start: null, end: null, activeSectionId: chart.sections[0]?.id });
    const [clipboard, setClipboard] = useState([]);
    const [activePalette, setActivePalette] = useState('diatonic');
    const [chordMode, setChordMode] = useState('tetrad');
    const [isNewChartModalOpen, setIsNewChartModalOpen] = useState(false);
    const [isLoadChartModalOpen, setIsLoadChartModalOpen] = useState(false);
    const [isDoubleChordMode, setIsDoubleChordMode] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [pdfScriptsLoaded, setPdfScriptsLoaded] = useState(false);
    const [notification, setNotification] = useState({ show: false, message: '', type: 'success' });

    // --- Efectos ---
    useEffect(() => { const scripts = [ 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js' ]; let loadedCount = 0; scripts.forEach(src => { if (document.querySelector(`script[src="${src}"]`)) { loadedCount++; if (loadedCount === scripts.length) setPdfScriptsLoaded(true); return; } const script = document.createElement('script'); script.src = src; script.async = true; script.onload = () => { loadedCount++; if (loadedCount === scripts.length) setPdfScriptsLoaded(true); }; document.body.appendChild(script); }); }, []);
    
    useEffect(() => {
        if (!auth) {
            setIsAuthReady(true);
            return;
        }
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                setUser(currentUser);
            } else {
                setUser(null);
                if (typeof __initial_auth_token === 'undefined') {
                    await signInAnonymously(auth).catch(e => console.error("Fallo el inicio de sesión anónimo de fallback:", e));
                }
            }
            setIsAuthReady(true);
        });

        (async () => {
            const token = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
            if (token && !auth.currentUser) {
                try {
                    await signInWithCustomToken(auth, token);
                } catch (error) {
                    console.error("Error en la autenticación con token personalizado:", error);
                }
            }
        })();

        return () => unsubscribe();
    }, []);


    useEffect(() => { if (chart && chart.sections.length > 0 && selection) { const activeSectionExists = chart.sections.some(s => s.id === selection.activeSectionId); if (!activeSectionExists) { setSelection(s => ({...s, activeSectionId: chart.sections[0].id})); } } }, [chart, selection.activeSectionId]);
    
    // --- Funciones de Lógica de Negocio ---
    const showNotification = (message, type = 'success', duration = 3000) => {
        setNotification({ show: true, message, type });
        setTimeout(() => setNotification(n => ({ ...n, show: false })), duration);
    };

    const handleSignInWithGoogle = async () => {
        if (!auth) return;
        const provider = new GoogleAuthProvider();
        try {
            await signInWithPopup(auth, provider);
            showNotification('¡Sesión iniciada con éxito!', 'success');
        } catch (error) {
            console.error("Error al iniciar sesión con Google:", error);
            if (error.code === 'auth/unauthorized-domain') {
                showNotification('Error: Dominio no autorizado. Revisa la configuración de Firebase.', 'error', 6000);
            } else {
                showNotification('No se pudo iniciar sesión con Google.', 'error');
            }
        }
    };

    const handleSignOut = async () => {
        if (!auth) return;
        try {
            await signOut(auth);
            resetHistory({ id: `chart-${Date.now()}`, title: 'Mi Partitura', artist: 'Anónimo', key: 'C', mode: 'major', savedAt: null, sections: [{ id: Date.now(), name: 'Intro', measures: [] }] });
            showNotification('Sesión cerrada correctamente.', 'success');
        } catch (error) {
            console.error("Error al cerrar sesión:", error);
            showNotification('No se pudo cerrar la sesión.', 'error');
        }
    };

    const handleSaveChart = async () => { 
        if (!user || !db || isSaving) {
            if (!user) showNotification("Necesitas iniciar sesión para guardar.", "error");
            return;
        }; 
        setIsSaving(true); 
        try { 
            const savedAt = new Date().toISOString(); 
            const chartToSave = { ...chart, savedAt, sections: JSON.stringify(chart.sections) }; 
            const chartRef = doc(db, `artifacts/${appId}/users/${user.uid}/charts`, chartToSave.id); 
            await setDoc(chartRef, chartToSave); 
            setChart(p => ({...p, savedAt}), true); 
            showNotification("¡Partitura guardada con éxito!", "success");
        } catch(error) { 
            console.error("Error al guardar la partitura: ", error); 
            showNotification("Ha ocurrido un error al guardar la partitura.", "error");
        } finally { 
            setIsSaving(false); 
        } 
    };

    const handleLoadChart = (loadedChart) => { const chartWithParsedSections = { ...loadedChart, sections: typeof loadedChart.sections === 'string' ? JSON.parse(loadedChart.sections) : loadedChart.sections }; resetHistory(chartWithParsedSections); setSelection({ start: null, end: null, activeSectionId: chartWithParsedSections.sections[0]?.id }); setIsLoadChartModalOpen(false); };
    
    const handleExportPDF = async () => {
        if (isExporting || !pdfScriptsLoaded) { if (!isExporting) showNotification('Las librerías de exportación no se han cargado. Por favor, espere.', 'error'); return; }
        setIsExporting(true);
        try {
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            
            pdf.setFont('helvetica', 'bold');
            
            const MARGIN = 15;
            let y = MARGIN;

            pdf.setFontSize(24); pdf.text(chart.title, MARGIN, y); y += 10;
            pdf.setFont('helvetica', 'normal'); pdf.setFontSize(14); pdf.text(chart.artist, MARGIN, y); y += 5;
            pdf.setFontSize(10); pdf.setTextColor(100); pdf.text(`Tonalidad: ${chart.key} ${chart.mode === 'major' ? 'Mayor' : 'Menor'}`, MARGIN, y); y += 15;

            const CHORD_FONT_SIZE = 12; const SECTION_FONT_SIZE = 14; const LINE_HEIGHT = 16; const SECTION_SPACING = 12;
            const CONTENT_WIDTH = pdf.internal.pageSize.getWidth() - MARGIN * 2; const MEASURE_WIDTH = CONTENT_WIDTH / 4;

            for (const section of chart.sections) {
                if (section.measures.length === 0) continue;
                if (y > pdf.internal.pageSize.getHeight() - MARGIN * 2) { pdf.addPage(); y = MARGIN; }
                pdf.setFont('helvetica', 'bold'); pdf.setFontSize(SECTION_FONT_SIZE); pdf.setTextColor(0); pdf.text(section.name, MARGIN, y); y += LINE_HEIGHT;
                
                pdf.setFont('helvetica', 'bold'); pdf.setFontSize(CHORD_FONT_SIZE);

                for (let i = 0; i < section.measures.length; i += 4) {
                    if (y > pdf.internal.pageSize.getHeight() - MARGIN - 5) { pdf.addPage(); y = MARGIN; }
                    const lineMeasures = section.measures.slice(i, i + 4);
                    let x = MARGIN;
                    const measureYPos = y - LINE_HEIGHT * 0.7;

                    lineMeasures.forEach((measure, j) => {
                        const startBarX = x; const endBarX = x + MEASURE_WIDTH;
                        pdf.text(measure.chords.join('  '), startBarX + 3, y - 2);
                        if (j === 0) {
                            if (measure.startRepeat) {
                                pdf.setLineWidth(1); pdf.line(startBarX, measureYPos, startBarX, y);
                                pdf.setLineWidth(0.2); pdf.line(startBarX+0.5, measureYPos, startBarX+0.5, y);
                                pdf.circle(startBarX + 1.5, y - LINE_HEIGHT * 0.5, 0.4, 'F');
                                pdf.circle(startBarX + 1.5, y - LINE_HEIGHT * 0.3, 0.4, 'F');
                            } else {
                                const isFirstMeasureOfSection = i + j === 0;
                                pdf.setLineWidth(isFirstMeasureOfSection ? 1.2 : 0.2);
                                pdf.line(startBarX, measureYPos, startBarX, y);
                            }
                        }
                        if (measure.endRepeat) {
                            const repeatText = measure.endRepeat === true ? '' : String(measure.endRepeat).substring(2);
                            pdf.setLineWidth(0.2); pdf.line(endBarX-0.5, measureYPos, endBarX-0.5, y);
                            pdf.setLineWidth(1); pdf.line(endBarX, measureYPos, endBarX, y);
                            pdf.circle(endBarX - 1.5, y - LINE_HEIGHT * 0.5, 0.4, 'F');
                            pdf.circle(endBarX - 1.5, y - LINE_HEIGHT * 0.3, 0.4, 'F');
                            if (repeatText) { pdf.setFontSize(10); pdf.text(repeatText, endBarX - 6, y - LINE_HEIGHT * 0.75); pdf.setFontSize(CHORD_FONT_SIZE); }
                        } else {
                            const isLastMeasureOfSection = i + j === section.measures.length - 1;
                            if (isLastMeasureOfSection) {
                                pdf.setLineWidth(1); pdf.line(endBarX, measureYPos, endBarX, y);
                                pdf.setLineWidth(0.2); pdf.line(endBarX-0.5, measureYPos, endBarX-0.5, y);
                            } else {
                                pdf.setLineWidth(0.2); pdf.line(endBarX, measureYPos, endBarX, y);
                            }
                        }
                        x += MEASURE_WIDTH;
                    });
                    y += LINE_HEIGHT;
                }
                y += SECTION_SPACING;
            }
            pdf.save(`${chart.title.replace(/ /g, '_')}.pdf`);
        } catch (error) { console.error("Error en exportación PDF:", error); showNotification("Ocurrió un error al generar el PDF.", "error"); } 
        finally { setIsExporting(false); }
    };

    const handleTranspose = (steps) => setChart(p => { const keyOrder = p.mode === 'major' ? MAJOR_KEYS_CHROMATIC : MINOR_KEYS_CHROMATIC; const currentKeyIndex = keyOrder.indexOf(p.key); if (currentKeyIndex === -1) return p; const newKeyIndex = (currentKeyIndex + steps + keyOrder.length) % keyOrder.length; const newKey = keyOrder[newKeyIndex]; const transposedChart = JSON.parse(JSON.stringify(p)); transposedChart.key = newKey; transposedChart.sections.forEach(s => { s.measures = s.measures.map(m => ({...m, chords: m.chords.map(c => transposeChord(c, steps, newKey))})); }); return transposedChart; });
    const handleCreateNewChart = (newData) => { resetHistory({ id: `chart-${Date.now()}`, title: newData.title, artist: newData.artist, key: newData.key, mode: newData.mode, savedAt: null, sections: [{ id: Date.now(), name: 'Intro', measures: [] }] }); setIsNewChartModalOpen(false); };
    const handleRenameSection = (id, newName) => { setChart(p => ({ ...p, sections: p.sections.map(s => s.id === id ? { ...s, name: newName } : s) })); setEditingSection(null); };
    const handleDragStart = (e, index) => setDraggedItem(chart.sections[index]);
    const handleDragOver = (e, index) => { e.preventDefault(); const draggedOverItem = chart.sections[index]; if (draggedItem === draggedOverItem) return; let items = chart.sections.filter(item => item !== draggedItem); items.splice(index, 0, draggedItem); setChart(p => ({ ...p, sections: items })); };
    const handleDragEnd = () => setDraggedItem(null);
    const handleAddSection = (index) => setChart(p => { const newSections = [...p.sections]; newSections.splice(index + 1, 0, { id: Date.now(), name: 'Nueva Sección', measures: []}); return {...p, sections: newSections}; });
    const handleDuplicateSection = (index) => setChart(p => { const newSections = [...p.sections]; const sectionToCopy = p.sections[index]; newSections.splice(index + 1, 0, { ...sectionToCopy, id: Date.now(), name: `${sectionToCopy.name} (Copia)` }); return {...p, sections: newSections}; });
    const handleDeleteSection = (id) => setChart(p => { let newSections = p.sections.filter(s => s.id !== id); if(newSections.length === 0) newSections = [{id: Date.now(), name: 'Intro', measures: []}]; return {...p, sections: newSections}; });
    const handleMeasureClick = (e, sectionId, measureIndex) => { e.stopPropagation(); if (e.shiftKey && selection.start) { if(selection.start.sectionId !== sectionId) return; setSelection({ ...selection, end: { sectionId, measureIndex } }); } else { setSelection({ start: { sectionId, measureIndex }, end: null, activeSectionId: sectionId }); } };
    const clearSelection = () => setSelection({ start: null, end: null, activeSectionId: selection.activeSectionId });
    const setActiveSection = (sectionId) => setSelection({ start: null, end: null, activeSectionId: sectionId });
    const handleInsertChord = (chordOrSymbol) => { const isSymbol = chordOrSymbol.includes(':') || chordOrSymbol.includes('|'); if (isSymbol) { if (!selection.start) { showNotification("Seleccione un compás para aplicar el símbolo.", "error"); return; } setChart(p => { const nc = JSON.parse(JSON.stringify(p)); const { sectionId, measureIndex } = selection.start; const section = nc.sections.find(s => s.id === sectionId); const measure = section.measures[measureIndex]; if (chordOrSymbol === '|:') measure.startRepeat = !measure.startRepeat; else if (chordOrSymbol.startsWith(':|')) measure.endRepeat = measure.endRepeat === chordOrSymbol ? false : chordOrSymbol; else if (chordOrSymbol === '|' || chordOrSymbol === '||') { measure.startRepeat = false; measure.endRepeat = false; if(chordOrSymbol === '||') measure.endRepeat = '||'; } return nc; }); return; } setChart(p => { const nc = JSON.parse(JSON.stringify(p)); const sId = selection.start?.sectionId || selection.activeSectionId; const section = nc.sections.find(s => s.id === sId); if (!section) return p; const getPrevMeasureOnLine = (measures, currentIndex) => (currentIndex % 4 === 0 || currentIndex === 0) ? null : measures[currentIndex - 1]; if (selection.start) { const { measureIndex } = selection.start; const measure = section.measures[measureIndex]; if (isDoubleChordMode && measure.chords.length < 2) { measure.chords.push(chordOrSymbol); } else { const prevM = getPrevMeasureOnLine(section.measures, measureIndex); const prevChord = prevM?.chords[0]; measure.chords = (prevM?.chords.length === 1 && prevChord === chordOrSymbol) ? ['%'] : [chordOrSymbol]; } const nextI = measureIndex + 1; if (nextI < section.measures.length) setSelection(s => ({...s, start: {sectionId: sId, measureIndex: nextI}, end: null})); else clearSelection(); } else { const lastI = section.measures.length; const prevM = getPrevMeasureOnLine(section.measures, lastI); if (isDoubleChordMode && section.measures.length > 0 && section.measures[lastI - 1].chords.length < 2) { section.measures[lastI - 1].chords.push(chordOrSymbol); } else { const newChords = (prevM?.chords.length === 1 && prevM.chords[0] === chordOrSymbol) ? ['%'] : [chordOrSymbol]; section.measures.push({id: Date.now(), chords: newChords}); } } if(isDoubleChordMode) setIsDoubleChordMode(false); return nc; }); };
    const handleContextAction = (action) => { if (!selection.start) return; const { start, end } = selection; const endPos = end || start; const sectionIndex = chart.sections.findIndex(s => s.id === start.sectionId); const startIndex = Math.min(start.measureIndex, endPos.measureIndex); const endIndex = Math.max(start.measureIndex, endPos.measureIndex); setChart(p => { let nc = JSON.parse(JSON.stringify(p)); let section = nc.sections[sectionIndex]; if (action === 'copy' || action === 'cut') setClipboard(section.measures.slice(startIndex, endIndex + 1)); if (action === 'cut' || action === 'delete') section.measures.splice(startIndex, endIndex - startIndex + 1); if (action === 'paste' && clipboard.length > 0) section.measures.splice(startIndex + 1, 0, ...clipboard); return nc; }); clearSelection(); };

    // --- Componentes de UI ---
    const Notification = ({ message, type, show }) => {
        if (!show) return null;
        const baseClasses = "fixed top-24 right-4 p-4 rounded-lg shadow-xl text-white z-[100] transition-all transform flex items-center gap-3";
        const typeClasses = type === 'success' ? 'bg-green-600' : 'bg-red-600';
        return (
            <div className={`${baseClasses} ${typeClasses} ${show ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}`}>
                {type === 'success' ? <CheckCircle size={20} /> : <XCircle size={20} />}
                <span>{message}</span>
            </div>
        );
    };

    const TopBar = () => (
        <header className="bg-gray-800 text-white p-3 shadow-md fixed top-0 left-0 right-0 z-20 flex items-center justify-between flex-wrap gap-y-2">
            <div className="flex items-center gap-4">
                <Music4 className="h-8 w-8 text-blue-400" />
                <div>
                    <h1 className="text-lg font-bold">{chart.title}</h1>
                    <p className="text-sm text-gray-400">{chart.artist}</p>
                </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
                <div className="text-center">
                    <span className="text-xs text-gray-400">TRANSPORTE</span>
                    <div className="flex items-center gap-1 bg-gray-700 px-2 py-1 rounded-md">
                        <button onClick={() => handleTranspose(-1)} className="p-1 rounded-full hover:bg-gray-600"><ChevronDown className="h-4 w-4" /></button>
                        <span className="font-bold text-lg w-12 text-center">{chart.key}</span>
                        <button onClick={() => handleTranspose(1)} className="p-1 rounded-full hover:bg-gray-600"><ChevronUp className="h-4 w-4" /></button>
                    </div>
                </div>
                <button onClick={() => setIsNewChartModalOpen(true)} className="p-2 bg-gray-700 rounded-full hover:bg-gray-600 flex items-center justify-center h-10 w-10" title="Nueva Partitura"><PlusCircle size={20}/></button>
                <button onClick={() => setIsLoadChartModalOpen(true)} disabled={!user} className="p-2 bg-gray-700 rounded-full hover:bg-gray-600 flex items-center justify-center h-10 w-10 disabled:opacity-50" title="Cargar Partitura"><FolderOpen size={20}/></button>
                <button onClick={handleExportPDF} disabled={isExporting} className="p-2 bg-gray-700 rounded-full hover:bg-gray-600 flex items-center justify-center h-10 w-10 disabled:opacity-50" title="Exportar a PDF">{isExporting ? <Loader2 className="animate-spin" size={20}/> : <FileDown size={20}/>}</button>
                <button onClick={handleSaveChart} disabled={isSaving || !user} className="p-2 bg-blue-600 rounded-full hover:bg-blue-500 transition-colors h-10 w-10 flex items-center justify-center disabled:opacity-50" title="Guardar">{isSaving ? <Loader2 className="animate-spin" size={20}/> : <Save className="h-5 w-5" />}</button>
                <div className="border-l border-gray-600 h-8 mx-2"></div>
                {user && !user.isAnonymous ? (
                    <div className="flex items-center gap-2">
                        <img src={user.photoURL || `https://placehold.co/32x32/667eea/ffffff?text=${user.displayName?.[0] || 'U'}`} alt="User Avatar" className="h-8 w-8 rounded-full" />
                        <span className="text-sm font-medium hidden sm:inline">{user.displayName}</span>
                        <button onClick={handleSignOut} className="p-2 bg-red-600 rounded-full hover:bg-red-500 transition-colors h-10 w-10 flex items-center justify-center" title="Cerrar sesión"><LogOut size={20} /></button>
                    </div>
                ) : (
                    <button onClick={handleSignInWithGoogle} className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2">
                        <svg className="w-5 h-5" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24s8.955,20,20,20s20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"></path><path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"></path><path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.222,0-9.618-3.317-11.28-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"></path><path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571l6.19,5.238C42.021,35.846,44,30.138,44,24C44,22.659,43.862,21.35,43.611,20.083z"></path></svg>
                        <span>Iniciar sesión</span>
                    </button>
                )}
            </div>
        </header>
    );
    
    const ChordChart = () => {
        const measuresPerLine = 4;
        return (
            <main className="pt-48 sm:pt-32 pb-64 px-2 md:px-4 bg-gray-100 text-gray-800 min-h-screen" onClick={clearSelection}>
                <div className="max-w-4xl mx-auto space-y-4 relative">
                    <ContextualMenu />
                    <div id="pdf-container" className="bg-white p-4 sm:p-6 lg:p-8 rounded-lg shadow-sm border">
                        <div className="flex justify-between items-end border-b-2 pb-2 mb-4">
                            <div><h1 className="text-3xl font-bold text-gray-800 font-sans">{chart.title}</h1><p className="text-lg text-gray-600 font-sans">{chart.artist}</p></div>
                            <div className="text-right"><p className="text-md text-gray-500">Tonalidad: <span className="font-bold text-gray-700">{chart.key} {chart.mode === 'major' ? 'Mayor' : 'Menor'}</span></p></div>
                        </div>
                        {chart.sections.map((section, sectionIndex) => (
                            <div key={section.id} draggable onDragStart={(e) => handleDragStart(e, sectionIndex)} onDragOver={(e) => handleDragOver(e, sectionIndex)} onDragEnd={handleDragEnd} className={`p-3 rounded-lg transition-all border-2 ${draggedItem?.id === section.id ? 'border-blue-400' : 'border-transparent'} hover:border-gray-300 cursor-move ${selection.activeSectionId === section.id && !selection.start ? 'bg-blue-50 ring-2 ring-blue-300' : ''}`} onClick={(e) => { e.stopPropagation(); setActiveSection(section.id); }}>
                                <div className="flex justify-between items-center mb-3">
                                    {editingSection?.id === section.id ? (<input type="text" value={editingSection.name} onChange={(e) => setEditingSection({ ...editingSection, name: e.target.value })} onBlur={() => handleRenameSection(section.id, editingSection.name)} onKeyDown={(e) => { if (e.key === 'Enter') handleRenameSection(section.id, editingSection.name); }} list="section-names" className="text-xl font-bold text-blue-700 bg-blue-50 px-3 py-1 rounded-md border-blue-400 border" autoFocus onClick={e => e.stopPropagation()} />) : (<h2 onClick={(e) => { e.stopPropagation(); setEditingSection({ id: section.id, name: section.name }) }} className="text-xl font-bold text-blue-700 bg-gray-100 px-3 py-1 rounded-md inline-block cursor-pointer hover:bg-gray-200">{section.name}</h2>)}
                                    <datalist id="section-names"><option value="Intro"/><option value="Verse"/><option value="Chorus"/><option value="Bridge"/><option value="Solo"/><option value="Outro"/><option value="Interlude"/></datalist>
                                    <div className="flex items-center gap-2 section-buttons">
                                        <button onClick={(e) => { e.stopPropagation(); handleAddSection(sectionIndex) }} title="Añadir sección" className="p-1 text-gray-400 hover:text-blue-600"><PlusCircle size={18} /></button>
                                        <button onClick={(e) => { e.stopPropagation(); handleDuplicateSection(sectionIndex) }} title="Duplicar sección" className="p-1 text-gray-400 hover:text-blue-600"><Copy size={18} /></button>
                                        <button onClick={(e) => { e.stopPropagation(); handleDeleteSection(section.id) }} title="Eliminar sección" className="p-1 text-gray-400 hover:text-red-600"><Trash2 size={18} /></button>
                                    </div>
                                </div>
                                <div className="space-y-1 font-mono text-lg">
                                    {Array.from({ length: Math.ceil(section.measures.length / measuresPerLine) || (section.measures.length === 0 ? 1 : 0) }).map((_, lineIndex) => {
                                        const isLastLineOfSection = (lineIndex + 1) * measuresPerLine >= section.measures.length;
                                        if (lineIndex > 0 && section.measures.length <= lineIndex * measuresPerLine) return null;

                                        return (
                                            <div key={`line-${section.id}-${lineIndex}`} className="flex items-stretch w-full">
                                                <div className="w-6 flex-shrink-0 flex items-center justify-center font-bold text-lg text-gray-600">
                                                    {section.measures[lineIndex * measuresPerLine]?.startRepeat ? '|:' : '|'}
                                                </div>
                                                <div className="flex flex-1">
                                                    {Array.from({ length: measuresPerLine }).map((__, measureIndexInLine) => {
                                                        const globalMeasureIndex = lineIndex * measuresPerLine + measureIndexInLine;
                                                        if (globalMeasureIndex >= section.measures.length) {
                                                            return <div key={`empty-${globalMeasureIndex}`} className="flex-1 h-12"></div>;
                                                        }
                                                        const measure = section.measures[globalMeasureIndex];
                                                        const nextMeasure = section.measures[globalMeasureIndex + 1];
                                                        const isSelected = selection.start && selection.start.sectionId === section.id && globalMeasureIndex >= Math.min(selection.start.measureIndex, selection.end?.measureIndex ?? selection.start.measureIndex) && globalMeasureIndex <= Math.max(selection.start.measureIndex, selection.end?.measureIndex ?? selection.start.measureIndex);

                                                        return (
                                                            <React.Fragment key={`frag-${globalMeasureIndex}`}>
                                                                <div className={`h-12 flex items-center justify-center cursor-pointer rounded-sm flex-1 ${isSelected ? 'bg-green-100 ring-2 ring-green-500' : 'hover:bg-gray-100'}`} onClick={measure ? (e) => handleMeasureClick(e, section.id, globalMeasureIndex) : undefined}>
                                                                    {measure && measure.chords.length > 1 ? (<div className="flex justify-around w-full"><span>{measure.chords[0]}</span><span>{measure.chords[1]}</span></div>) : (<span className="whitespace-nowrap overflow-hidden text-ellipsis px-1">{measure ? measure.chords.join(' ') : '\u00A0'}</span>)}
                                                                </div>
                                                                {(measureIndexInLine < measuresPerLine - 1 && globalMeasureIndex < section.measures.length - 1) && (
                                                                    <div className="w-6 flex-shrink-0 flex items-center justify-center font-bold text-lg text-gray-600">
                                                                        {measure.endRepeat ? (measure.endRepeat === '||' ? '||' : ':|') : (nextMeasure?.startRepeat ? '|:' : '|')}
                                                                    </div>
                                                                )}
                                                            </React.Fragment>
                                                        );
                                                    })}
                                                </div>
                                                <div className="w-6 flex-shrink-0 flex items-center justify-center font-bold text-lg text-gray-600">
                                                   {(() => {
                                                        const lastMeasureOnLine = section.measures[Math.min(lineIndex * measuresPerLine + (measuresPerLine - 1), section.measures.length - 1)];
                                                        if (lastMeasureOnLine?.endRepeat) {
                                                            return lastMeasureOnLine.endRepeat === '||' ? '||' : ':|';
                                                        }
                                                        return isLastLineOfSection ? '||' : '|';
                                                   })()}
                                                </div>
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
    };

    const ChordInput = () => { const diatonicChords = getDiatonicChords(chart.key, chart.mode, chordMode); const otherChords = getOtherChords(chart.key, chart.mode, chordMode); const repeatSymbols = ['|:', ':|', ':|x2', ':|x3', ':|x4', '|', '||']; const [manualRoot, setManualRoot] = useState('C'); const [manualQuality, setManualQuality] = useState('maj7'); const [manualBass, setManualBass] = useState(''); const manualQualities = { tetrad: ['maj7', 'm7', '7', 'm7b5', 'dim7', 'sus4(7)', 'maj6'], triad: ['', 'm', 'dim', 'aug', 'sus4', 'sus2'] }; const palettes = { 'Diatónicos': 'diatonic', 'Otros': 'other', 'Símbolos': 'symbols', 'Manual': 'manual' }; const ChordButton = ({ chord }) => <button onClick={() => handleInsertChord(chord)} className="bg-white border border-gray-300 rounded-md py-3 px-2 text-sm font-semibold text-gray-700 hover:bg-blue-100 hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-sm">{chord}</button>; const handleManualAdd = () => { let chord = manualRoot + manualQuality; if(manualBass) chord += `/${manualBass.replace('/', '')}`; handleInsertChord(chord); setManualBass(''); }; return ( <footer className="bg-gray-200 border-t-2 border-gray-300 p-2 fixed bottom-0 left-0 right-0 z-20"> <div className="max-w-4xl mx-auto"> <div className="flex justify-center items-center gap-2 mb-2 flex-wrap">{Object.entries(palettes).map(([label, key]) => <button key={key} onClick={() => setActivePalette(key)} className={`px-4 py-1.5 text-sm font-semibold rounded-full transition-colors ${activePalette === key ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}>{label}</button>)}</div> <div className="flex justify-center items-center gap-4 mb-3 flex-wrap"> <button onClick={undoChart} disabled={!canUndo} className="p-2 bg-white text-gray-700 rounded-full disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100" title="Deshacer"><Undo2 size={18}/></button> <button onClick={redoChart} disabled={!canRedo} className="p-2 bg-white text-gray-700 rounded-full disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100" title="Rehacer"><Redo2 size={18}/></button> {(activePalette !== 'manual' && activePalette !== 'symbols') && <button onClick={() => setChordMode(c => c === 'triad' ? 'tetrad' : 'triad')} className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold rounded-full bg-white text-gray-700 border border-gray-300 hover:bg-gray-100 transition-colors">{chordMode === 'triad' ? <Tally3 className="h-4 w-4 text-blue-600"/> : <Tally4 className="h-4 w-4 text-blue-600"/>} {chordMode === 'triad' ? 'Tríadas' : 'Cuatríadas'}</button>} <div className="flex items-center"><label htmlFor="double-chord-toggle" className="text-sm font-medium text-gray-700 mr-2">2 acordes/compás</label><input type="checkbox" id="double-chord-toggle" checked={isDoubleChordMode} onChange={e => setIsDoubleChordMode(e.target.checked)} className="h-5 w-5 rounded text-blue-600 focus:ring-blue-500 border-gray-300" /></div> </div> <div className="grid grid-cols-4 sm:grid-cols-8 gap-2"> {activePalette === 'diatonic' && diatonicChords.map(c => <ChordButton key={c} chord={c} />)} {activePalette === 'other' && otherChords.map(c => <ChordButton key={c} chord={c} />)} {activePalette === 'symbols' && repeatSymbols.map(c => <ChordButton key={c} chord={c} />)} {activePalette === 'manual' &&  <> <select value={manualRoot} onChange={e => setManualRoot(e.target.value)} className="col-span-2 bg-white border rounded p-2 text-sm">{NOTES_SHARP.map(n=><option key={n}>{n}</option>)}</select> <select value={manualQuality} onChange={e => setManualQuality(e.target.value)} className="col-span-3 bg-white border rounded p-2 text-sm">{manualQualities[chordMode].map(q => <option key={q} value={q}>{q || 'maj'}</option>)}</select> <input value={manualBass} onChange={e => setManualBass(e.target.value)} placeholder="/E" className="col-span-2 bg-white border rounded p-2 text-sm"/> <button onClick={handleManualAdd} className="bg-blue-500 text-white rounded-md p-2 font-bold col-span-1">Add</button></>} </div> </div> </footer> ); };
    const NewChartModal = ({ isOpen, onClose, onCreate }) => { const [newData, setNewData] = useState({ title: '', artist: '', mode: 'major', key: 'C' }); if (!isOpen) return null; const handleSubmit = (e) => { e.preventDefault(); onCreate(newData); }; const keysForMode = newData.mode === 'major' ? MAJOR_KEYS_CHROMATIC : MINOR_KEYS_CHROMATIC; return ( <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center"> <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md"> <div className="flex justify-between items-center mb-4"><h2 className="text-2xl font-bold text-gray-800">Nueva Partitura</h2><button onClick={onClose} className="text-gray-500 hover:text-gray-800"><X size={24}/></button></div> <form onSubmit={handleSubmit}> <div className="mb-4"><label className="block text-gray-700">Título</label><input type="text" value={newData.title} onChange={e => setNewData({...newData, title: e.target.value})} className="w-full px-3 py-2 border rounded-md" required /></div> <div className="mb-4"><label className="block text-gray-700">Artista</label><input type="text" value={newData.artist} onChange={e => setNewData({...newData, artist: e.target.value})} className="w-full px-3 py-2 border rounded-md" /></div> <div className="flex gap-4 mb-6"> <div className="w-1/2"><label className="block text-gray-700">Tonalidad</label><select value={newData.key} onChange={e => setNewData({...newData, key: e.target.value})} className="w-full px-3 py-2 border rounded-md">{keysForMode.map(k => <option key={k} value={k}>{k}</option>)}</select></div> <div className="w-1/2"><label className="block text-gray-700">Modo</label><select value={newData.mode} onChange={e => setNewData({...newData, mode: e.target.value, key: e.target.value === 'major' ? 'C' : 'Am'})} className="w-full px-3 py-2 border rounded-md"><option value="major">Mayor</option><option value="minor">Menor</option></select></div> </div> <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 font-semibold">Crear Partitura</button> </form> </div> </div> ); };
    const ContextualMenu = () => { if (!selection.start) return null; return ( <div className="absolute z-30 bg-white shadow-lg rounded-lg p-2 flex gap-2" style={{ top: '10px', right: '10px' }}> {clipboard.length > 0 && <button onClick={() => handleContextAction('paste')} className="p-2 hover:bg-gray-200 rounded-md" title="Pegar"><ClipboardPaste size={18} /></button>} <button onClick={() => handleContextAction('copy')} className="p-2 hover:bg-gray-200 rounded-md" title="Copiar"><Copy size={18} /></button> <button onClick={() => handleContextAction('cut')} className="p-2 hover:bg-gray-200 rounded-md" title="Cortar"><Scissors size={18} /></button> <button onClick={() => handleContextAction('delete')} className="p-2 hover:bg-red-100 text-red-600 rounded-md" title="Eliminar"><Trash2 size={18} /></button> </div> ); };
    const LoadChartModal = ({ isOpen, onClose, onLoad }) => {
        const [savedCharts, setSavedCharts] = useState([]);
        const [isLoading, setIsLoading] = useState(true);

        useEffect(() => {
            if (isOpen && user && !user.isAnonymous && db) {
                setIsLoading(true);
                const fetchCharts = async () => {
                    try {
                        const chartsRef = collection(db, `artifacts/${appId}/users/${user.uid}/charts`);
                        const q = query(chartsRef);
                        const querySnapshot = await getDocs(q);
                        const charts = querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
                        setSavedCharts(charts);
                    } catch (error) {
                        console.error("Error al cargar partituras:", error);
                        showNotification("No se pudieron cargar las partituras.", "error");
                    } finally {
                        setIsLoading(false);
                    }
                };
                fetchCharts();
            } else {
                setSavedCharts([]);
                setIsLoading(false);
            }
        }, [isOpen, user]);

        const handleDelete = async (chartIdToDelete) => {
            try {
                const chartRef = doc(db, `artifacts/${appId}/users/${user.uid}/charts`, chartIdToDelete);
                await deleteDoc(chartRef);
                setSavedCharts(currentCharts => currentCharts.filter(chart => chart.id !== chartIdToDelete));
                showNotification("Partitura eliminada.", "success");
            } catch (error) {
                console.error("Error al eliminar partitura:", error);
                showNotification("Error al eliminar la partitura.", "error");
            }
        };
        
        if (!isOpen) return null;
        
        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center">
                <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-2xl font-bold text-gray-800">Cargar Partitura</h2>
                        <button onClick={onClose} className="text-gray-500 hover:text-gray-800"><X size={24}/></button>
                    </div>
                    {isLoading ? <p>Cargando partituras...</p> : (
                        <ul className="space-y-2 max-h-96 overflow-y-auto">
                            {savedCharts.length > 0 ? (
                                savedCharts.sort((a,b) => new Date(b.savedAt) - new Date(a.savedAt)).map(chart => (
                                    <li key={chart.id} className="flex items-center justify-between p-3 rounded-md hover:bg-blue-50 border transition-colors group">
                                        <div onClick={() => onLoad(chart)} className="flex-grow cursor-pointer pr-4">
                                            <p className="font-bold text-blue-800 group-hover:text-blue-600">{chart.title}</p>
                                            <p className="text-sm text-gray-500">{chart.artist} - {chart.savedAt ? new Date(chart.savedAt).toLocaleString() : 'Sin fecha'}</p>
                                        </div>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDelete(chart.id);
                                            }}
                                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-100 rounded-full flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                            title="Eliminar partitura"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </li>
                                ))
                            ) : (<p>{user && !user.isAnonymous ? "No has guardado ninguna partitura todavía." : "Inicia sesión para ver tus partituras."}</p>)}
                        </ul>
                    )}
                </div>
            </div>
        )
    };
    
    if (!isAuthReady) return <div className="flex justify-center items-center h-screen bg-gray-900 text-white"><Loader2 className="animate-spin h-8 w-8 mr-3"/>Cargando aplicación...</div>;
    
    return (
        <div className="min-h-screen bg-gray-100 font-sans">
            <style>{`@import url('https://fonts.googleapis.com/css2?family=Roboto+Slab:wght@400;700&display=swap');`}</style>
            <TopBar />
            <Notification {...notification} />
            <ChordChart />
            <ChordInput />
            <NewChartModal isOpen={isNewChartModalOpen} onClose={() => setIsNewChartModalOpen(false)} onCreate={handleCreateNewChart} />
            <LoadChartModal isOpen={isLoadChartModalOpen} onClose={() => setIsLoadChartModalOpen(false)} onLoad={handleLoadChart} showNotification={showNotification} />
        </div>
    );
}
