// Cola de reactivacion. Envia de a un mensaje, con pausas al azar y tope diario,
// para que WhatsApp no interprete la cuenta como un emisor automatico.

export function normalizePhone(value) {
    const phone = String(value ?? '').replace(/[\s()+.-]/g, '');
    return /^[1-9]\d{7,14}$/.test(phone) ? phone : null;
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
                    await send(item.phoneNumber, item.message);
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
        enqueue(items) {
            const pendientes = new Set(queue.map(item => item.phoneNumber));
            let queued = 0;
            for (const item of Array.isArray(items) ? items : []) {
                const phoneNumber = normalizePhone(item?.phoneNumber);
                const message = String(item?.message ?? '').trim();
                if (!phoneNumber || !message || message.length > 1000) continue;
                if (pendientes.has(phoneNumber)) continue;
                pendientes.add(phoneNumber);
                queue.push({ phoneNumber, message });
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
