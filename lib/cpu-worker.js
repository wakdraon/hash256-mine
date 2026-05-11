const { parentPort } = require("worker_threads");
const { keccak256 } = require("js-sha3");

let stopped = false;

parentPort.on("message", (message) => {
  if (message.type === "stop") {
    stopped = true;
    return;
  }

  if (message.type !== "search") return;
  stopped = false;

  const challengeBytes = hexToBytes(message.challenge);
  const difficultyBytes = hexToBytes(message.difficulty);
  let nonce = BigInt(message.start);
  const end = nonce + BigInt(message.count);

  const input = new Uint8Array(64);
  input.set(challengeBytes, 0);

  while (!stopped && nonce < end) {
    writeUint256BE(input, 32, nonce);
    const hashBytes = keccak256.arrayBuffer(input);
    if (belowDifficulty(new Uint8Array(hashBytes), difficultyBytes)) {
      const hash = "0x" + bufToHex(new Uint8Array(hashBytes));
      parentPort.postMessage({ type: "found", nonce: nonce.toString(), hash });
      return;
    }
    nonce++;
  }

  parentPort.postMessage({ type: stopped ? "stopped" : "done", hashes: (end - BigInt(message.start)).toString() });
});

function belowDifficulty(hash, difficulty) {
  for (let i = 0; i < 32; i++) {
    if (hash[i] < difficulty[i]) return true;
    if (hash[i] > difficulty[i]) return false;
  }
  return false;
}

function hexToBytes(hex) {
  if (typeof hex === "bigint") {
    hex = hex.toString(16).padStart(64, "0");
  }
  if (typeof hex === "string" && hex.startsWith("0x")) hex = hex.slice(2);
  hex = String(hex).padStart(64, "0");
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function bufToHex(bytes) {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

function writeUint256BE(buf, offset, value) {
  for (let i = 31; i >= 0; i--) {
    buf[offset + i] = Number(value & 0xffn);
    value >>= 8n;
  }
}
