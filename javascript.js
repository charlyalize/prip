// --- CONFIGURACIÓN DE SUPABASE GLOBAL ---
const SUPABASE_URL = "https://supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvaHZha2ZxdGdyamhtbGh1cHhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwNzY5ODUsImV4cCI6MjEwNzY1Mjk4NX0.cAaMLDIokEmX6h6aYNEhSX364aXILvnmRglMfja5qAA";

// Inicialización blindada llamando al objeto nativo local
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let audioCtx = null;
let mediaRecorder = null;
let audioChunks = [];
let recordingInterval = null;
let timeLeft = 15;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

const pttButton = document.getElementById('pttButton');
const pttWrapper = document.getElementById('pttWrapper');
const statusDot = document.getElementById('statusDot');
const screenLabel = document.getElementById('screenLabel');
const recordingTimer = document.getElementById('recordingTimer');
const audioFeed = document.getElementById('audioFeed');

function playChirp(callback) {
    initAudio();
    const startTime = audioCtx.currentTime;
    const frequency = 1800; 
    const pulseDuration = 0.045; 
    const silenceDuration = 0.020; 

    for (let i = 0; i < 3; i++) {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(frequency, startTime);

        if (i === 2) {
            osc.frequency.setValueAtTime(1780, startTime + (i * (pulseDuration + silenceDuration)));
        }

        gainNode.gain.setValueAtTime(0, startTime);
        const pulseStart = startTime + (i * (pulseDuration + silenceDuration));
        const pulseEnd = pulseStart + pulseDuration;

        gainNode.gain.setValueAtTime(0, pulseStart);
        gainNode.gain.linearRampToValueAtTime(0.4, pulseStart + 0.005);
        gainNode.gain.setValueAtTime(0.4, pulseEnd - 0.005);
        gainNode.gain.linearRampToValueAtTime(0, pulseEnd);

        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        osc.start(pulseStart);
        osc.stop(pulseEnd + 0.01);
    }
    if(callback) setTimeout(callback, 200);
}

let isPressed = false;

async function handlePressStart() {
    if (isPressed) return;
    isPressed = true;
    initAudio();

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = (event) => { audioChunks.push(event.data); };

        mediaRecorder.onstop = async () => {
            screenLabel.textContent = "PROCESANDO...";
            screenLabel.style.color = "#ffd000";
            
            const audioBlob = new Blob(audioChunks, { type: 'audio/mp3' });
            const fileName = `prip-${Date.now()}.mp3`;

            const { data: storageData, error: storageError } = await supabase.storage
                .from('audios')
                .upload(fileName, audioBlob);

            if (storageError) {
                console.error("Error en storage:", storageError);
                screenLabel.textContent = "ERR: STORAGE";
                return;
            }

            const { data: { publicUrl } } = supabase.storage.from('audios').getPublicUrl(fileName);

            const { error: dbError } = await supabase
                .from('transmisiones')
                .insert([{ audio_url: publicUrl }]);

            if (dbError) {
                console.error("Error en base de datos:", dbError);
                screenLabel.textContent = "ERR: DB";
            } else {
                screenLabel.textContent = "PRIP LISTO";
                screenLabel.style.color = "var(--text-muted)";
                renderMessages(); 
            }

            stream.getTracks().forEach(track => track.stop());
        };

        pttWrapper.classList.add('animating');
        pttButton.classList.add('active');
        statusDot.classList.add('active');
        screenLabel.textContent = "TRANSMITIENDO...";
        screenLabel.style.color = "#10b981";
        recordingTimer.classList.add('active');

        playChirp(() => {
            if (isPressed && mediaRecorder) {
                mediaRecorder.start();
                startTimer();
            }
        });

    } catch (err) {
        console.error("Micrófono denegado:", err);
        screenLabel.textContent = "ERR: SIN MIC";
        screenLabel.style.color = "#ef4444";
        isPressed = false;
    }
}

function handlePressEnd() {
    if (!isPressed) return;
    isPressed = false;

    clearInterval(recordingInterval);
    resetTimerDisplay();

    pttWrapper.classList.remove('animating');
    pttButton.classList.remove('active');
    statusDot.classList.remove('active');

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        playChirp();
    }
}

function startTimer() {
    timeLeft = 15;
    recordingTimer.textContent = `00:${timeLeft < 10 ? '0' : ''}${timeLeft}`;
    recordingInterval = setInterval(() => {
        timeLeft--;
        recordingTimer.textContent = `00:${timeLeft < 10 ? '0' : ''}${timeLeft}`;
        if (timeLeft <= 0) handlePressEnd();
    }, 1000);
}

function resetTimerDisplay() {
    recordingTimer.classList.remove('active');
    recordingTimer.textContent = "00:15";
}

async function renderMessages() {
    const { data: transmisiones, error } = await supabase
        .from('transmisiones')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

    if (error) {
        console.error("Error cargando base de datos:", error);
        return;
    }

    audioFeed.innerHTML = '';

    if (!transmisiones || transmisiones.length === 0) {
        audioFeed.innerHTML = `<p style="color: var(--text-muted); text-align: center; margin-top: 20px;">No hay transmisiones globales grabadas. ¡Sé el primero!</p>`;
        return;
    }

    transmisiones.forEach((msg, index) => {
        const localTime = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const card = document.createElement('div');
        card.className = 'audio-card';
        card.innerHTML = `
            <div class="audio-card-info">
                <div class="audio-card-title">Operador Prip Global #${transmisiones.length - index}</div>
                <div class="audio-card-time">Transmitido a las ${localTime}</div>
            </div>
            <audio src="${msg.audio_url}" controls></audio>
        `;
        audioFeed.appendChild(card);
    });
}

pttButton.addEventListener('mousedown', (e) => { e.preventDefault(); handlePressStart(); });
window.addEventListener('mouseup', handlePressEnd);
pttButton.addEventListener('touchstart', (e) => { e.preventDefault(); handlePressStart(); });
pttButton.addEventListener('touchend', handlePressEnd);

window.addEventListener('keydown', (e) => { if (e.code === 'Space') { e.preventDefault(); handlePressStart(); } });
window.addEventListener('keyup', (e) => { if (e.code === 'Space') handlePressEnd(); });

renderMessages();
