import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  signInWithCustomToken,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  query,
  deleteDoc,
  doc,
} from 'firebase/firestore';

// Firebase-Konfiguration für die lokale Entwicklungsumgebung
// Diese Werte werden in der Canvas-Umgebung automatisch injiziert,
// müssen aber für die lokale Ausführung manuell definiert werden.
// Wir verwenden hier direkt die Fallback-Werte, um 'no-undef' Fehler in VS Code zu vermeiden.
const firebaseConfig = {
  apiKey: "AIzaSyAuqPFTcCOoL1AKDFzLHZaWBFtLpjC_q4s",
  authDomain: "alltags-copilot.firebaseapp.com",
  projectId: "alltags-copilot",
  storageBucket: "alltags-copilot.firebasestorage.app",
  messagingSenderId: "108774917436",
  appId: "1:108774917436:web:0f553e92c9d08ff75a8a39",
  measurementId: "G-4E3NVS62GN"
};

// Für die lokale Entwicklung setzen wir diese auf null oder einen Standardwert,
// da sie nicht von der lokalen Umgebung injiziert werden.
const initialAuthToken = null; // Für lokale Tests immer null setzen, um Admin SDK Token Fehler zu vermeiden
const appId = 'digital-memory-assistant-local'; // Eine Beispiel-App-ID für lokale Tests

// Benutzerdefinierte Modal-Komponente
const Modal = ({ message, onClose }) => {
  if (!message) return null; // Nicht rendern, wenn keine Nachricht vorhanden ist

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full text-center">
        <p className="text-lg font-semibold text-gray-800 mb-6">{message}</p>
        <button
          onClick={onClose}
          className="bg-blue-600 text-white py-2 px-6 rounded-md hover:bg-blue-700 transition duration-200"
        >
          OK
        </button>
      </div>
    </div>
  );
};

