// Cola de reactivacion. Envia de a un mensaje, con pausas al azar y tope diario,
// para que WhatsApp no interprete la cuenta como un emisor automatico.

export function normalizePhone(value) {
    const phone = String(value ?? '').replace(/[\s()+.-]/g, '');
    return /^[1-9]\d{7,14}$/.test(phone) ? phone : null;
}

// Solo imagenes: un PDF o un video cambian como lo recibe el cliente y como lo lee WhatsApp.
const TIPOS_DE_IMAGEN = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export function normalizeMedia(media) {
    if (!media) return null;
    const mimetype = String(media.mimetype ?? '').toLowerCase();
    const data = String(media.data ?? '');
    if (!TIPOS_DE_IMAGEN.includes(mimetype)) return null;
    if (!data || data.length > 12000000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return null;
    const filename = String(media.filename ?? '').replace(/[^\w.-]/g, '').slice(0, 80) || 'imagen.jpg';
    return { mimetype, data, filename };
}

export function createCampaign(send, {
    cap = 40,
    minDelay = 40000,
    maxDelay = 120000,
    now = Date.now,
    wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
    random = Math.random,
    canSend = () => true,
} = {}) {
    const queue = [];
    let sentToday = 0;
    let day = new Date(now()).toDateString();
    let running = false;
    let lastError = null;
    let lastSentAt = null;

    // El tope es por dia calendario: al cambiar la fecha se reinicia el contador.
    function rollover() {
        const today = new Date(now()).toDateString();
        if (today !== day) {
            day = today;
            sentToday = 0;
        }
    }

    async function worker() {
        running = true;
        try {
            while (queue.length) {
                rollover();
                // Alcanzado el tope, o con WhatsApp desconectado, la cola queda intacta
                // esperando: pump() la retoma mas tarde sin perder ningun mensaje.
                if (sentToday >= cap || !canSend()) break;
                await wait(minDelay + Math.floor(random() * (maxDelay - minDelay + 1)));
                const item = queue.shift();
                if (!item) break;
                try {
                    await send(item.phoneNumber, item.message, item.media);
                    sentToday++;
                    lastSentAt = now();
                    lastError = null;
                } catch (error) {
                    lastError = error instanceof Error ? error.message : String(error);
                    console.error('[Campana] No se pudo enviar a', item.phoneNumber, lastError);
                }
            }
        } finally {
            running = false;
        }
    }

    let current = Promise.resolve();
    function pump() {
        if (running || !queue.length) return current;
        current = worker();
        return current;
    }

    return {
        // Devuelve cuantos quedaron encolados: descarta invalidos, repetidos y ya pendientes.
        // La imagen es una sola para toda la tanda: se guarda por referencia, no una copia
        // por destinatario, para no multiplicar megabytes en memoria.
        enqueue(items, media = null) {
            const adjunto = normalizeMedia(media);
            const pendientes = new Set(queue.map(item => item.phoneNumber));
            let queued = 0;
            for (const item of Array.isArray(items) ? items : []) {
                const phoneNumber = normalizePhone(item?.phoneNumber);
                const message = String(item?.message ?? '').trim();
                // Con imagen el texto es el epigrafe y puede ir vacio.
                if (!phoneNumber || (!message && !adjunto) || message.length > 1000) continue;
                if (pendientes.has(phoneNumber)) continue;
                pendientes.add(phoneNumber);
                queue.push({ phoneNumber, message, media: adjunto });
                queued++;
            }
            pump();
            return queued;
        },
        pump,
        whenIdle: () => current,
        stats() {
            rollover();
            return {
                pending: queue.length,
                sentToday,
                cap,
                remainingToday: Math.max(0, cap - sentToday),
                lastSentAt: lastSentAt ? new Date(lastSentAt).toISOString() : null,
                lastError,
            };
        },
    };
}
