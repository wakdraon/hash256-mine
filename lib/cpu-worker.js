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
  const difficulty = BigInt(message.difficulty);
  let nonce = BigInt(message.start);
  const end = nonce + BigInt(message.count);

  const input = new Uint8Array(64);
  input.set(challengeBytes, 0);

  while (!stopped && nonce < end) {
    writeUint256BE(input, 32, nonce);
    const hash = "0x" + keccak256(input);
    if (BigInt(hash) < difficulty) {
      parentPort.postMessage({ type: "found", nonce: nonce.toString(), hash });
      return;
    }
    nonce++;
  }

  parentPort.postMessage({ type: stopped ? "stopped" : "done", hashes: (end - BigInt(message.start)).toString() });
});

function hexToBytes(hex) {
  if (hex.startsWith("0x")) hex = hex.slice(2);
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function writeUint256BE(buf, offset, value) {
  for (let i = 31; i >= 0; i--) {
    buf[offset + i] = Number(value & 0xffn);
    value >>= 8n;
  }
}