function App() {
  const [db, setDb] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [auth, setAuth] = useState(null); // 'auth' wird hier deklariert und unten verwendet
  const [userId, setUserId] = useState(null);
  const [notes, setNotes] = useState([]);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [newNoteLink, setNewNoteLink] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalMessage, setModalMessage] = useState(null); // Zustand für die Modal-Nachricht

  // Funktion zum Anzeigen des Modals
  const showModal = (message) => {
    setModalMessage(message);
  };

  // Funktion zum Schließen des Modals
  const closeModal = () => {
    setModalMessage(null);
  };

  // Firebase initialisieren und Authentifizierung durchführen
  useEffect(() => {
    const initFirebase = async () => {
      try {
        const app = initializeApp(firebaseConfig);
        const firestoreDb = getFirestore(app);
        const firebaseAuth = getAuth(app);

        setDb(firestoreDb);
        setAuth(firebaseAuth); // 'auth' wird hier gesetzt

        console.log("Initial Auth Token provided by environment (local context):", initialAuthToken); // Für Debugging

        // Zuerst versuchen, sich anonym anzumelden
        try {
          console.log("Versuche, mich anonym anzumelden...");
          await signInAnonymously(firebaseAuth);
          console.log("Anonyme Anmeldung erfolgreich.");
        } catch (anonError) {
          console.warn("Fehler bei anonymer Anmeldung:", anonError);

          // Wenn anonymer Login fehlschlägt und ein initialAuthToken vorhanden ist,
          // versuchen wir es mit dem benutzerdefinierten Token.
          if (initialAuthToken && typeof initialAuthToken === 'string' && initialAuthToken.length > 0) {
            try {
              console.log("Versuche, mich mit einem benutzerdefinierten Token anzumelden (nach fehlgeschlagener anonymer Anmeldung)...");
              await signInWithCustomToken(firebaseAuth, initialAuthToken);
              console.log("Anmeldung mit benutzerdefiniertem Token erfolgreich.");
            } catch (tokenError) {
              console.error("Fehler bei der Anmeldung mit benutzerdefiniertem Token:", tokenError);
              // Wenn auch das benutzerdefinierte Token fehlschlägt, den Fehler weitergeben
              throw tokenError;
            }
          } else {
            // Wenn kein initialAuthToken vorhanden ist und die anonyme Anmeldung fehlschlägt, den Fehler weitergeben
            throw anonError;
          }
        }

        onAuthStateChanged(firebaseAuth, (user) => {
          if (user) {
            setUserId(user.uid);
            console.log("Benutzer angemeldet:", user.uid);
          } else {
            setUserId(null);
            console.log("Benutzer abgemeldet.");
          }
          setLoading(false);
        });
      } catch (err) {
        // Überprüfen, ob der Fehler "auth/admin-restricted-operation" ist
        if (err.code === 'auth/admin-restricted-operation') {
          setError("Fehler beim Starten der App: Die Authentifizierung ist eingeschränkt. Bitte überprüfen Sie Ihre Firebase-Projektkonfiguration (z.B. ob die anonyme Anmeldung aktiviert ist oder ob ein Admin SDK-Token fälschlicherweise verwendet wird).");
        } else {
          setError("Fehler beim Starten der App.");
        }
        console.error("Fehler bei der Firebase-Initialisierung:", err);
        setLoading(false);
      }
    };

    initFirebase();
  }, []); // Leeres Abhängigkeits-Array bedeutet, dass dies nur einmal beim Mounten ausgeführt wird

  // Notizen in Echtzeit laden
  useEffect(() => {
    // Sicherstellen, dass db und userId vorhanden sind, bevor Firestore-Operationen ausgeführt werden
    if (db && userId) {
      // Pfad zur Sammlung der Benutzernotizen
      const notesRef = collection(db, `artifacts/${appId}/users/${userId}/notes`);
      
      // Eine Abfrage erstellen. orderBy wurde entfernt, um Indexfehler zu vermeiden.
      // Die Sortierung erfolgt stattdessen im Speicher.
      const q = query(notesRef); 

      // onSnapshot hört auf Echtzeit-Änderungen in der Sammlung
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          // Daten aus dem Snapshot extrahieren und Notizen-Array aktualisieren
          const notesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          // Notizen im Speicher nach Erstellungsdatum absteigend sortieren
          notesData.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
          setNotes(notesData);
        },
        (err) => {
          // Fehlerbehandlung beim Laden der Notizen
          console.error("Fehler beim Laden der Notizen:", err);
          setError("Fehler beim Laden der Notizen.");
        }
      );

      // Cleanup-Funktion: Stoppt das Zuhören auf Änderungen, wenn die Komponente unmountet wird
      return () => unsubscribe();
    }
  }, [db, userId]); // 'appId' wurde aus den Abhängigkeiten entfernt, da es eine Konstante ist

  // Funktion zum Hinzufügen einer neuen Notiz
  const addNote = async () => {
    // Validierung: Sicherstellen, dass entweder Inhalt oder Link vorhanden ist
    if (!newNoteContent.trim() && !newNoteLink.trim()) {
      showModal("Bitte Inhalt oder Link angeben.");
      return;
    }
    // Validierung: Sicherstellen, dass der Benutzer angemeldet ist
    if (!db || !userId) {
      showModal("Sie sind nicht angemeldet. Bitte warten Sie, bis die Anmeldung abgeschlossen ist.");
      return;
    }

    try {
      // Notiz-Objekt erstellen
      const note = {
        content: newNoteContent.trim(),
        link: newNoteLink.trim(),
        createdAt: new Date().toISOString(), // Zeitstempel für die Sortierung
      };

      // Notiz zu Firestore hinzufügen
      await addDoc(collection(db, `artifacts/${appId}/users/${userId}/notes`), note);
      // Eingabefelder nach dem Speichern zurücksetzen
      setNewNoteContent('');
      setNewNoteLink('');
    } catch (e) {
      // Fehlerbehandlung beim Hinzufügen der Notiz
      console.error("Fehler beim Hinzufügen:", e);
      showModal("Notiz konnte nicht gespeichert werden.");
    }
  };

  // Funktion zum Löschen einer Notiz
  const deleteNote = async (noteId) => {
    try {
      // Notiz aus Firestore löschen
      await deleteDoc(doc(db, `artifacts/${appId}/users/${userId}/notes/${noteId}`));
    } catch (e) {
      // Fehlerbehandlung beim Löschen der Notiz
      console.error("Fehler beim Löschen:", e);
      showModal("Notiz konnte nicht gelöscht werden.");
    }
  };

  // Ladezustand anzeigen
  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-100">
        <p className="text-xl text-gray-600">Lade...</p>
      </div>
    );
  }

  // Fehlerzustand anzeigen
  if (error) {
    return (
      <div className="flex justify-center items-center h-screen bg-red-100 text-red-700 p-4">
        <p className="text-xl text-center">{error}</p>
      </div>
    );
  }

  // Haupt-UI der Anwendung
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 to-purple-200 p-6">
      <header className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-800 mb-1">🧠 Digitaler Gedächtnis-Assistent</h1>
        <p className="text-gray-600">Ihr persönlicher Wissensspeicher</p>
        {userId && (
          <p className="mt-2 text-sm text-gray-500">
            Benutzer-ID: <span className="font-mono bg-gray-200 px-2 py-1 rounded">{userId}</span>
          </p>
        )}
      </header>

      <main className="max-w-3xl mx-auto bg-white shadow-lg rounded-xl p-6">
        <section className="mb-6">
          <h2 className="text-2xl font-semibold mb-4 text-gray-700">Neue Notiz</h2>
          <div className="flex flex-col space-y-4">
            <input
              className="p-3 border border-gray-300 rounded focus:ring-2 focus:ring-blue-400"
              placeholder="Notiztext..."
              value={newNoteContent}
              onChange={(e) => setNewNoteContent(e.target.value)}
            />
            <input
              type="url"
              className="p-3 border border-gray-300 rounded focus:ring-2 focus:ring-blue-400"
              placeholder="Optionaler Link (https://...)"
              value={newNoteLink}
              onChange={(e) => setNewNoteLink(e.target.value)}
            />
            <button
              onClick={addNote}
              className="bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 transition"
            >
              Speichern
            </button>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4 text-gray-700">Gespeicherte Notizen</h2>
          {notes.length === 0 ? (
            <p className="text-gray-500 italic">Noch keine Notizen.</p>
          ) : (
            <div className="space-y-4">
              {notes.map(note => (
                <div
                  key={note.id}
                  className="flex justify-between items-start bg-gray-50 p-4 rounded border border-gray-200"
                >
                  <div>
                    <p className="text-gray-800">{note.content}</p>
                    {note.link && (
                      <a
                        href={note.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 text-sm hover:underline"
                      >
                        {note.link}
                      </a>
                    )}
                    <p className="text-xs text-gray-400 mt-2">
                      {new Date(note.createdAt).toLocaleDateString()} - {new Date(note.createdAt).toLocaleTimeString()}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteNote(note.id)}
                    className="ml-4 text-red-600 hover:text-red-800"
                    title="Löschen"
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Benutzerdefiniertes Modal für Nachrichten */}
      <Modal message={modalMessage} onClose={closeModal} />
    </div>
  );
}

export default App;
