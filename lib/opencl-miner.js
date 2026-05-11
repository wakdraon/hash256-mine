const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

class OpenClMiner {
  constructor({ binary, batchSize, onProgress }) {
    this.binary = binary || defaultBinary();
    this.batchSize = batchSize;
    this.onProgress = onProgress;
    this.child = null;
  }

  available() {
    return fs.existsSync(this.binary);
  }

  search({ challenge, difficulty }) {
    if (!this.available()) {
      throw new Error(`OpenCL miner belum dibuild: ${this.binary}`);
    }

    const args = [challenge, difficultyHex(difficulty), this.batchSize.toString()];
    this.child = spawn(this.binary, args, { stdio: ["ignore", "pipe", "pipe"] });

    return new Promise((resolve, reject) => {
      let stderr = "";
      this.child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      this.child.stdout.on("data", (chunk) => {
        for (const line of chunk.toString().split(/\r?\n/)) {
          if (!line.trim()) continue;
          let message;
          try {
            message = JSON.parse(line);
          } catch {
            continue;
          }

          if (message.type === "progress" && this.onProgress) {
            this.onProgress({
              backend: "opencl",
              hashes: BigInt(message.hashes),
              hashrate: Number(message.hashrate)
            });
          } else if (message.type === "found") {
            resolve({
              backend: "opencl",
              nonce: message.nonce,
              hash: message.hash,
              hashes: message.hashes
            });
          }
        }
      });

      this.child.on("error", reject);
      this.child.on("close", (code) => {
        if (code !== 0) reject(new Error(stderr.trim() || `OpenCL miner exit ${code}`));
      });
    });
  }

  stop() {
    if (this.child) this.child.kill();
    this.child = null;
  }
}

function defaultBinary() {
  const exe = process.platform === "win32" ? "hash256-opencl.exe" : "hash256-opencl";
  return path.join(__dirname, "..", "bin", exe);
}

function difficultyHex(value) {
  return `0x${BigInt(value).toString(16).padStart(64, "0")}`;
}

module.exports = {
  OpenClMiner
};
