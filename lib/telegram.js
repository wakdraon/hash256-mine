const https = require("https");

class TelegramBot {
  constructor(token, chatId) {
    this.token = token;
    this.chatId = chatId;
    this.baseUrl = `https://api.telegram.org/bot${token}`;
    this.polling = false;
    this.offset = 0;
    this.commands = new Map();
  }

  async call(method, params = {}) {
    const data = JSON.stringify(params);
    return new Promise((resolve, reject) => {
      const req = https.request(`${this.baseUrl}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) }
      }, (res) => {
        let body = "";
        res.on("data", (c) => body += c);
        res.on("end", () => {
          try {
            const json = JSON.parse(body);
            if (json.ok) resolve(json.result);
            else reject(new Error(json.description || "Telegram API error"));
          } catch (e) { reject(e); }
        });
      });
      req.on("error", reject);
      req.write(data);
      req.end();
    });
  }

  async send(text, opts = {}) {
    if (!this.chatId) return;
    return this.call("sendMessage", {
      chat_id: this.chatId,
      text,
      parse_mode: "HTML",
      ...opts
    });
  }

  onCommand(cmd, handler) {
    this.commands.set(cmd, handler);
  }

  async startPolling() {
    this.polling = true;
    while (this.polling) {
      try {
        const updates = await this.call("getUpdates", {
          offset: this.offset,
          timeout: 10,
          allowed_updates: ["message"]
        });
        for (const update of updates) {
          this.offset = update.update_id + 1;
          if (update.message?.text) {
            const text = update.message.text.trim();
            const chatId = update.message.chat.id;

            if (!this.chatId) {
              this.chatId = chatId;
              console.log("Telegram chat ID:", chatId);
            }

            if (chatId !== this.chatId) continue;

            const cmd = text.split(" ")[0].split("@")[0];
            const handler = this.commands.get(cmd);
            if (handler) {
              try {
                await handler(update.message);
              } catch (e) {
                await this.send(`Error: ${e.message}`);
              }
            }
          }
        }
      } catch (err) {
        if (this.polling) {
          console.error("Telegram polling error:", err.message);
          await sleep(5000);
        }
      }
    }
  }

  stopPolling() {
    this.polling = false;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = { TelegramBot };
