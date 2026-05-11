require("dotenv").config();

const { ethers } = require("ethers");
const { CpuMiner } = require("./lib/cpu-miner");
const { OpenClMiner } = require("./lib/opencl-miner");
const { ABI, CONTRACT_ADDRESS, readOptions } = require("./lib/config");
const { hashRate, shortHex } = require("./lib/format");
const { TelegramBot } = require("./lib/telegram");

const RPC_URL = process.env.RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;
const STATUS_INTERVAL_MS = 5 * 60 * 1000;

const stats = {
  startedAt: Date.now(),
  totalHashes: 0n,
  totalMined: 0,
  lastHashrate: 0,
  avgHashrate: 0,
  currentEra: "",
  currentReward: "",
  currentDifficulty: "",
  mining: false,
  backend: "",
  errors: 0
};

let bot = null;
let miningPaused = false;

function requireEnv() {
  if (!RPC_URL || !PRIVATE_KEY) {
    console.error("Isi RPC_URL dan PRIVATE_KEY di file .env dulu.");
    process.exit(1);
  }
  if (!PRIVATE_KEY.startsWith("0x")) {
    console.error("PRIVATE_KEY harus diawali 0x.");
    process.exit(1);
  }
  if (!TELEGRAM_BOT_TOKEN) {
    console.error("Isi TELEGRAM_BOT_TOKEN di file .env untuk Telegram notifications.");
    console.error("Buat bot di @BotFather lalu copy tokennya.");
    process.exit(1);
  }
}

