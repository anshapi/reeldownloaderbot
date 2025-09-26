// Cloudflare Worker: Telegram webhook bot (Instagram downloader + 2-channel force-join)
// Deploy to Cloudflare Workers and set Telegram webhook to this worker's URL.
//
// How to set webhook after deploying to https://YOUR-WORKER.workers.dev:
// curl -F "url=https://YOUR-WORKER.workers.dev" https://api.telegram.org/bot8403487518:AAG_oCR_YunYZ8YL44DzbPmnYTC9FZxNObc/setWebhook
//
// NOTE: This code uses the token you provided. If you rotate it, update the TELEGRAM_TOKEN constant.

const TELEGRAM_TOKEN = "8403487518:AAG_oCR_YunYZ8YL44DzbPmnYTC9FZxNObc";
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
const REQUIRED_CHANNELS = ["@anshapi", "@revangeapi"];
const EXTERNAL_INSTAGRAM_API = "https://socialdownloder.anshapi.workers.dev/api/instagram?url=";

// utility: do GET with query string or POST with JSON form
async function tgApi(method, body = null, isForm = false) {
  const url = `${TELEGRAM_API}/${method}`;
  if (!body) {
    const res = await fetch(url);
    return res.json();
  }
  const opts = { method: "POST", headers: {} };
  if (isForm) {
    const params = new URLSearchParams();
    for (const k of Object.keys(body)) {
      if (Array.isArray(body[k])) params.append(k, JSON.stringify(body[k]));
      else params.append(k, body[k]);
    }
    opts.body = params;
    opts.headers["Content-Type"] = "application/x-www-form-urlencoded";
  } else {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  try {
    return await res.json();
  } catch (e) {
    return { ok: false, description: "Invalid JSON response from Telegram", error: e.toString() };
  }
}

async function isMemberOfChannel(channelUsername, userId) {
  try {
    const resp = await fetch(`${TELEGRAM_API}/getChatMember?chat_id=${encodeURIComponent(channelUsername)}&user_id=${userId}`);
    const json = await resp.json();
    if (!json.ok) return false;
    const status = json.result && json.result.status ? json.result.status : "";
    return ["creator", "administrator", "member", "restricted"].includes(status);
  } catch (e) {
    return false;
  }
}

function extractInstagramUrl(text) {
  if (!text) return null;
  const trimmed = text.trim();
  if (/https?:\/\/(www\.)?instagram\.com\/\S+/.test(trimmed) || /https?:\/\/(www\.)?instagr\.am\/\S+/.test(trimmed)) {
    const token = trimmed.split(/\s+/).find(t => t.startsWith("http"));
    return token || trimmed;
  }
  return null;
}

addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  if (request.method !== "POST") return new Response("OK - webhook alive", { status: 200 });
  let update;
  try { update = await request.json(); } catch (err) { return new Response("Bad request", { status: 400 }); }
  const message = update.message || (update.channel_post ? update.channel_post : null);
  const from = message ? message.from : (update.callback_query ? update.callback_query.from : null);
  const chat = message ? message.chat : (update.callback_query ? update.callback_query.message.chat : null);
  if (!message || !from || !chat) return new Response("No message to handle", { status: 200 });
  const chatId = chat.id; const userId = from.id; const text = message.text || "";
  if (text && text.startsWith("/start")) {
    const checks = await Promise.all(REQUIRED_CHANNELS.map(ch => isMemberOfChannel(ch, userId)));
    const allJoined = checks.every(Boolean);
    if (!allJoined) {
      const joinText = `Please join the required channels to use this bot:\n\n${REQUIRED_CHANNELS.join("\n")}\n\nAfter joining, send /start again.`;
      await tgApi("sendMessage", { chat_id: chatId, text: joinText });
      return new Response("ok", { status: 200 });
    }
    await tgApi("sendMessage", { chat_id: chatId, text: "Welcome! Send me an Instagram post/reel URL and I'll download it for you." });
    return new Response("ok", { status: 200 });
  }
  const igUrl = extractInstagramUrl(text);
  if (igUrl) {
    const checks = await Promise.all(REQUIRED_CHANNELS.map(ch => isMemberOfChannel(ch, userId)));
    const allJoined = checks.every(Boolean);
    if (!allJoined) {
      const joinText = `You must join these channels before using the bot:\n\n${REQUIRED_CHANNELS.join("\n")}\n\nAfter joining, send /start.`;
      await tgApi("sendMessage", { chat_id: chatId, text: joinText });
      return new Response("ok", { status: 200 });
    }
    const proc = await tgApi("sendMessage", { chat_id: chatId, text: "⏳ Processing your URL... Please wait." });
    const procMessageId = proc && proc.result && proc.result.message_id ? proc.result.message_id : null;
    let apiJson = null;
    try {
      const apiResp = await fetch(EXTERNAL_INSTAGRAM_API + encodeURIComponent(igUrl), { method: "GET", headers: { "Accept": "application/json" }});
      apiJson = await apiResp.json();
    } catch (err) {
      if (procMessageId) await tgApi("deleteMessage", { chat_id: chatId, message_id: procMessageId });
      await tgApi("sendMessage", { chat_id: chatId, text: "❌ Error contacting external API. Please try again later." });
      return new Response("ok", { status: 200 });
    }
    if (!apiJson || apiJson.error) {
      if (procMessageId) await tgApi("deleteMessage", { chat_id: chatId, message_id: procMessageId });
      await tgApi("sendMessage", { chat_id: chatId, text: "❌ Failed to download. The Instagram API returned an error." });
      return new Response("ok", { status: 200 });
    }
    try {
      const mediaToSend = [];
      if (Array.isArray(apiJson.videos) && apiJson.videos.length > 0) {
        if (apiJson.videos.length > 1) {
          for (let i = 0; i < Math.min(10, apiJson.videos.length); i++) {
            const v = apiJson.videos[i];
            mediaToSend.push({ type: "video", media: v.url, caption: i === 0 && apiJson.title ? apiJson.title : undefined });
          }
          await tgApi("sendMediaGroup", { chat_id: chatId, media: mediaToSend }, true);
        } else {
          const v = apiJson.videos[0];
          await tgApi("sendVideo", { chat_id: chatId, video: v.url, caption: apiJson.title || undefined });
        }
      } else if (Array.isArray(apiJson.images) && apiJson.images.length > 0) {
        for (let i = 0; i < Math.min(10, apiJson.images.length); i++) {
          const p = apiJson.images[i];
          mediaToSend.push({ type: "photo", media: p.url, caption: i === 0 && apiJson.title ? apiJson.title : undefined });
        }
        if (mediaToSend.length === 1) {
          await tgApi("sendPhoto", { chat_id: chatId, photo: mediaToSend[0].media, caption: mediaToSend[0].caption || undefined });
        } else {
          await tgApi("sendMediaGroup", { chat_id: chatId, media: mediaToSend }, true);
        }
      } else {
        await tgApi("sendMessage", { chat_id: chatId, text: "✅ No media found. Here's the API response:\n\n" + JSON.stringify(apiJson, null, 2) });
      }
    } catch (sendErr) {
      const fallbackLines = [];
      if (Array.isArray(apiJson.videos)) apiJson.videos.forEach(v => fallbackLines.push(v.url));
      if (Array.isArray(apiJson.images)) apiJson.images.forEach(i => fallbackLines.push(i.url));
      if (fallbackLines.length === 0) fallbackLines.push("No direct URLs returned by API.");
      await tgApi("sendMessage", { chat_id: chatId, text: "❗ Could not send media. Direct URLs:\n\n" + fallbackLines.join("\n") });
    }
    if (procMessageId) { try { await tgApi("deleteMessage", { chat_id: chatId, message_id: procMessageId }); } catch (e) {} }
    return new Response("ok", { status: 200 });
  }
  await tgApi("sendMessage", { chat_id: chatId, text: "Send me an Instagram post or reel URL and I'll download it for you. Use /start to initialize." });
  return new Response("ok", { status: 200 });
}
