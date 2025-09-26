# Telegram Instagram Downloader Bot (Cloudflare Worker)

This project is a **Telegram Bot** that downloads Instagram posts/reels using an external API, with **2-channel force-join** enabled.

## ✨ Features

* Force users to join 2 specific channels before using the bot.
* Accepts Instagram post/reel URLs and downloads media.
* Sends back images or videos (up to 10 in a group).
* Provides direct download links if Telegram cannot fetch media.
* Runs on **Cloudflare Workers** (serverless, free, fast).

## 🚀 Deployment

### 1. Upload to Cloudflare Worker

* Go to [Cloudflare Workers Dashboard](https://dash.cloudflare.com/)
* Create a new Worker.
* Replace the default code with `worker.js`.

### 2. Set Telegram Webhook

After deployment, run the following command (replace with your Worker URL):

```bash
curl -F "url=https://YOUR-WORKER.workers.dev" https://api.telegram.org/bot<YOUR_TELEGRAM_BOT_TOKEN>/setWebhook
```

### 3. Done!

Now your bot will respond to messages.

## 🔒 Security

If you ever rotate your bot token, update the `TELEGRAM_TOKEN` constant inside `worker.js`.

## 👨‍💻 Credits

Bot developed by [t.me/anshapi](https://t.me/anshapi)