async function retry(fn, label) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err.shortMessage || err.message;
      if (attempt === MAX_RETRIES) {
        stats.errors++;
        throw err;
      }
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      console.error(`${label} gagal (attempt ${attempt}/${MAX_RETRIES}): ${msg}`);
      await sleep(delay);
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function uptime() {
  const s = Math.floor((Date.now() - stats.startedAt) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

function setupBot() {
  bot = new TelegramBot(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID ? Number(TELEGRAM_CHAT_ID) : null);

  bot.onCommand("/start", async () => {
    await bot.send(
      "HASH256 Mining Bot\n\n" +
      "Commands:\n" +
      "/status - Mining status\n" +
      "/pause - Pause mining\n" +
      "/resume - Resume mining\n" +
      "/stats - Detailed statistics\n" +
      "/help - Show this message"
    );
  });

  bot.onCommand("/help", async () => {
    await bot.send(
      "Commands:\n" +
      "/status - Current mining status\n" +
      "/pause - Pause mining after current search\n" +
      "/resume - Resume mining\n" +
      "/stats - Detailed statistics\n" +
      "/help - Show this message"
    );
  });

  bot.onCommand("/status", async () => {
    const status = stats.mining ? "MINING" : (miningPaused ? "PAUSED" : "IDLE");
    await bot.send(
      `<b>Status:</b> ${status}\n` +
      `<b>Backend:</b> ${stats.backend}\n` +
      `<b>Hashrate:</b> ${hashRate(stats.lastHashrate)}\n` +
      `<b>Avg Hashrate:</b> ${hashRate(stats.avgHashrate)}\n` +
      `<b>Uptime:</b> ${uptime()}\n` +
      `<b>Mined:</b> ${stats.totalMined} nonces\n` +
      `<b>Errors:</b> ${stats.errors}`
    );
  });

  bot.onCommand("/stats", async () => {
    await bot.send(
      `<b>Detailed Stats</b>\n\n` +
      `<b>Era:</b> ${stats.currentEra}\n` +
      `<b>Reward:</b> ${stats.currentReward}\n` +
      `<b>Difficulty:</b> ${stats.currentDifficulty}\n` +
      `<b>Total Hashes:</b> ${shortHex(stats.totalHashes.toString())}\n` +
      `<b>Hashrate:</b> ${hashRate(stats.lastHashrate)}\n` +
      `<b>Avg Hashrate:</b> ${hashRate(stats.avgHashrate)}\n` +
      `<b>Uptime:</b> ${uptime()}\n` +
      `<b>Mined:</b> ${stats.totalMined}\n` +
      `<b>Errors:</b> ${stats.errors}`
    );
  });

  bot.onCommand("/pause", async () => {
    miningPaused = true;
    await bot.send("Mining akan di-pause setelah search selesai.");
  });

  bot.onCommand("/resume", async () => {
    miningPaused = false;
    await bot.send("Mining dilanjutkan.");
  });

  bot.startPolling();
  console.log("Telegram bot started. Send /start to your bot to get started.");

  setInterval(async () => {
    if (!stats.mining) return;
    try {
      await bot.send(
        `<b>Periodic Update</b>\n` +
        `Hashrate: ${hashRate(stats.lastHashrate)} | ` +
        `Avg: ${hashRate(stats.avgHashrate)} | ` +
        `Total: ${shortHex(stats.totalHashes.toString())} | ` +
        `Mined: ${stats.totalMined} | ` +
        `Uptime: ${uptime()}`
      );
    } catch {}
  }, STATUS_INTERVAL_MS);
}

async function main() {
  requireEnv();
  const options = readOptions();

  setupBot();

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);

  const addr = wallet.address;
  console.log("Wallet:", addr);
  console.log("Contract:", CONTRACT_ADDRESS);
  console.log("Backend:", options.backend);
  stats.backend = options.backend;

  await bot.send(
    `<b>Miner Started</b>\n` +
    `Wallet: <code>${addr}</code>\n` +
    `Backend: ${options.backend}\n` +
    `Contract: <code>${CONTRACT_ADDRESS}</code>`
  );

  while (true) {
    if (miningPaused) {
      await sleep(3000);
      continue;
    }

    try {
      const state = await retry(() => contract.miningState(), "miningState()");
      const difficulty = BigInt(state.difficulty.toString());
      const challenge = await retry(() => contract.getChallenge(addr), "getChallenge()");

      stats.currentEra = state.era.toString();
      stats.currentReward = ethers.formatUnits(state.reward, 18) + " HASH";
      stats.currentDifficulty = difficulty.toString();

      console.log("");
      console.log("Era:", stats.currentEra);
      console.log("Reward:", stats.currentReward);
      console.log("Difficulty:", stats.currentDifficulty);
      console.log("Challenge:", challenge);

      stats.mining = true;
      const solution = await findSolution({ challenge, difficulty, options });
      stats.mining = false;

      console.log("");
      console.log("FOUND via", solution.backend);
      console.log("Nonce:", solution.nonce);
      console.log("Hash:", solution.hash);

      const currentChallenge = await retry(() => contract.getChallenge(addr), "getChallenge() (verify)");
      if (currentChallenge !== challenge) {
        console.error("Challenge berubah sebelum submit. Epoch baru, cari ulang...");
        await bot.send("Challenge berubah sebelum submit. Epoch baru, skip TX.");
        continue;
      }

      await bot.send(
        `<b>Nonce Found!</b>\n` +
        `Backend: ${solution.backend}\n` +
        `Nonce: <code>${solution.nonce}</code>\n` +
        `Hash: <code>${solution.hash}</code>\n` +
        `Submitting TX...`
      );

      const txResult = await submitSolution({ contract, nonce: BigInt(solution.nonce), options });
      stats.totalMined++;

      if (txResult.success) {
        await bot.send(
          `<b>TX Confirmed!</b>\n` +
          `Block: ${txResult.block}\n` +
          `TX: <code>${txResult.hash}</code>\n` +
          `Total Mined: ${stats.totalMined}\n` +
          `Reward: ${stats.currentReward}`
        );
      } else {
        await bot.send(`<b>TX Failed:</b> ${txResult.error}`);
      }

      if (!options.keepMining) break;
    } catch (err) {
      const msg = err.shortMessage || err.message;
      console.error("Mining error:", msg);
      stats.errors++;
      await bot.send(`<b>Error:</b> ${msg}\nRetrying in 10s...`);
      await sleep(10000);
    }
  }

  await bot.send(`<b>Miner Stopped</b>\nTotal mined: ${stats.totalMined}\nUptime: ${uptime()}`);
  bot.stopPolling();
}

async function findSolution({ challenge, difficulty, options }) {
  const onProgress = progressTracker();

  if (options.backend === "opencl" || options.backend === "auto") {
    const gpu = new OpenClMiner({
      binary: options.gpuBinary,
      batchSize: options.gpuBatchSize,
      onProgress
    });

    if (gpu.available()) {
      try {
        console.log("OpenCL:", gpu.binary);
        return await gpu.search({ challenge, difficulty });
      } catch (err) {
        if (options.backend === "opencl") throw err;
        console.error("OpenCL gagal, fallback ke CPU:", err.message);
      }
    } else if (options.backend === "opencl") {
      throw new Error("OpenCL miner belum ada. Jalankan npm run build:opencl.");
    }
  }

  const cpu = new CpuMiner({
    workers: options.workers,
    batchSize: options.batchSize,
    onProgress
  });

  console.log(`CPU workers: ${options.workers}`);
  return cpu.search({ challenge, difficulty });
}

function progressTracker() {
  let last = 0;
  return ({ backend, hashes, hashrate, totalHashes, avgHashrate }) => {
    stats.lastHashrate = hashrate;
    if (avgHashrate) stats.avgHashrate = avgHashrate;
    if (totalHashes) stats.totalHashes += totalHashes - (stats._lastTotal || 0n);
    stats._lastTotal = totalHashes || 0n;

    const now = Date.now();
    if (now - last < 2000) return;
    last = now;
    const total = totalHashes || hashes;
    let line = `\r${backend} ${hashRate(hashrate)}`;
    if (avgHashrate) line += ` (avg ${hashRate(avgHashrate)})`;
    line += ` | ${shortHex(total.toString())} hashes`;
    process.stdout.write(line);
  };
}

async function submitSolution({ contract, nonce, options }) {
  try {
    const gas = await estimateGas(contract, nonce);
    const fee = await feeOptions(contract.runner.provider, options.priorityFeeGwei);
    const tx = await contract.mine(nonce, { gasLimit: gas, ...fee });
    console.log("TX sent:", tx.hash);

    const receipt = await tx.wait();
    console.log("Success block:", receipt.blockNumber);
    return { success: true, hash: tx.hash, block: receipt.blockNumber };
  } catch (err) {
    const msg = err.shortMessage || err.message;
    console.error("TX failed:", msg);
    return { success: false, error: msg };
  }
}

async function estimateGas(contract, nonce) {
  try {
    const estimate = await contract.mine.estimateGas(nonce);
    const padded = (estimate * 3n) / 2n;
    if (padded < 200000n) return 200000n;
    if (padded > 450000n) return 450000n;
    return padded;
  } catch {
    return 300000n;
  }
}

async function feeOptions(provider, priorityFeeGwei) {
  const priority = ethers.parseUnits(priorityFeeGwei, "gwei");
  try {
    const block = await provider.getBlock("latest");
    if (block?.baseFeePerGas) {
      return {
        maxPriorityFeePerGas: priority,
        maxFeePerGas: block.baseFeePerGas * 3n + priority
      };
    }
  } catch {}
  return {
    maxPriorityFeePerGas: priority,
    maxFeePerGas: ethers.parseUnits("10", "gwei") + priority
  };
}

main().catch(async (err) => {
  console.error(err.shortMessage || err.message || err);
  if (bot) {
    try { await bot.send(`<b>Fatal Error:</b> ${err.message}`); } catch {}
    bot.stopPolling();
  }
  process.exit(1);
});
