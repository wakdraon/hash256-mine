require("dotenv").config();

const { ethers } = require("ethers");
const { ABI, CONTRACT_ADDRESS } = require("./lib/config");

const RPC_URL = process.env.RPC_URL;

if (!RPC_URL) {
  console.error("Isi RPC_URL di file .env dulu.");
  process.exit(1);
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

  const genesisState = await contract.genesisState();
  const miningState = await contract.miningState();

  console.log("Contract:", CONTRACT_ADDRESS);
  console.log("genesisState:", genesisState);
  console.log("miningState:", miningState);
}

main().catch((err) => {
  console.error(err.shortMessage || err.message || err);
  process.exit(1);
});
