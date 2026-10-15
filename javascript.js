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

// --- TU LOGA REPLICADA DEL ICÓNICO SONIDO "PRIP" ---
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
    
    // Ejecuta la grabación después de que termine el pitido (aprox 200ms)
    if(callback) setTimeout(callback, 200);
}

let isPressed = false;

async function handlePressStart() {
    if (isPressed) return;
    isPressed = true;
    
    initAudio();

    // Pedir permiso y configurar micrófono
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/mp3' });
            
            // Guardar localmente convirtiendo el blob a Base64
            const reader = new FileReader();
            reader.readAsDataURL(audioBlob);
            reader.onloadend = () => {
                const base64Audio = reader.result;
                saveAudioMessage(base64Audio);
            };

            // Detener el uso del hardware del micrófono
            stream.getTracks().forEach(track => track.stop());
        };

        // Activación visual
        pttWrapper.classList.add('animating');
        pttButton.classList.add('active');
        statusDot.classList.add('active');
        screenLabel.textContent = "TRANSMITIENDO...";
        screenLabel.style.color = "#10b981";
        recordingTimer.classList.add('active');

        // Suena el PRIP e inicia inmediatamente a grabar
        playChirp(() => {
            if (isPressed && mediaRecorder) {
                mediaRecorder.start();
                startTimer();
            }
        });

    } catch (err) {
        console.error("Acceso al micrófono denegado:", err);
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
    screenLabel.textContent = "PRIP LISTO";
    screenLabel.style.color = "var(--text-muted)";

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        playChirp(); // Pitido final de cierre
    }
}

// Control del Reloj Regresivo de 15 Segundos
function startTimer() {
    timeLeft = 15;
    recordingTimer.textContent = `00:${timeLeft < 10 ? '0' : ''}${timeLeft}`;
    
    recordingInterval = setInterval(() => {
        timeLeft--;
        recordingTimer.textContent = `00:${timeLeft < 10 ? '0' : ''}${timeLeft}`;
        
        if (timeLeft <= 0) {
            handlePressEnd(); // Fuerza el corte al llegar a cero
        }
    }, 1000);
}

function resetTimerDisplay() {
    recordingTimer.classList.remove('active');
    recordingTimer.textContent = "00:15";
}

// Guardar y renderizar la caja de comentarios de audios
function saveAudioMessage(base64Data) {
    const messages = JSON.parse(localStorage.getItem('prip_messages') || '[]');
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    const newMessage = {
        id: Date.now(),
        time: timestamp,
        audio: base64Data
    };

    messages.unshift(newMessage); // El más nuevo primero
    localStorage.setItem('prip_messages', JSON.stringify(messages));
    renderMessages();
}

function renderMessages() {
    audioFeed.innerHTML = '';
    const messages = JSON.parse(localStorage.getItem('prip_messages') || '[]');

    if(messages.length === 0) {
        audioFeed.innerHTML = `<p style="color: var(--text-muted); text-align: center; margin-top: 20px;">No hay transmisiones grabadas. ¡Sé el primero!</p>`;
        return;
    }

    messages.forEach((msg, index) => {
        const card = document.createElement('div');
        card.className = 'audio-card';
        card.innerHTML = `
            <div class="audio-card-info">
                <div class="audio-card-title">Operador Prip #${messages.length - index}</div>
                <div class="audio-card-time">Transmitido a las ${msg.time}</div>
            </div>
            <audio src="${msg.audio}" controls></audio>
        `;
        audioFeed.appendChild(card);
    });
}

// --- LISTENERS ---
pttButton.addEventListener('mousedown', (e) => { e.preventDefault(); handlePressStart(); });
window.addEventListener('mouseup', handlePressEnd);
pttButton.addEventListener('touchstart', (e) => { e.preventDefault(); handlePressStart(); });
pttButton.addEventListener('touchend', (e) => { e.preventDefault(); handlePressEnd(); });

window.addEventListener('keydown', (e) => { if (e.code === 'Space') { e.preventDefault(); handlePressStart(); } });
window.addEventListener('keyup', (e) => { if (e.code === 'Space') handlePressEnd(); });

// Render inicial al cargar la página
renderMessages();
