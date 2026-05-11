# HASH256 GPU Mining di Vast.ai - Panduan Lengkap

## Daftar Isi

1. [Persiapan](#1-persiapan)
2. [Sewa GPU di Vast.ai](#2-sewa-gpu-di-vastai)
3. [Setup Otomatis (Recommended)](#3-setup-otomatis)
4. [Setup Manual](#4-setup-manual)
5. [Konfigurasi .env](#5-konfigurasi-env)
6. [Jalankan Miner](#6-jalankan-miner)
7. [Tips & Optimasi](#7-tips--optimasi)
8. [Troubleshooting](#8-troubleshooting)
9. [Estimasi Biaya](#9-estimasi-biaya)

---

## 1. Persiapan

Sebelum mulai, kamu perlu:

- **Akun Vast.ai** — daftar di [cloud.vast.ai](https://cloud.vast.ai)
- **Wallet Ethereum baru** khusus mining (JANGAN pakai wallet utama!)
  - Buat wallet baru di MetaMask/Rabby
  - Kirim sedikit ETH untuk gas (~0.01-0.05 ETH)
  - Catat **private key** wallet ini
- **Saldo Vast.ai** — top up credit untuk sewa GPU
- **(Opsional)** RPC URL premium dari Alchemy/Infura/QuickNode untuk koneksi lebih stabil

---

## 2. Sewa GPU di Vast.ai

### Pilih Template

1. Buka [cloud.vast.ai](https://cloud.vast.ai)
2. Klik **Templates** → cari **"NVIDIA CUDA"** atau **"PyTorch"** template
3. Atau buat custom template dengan image: `nvidia/cuda:12.4.1-devel-ubuntu22.04`

### Pilih GPU (Rekomendasi)

| GPU | VRAM | Hash Rate Estimasi | Harga Vast.ai |
|-----|------|-------------------|---------------|
| RTX 3060 | 12GB | ~50-100 MH/s | ~$0.05-0.10/jam |
| RTX 3070 | 8GB | ~80-150 MH/s | ~$0.07-0.12/jam |
| RTX 3090 | 24GB | ~150-300 MH/s | ~$0.10-0.20/jam |
| RTX 4090 | 24GB | ~300-600 MH/s | ~$0.20-0.40/jam |
| A100 | 80GB | ~500-1000 MH/s | ~$0.50-1.00/jam |

> Hash rate bervariasi tergantung difficulty dan batch size. Harga berubah sesuai pasar Vast.ai.

### Settings Instance

- **Disk**: 10 GB cukup
- **Launch mode**: SSH (recommended) atau Jupyter
- **Docker image**: Pastikan pakai image dengan CUDA/NVIDIA driver

### Connect via SSH

Setelah instance running, copy SSH command dari dashboard Vast.ai:

```bash
ssh -p <PORT> root@<IP_ADDRESS> -L 8080:localhost:8080
```

---

## 3. Setup Otomatis

**Cara tercepat** — jalankan satu command ini di terminal Vast.ai:

```bash
curl -fsSL https://raw.githubusercontent.com/mrfunntastiic/hash256-mine/main/setup-vastai.sh | bash
```

Atau kalau sudah clone repo:

```bash
cd hash256-mine
bash setup-vastai.sh
```

Script ini otomatis:
- Install Node.js 20 LTS
- Install OpenCL headers & ICD loader
- Clone repo & install dependencies
- Build binary GPU miner
- Verify GPU terdeteksi
- Buat template `.env`

Setelah selesai, **edit `.env`** lalu jalankan miner.

---

## 4. Setup Manual

Kalau prefer setup manual, ikuti langkah-langkah berikut:

### 4.1 Install System Dependencies

```bash
apt-get update
apt-get install -y build-essential ocl-icd-opencl-dev clinfo git curl
```

### 4.2 Install Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
node -v  # Harus v20.x
```

### 4.3 Verifikasi GPU & OpenCL

```bash
# Cek GPU NVIDIA
nvidia-smi

# Cek OpenCL devices
clinfo -l
```

Kalau `clinfo` tidak mendeteksi GPU, buat ICD file manual:

```bash
mkdir -p /etc/OpenCL/vendors
echo "libnvidia-opencl.so.1" > /etc/OpenCL/vendors/nvidia.icd
clinfo -l  # Coba lagi
```

### 4.4 Clone & Build

```bash
git clone https://github.com/mrfunntastiic/hash256-mine
cd hash256-mine
npm install
sh scripts/build-opencl.sh
```

### 4.5 Buat .env

```bash
cp .env.example .env
nano .env
```

---

## 5. Konfigurasi .env

Edit file `.env` dan isi parameter berikut:

```env
# WAJIB
RPC_URL=https://ethereum-rpc.publicnode.com
PRIVATE_KEY=0x...private_key_wallet_mining_kamu...

# RECOMMENDED
MINER_BACKEND=opencl
KEEP_MINING=true
PRIORITY_FEE_GWEI=2

# OPSIONAL - Tuning
GPU_BATCH_SIZE=67108864
```

### RPC URL Options

| Provider | URL | Catatan |
|----------|-----|---------|
| PublicNode (gratis) | `https://ethereum-rpc.publicnode.com` | Rate limited |
| Alchemy (gratis tier) | `https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY` | 300M CU/bulan gratis |
| Infura (gratis tier) | `https://mainnet.infura.io/v3/YOUR_KEY` | 100k req/hari gratis |
| QuickNode | `https://...quiknode.pro/YOUR_KEY` | Berbayar, paling cepat |

### GPU Batch Size Tuning

| GPU VRAM | Recommended `GPU_BATCH_SIZE` |
|----------|------------------------------|
| 8 GB | `33554432` (32M) |
| 12 GB | `67108864` (64M) - default |
| 24 GB | `134217728` (128M) |
| 80 GB | `268435456` (256M) |

> Kalau terlalu besar → error `CL_MEM_OBJECT_ALLOCATION_FAILURE`. Turunkan batch size.

---

## 6. Jalankan Miner

### Foreground (lihat output langsung)

```bash
npm run start:gpu
```

### Background (tetap jalan walau SSH disconnect)

Pakai `screen` atau `tmux`:

```bash
# Pakai screen
screen -S miner
npm run start:gpu
# Tekan Ctrl+A lalu D untuk detach
# Reconnect: screen -r miner

# Atau pakai tmux  
tmux new -s miner
npm run start:gpu
# Tekan Ctrl+B lalu D untuk detach
# Reconnect: tmux attach -t miner
```

Atau pakai `nohup`:

```bash
nohup npm run start:gpu > miner.log 2>&1 &
tail -f miner.log
```

### Cek Status Kontrak

```bash
npm run check
```

Output contoh:
```
Contract: 0xAC7b5d06fa1e77D08aea40d46cB7C5923A87A0cc
miningState: [era, reward, difficulty, minted, remaining, epoch, epochBlocksLeft]
```

---

## 7. Tips & Optimasi

### Multi-GPU

Kalau instance punya multiple GPU, miner saat ini hanya pakai 1 GPU (device pertama).
Untuk multi-GPU, jalankan beberapa instance miner dengan wallet berbeda, atau modifikasi
source code.

### Priority Fee

Kalau banyak kompetisi (miner lain), naikkan `PRIORITY_FEE_GWEI`:

```env
PRIORITY_FEE_GWEI=5   # atau lebih tinggi
```

### RPC Premium

Public RPC bisa rate-limited. Untuk mining serius, pakai RPC premium:
- [Alchemy](https://www.alchemy.com/) — gratis 300M CU/bulan
- [Infura](https://www.infura.io/) — gratis 100k request/hari

### Monitor Gas

Pantau gas price di [etherscan.io/gastracker](https://etherscan.io/gastracker).
Mining lebih hemat kalau gas rendah (< 10 Gwei).

### Auto-restart

Buat script auto-restart kalau miner crash:

```bash
#!/bin/bash
while true; do
  echo "[$(date)] Starting miner..."
  npm run start:gpu
  echo "[$(date)] Miner stopped. Restarting in 5s..."
  sleep 5
done
```

Simpan sebagai `run-forever.sh` dan jalankan: `bash run-forever.sh`

---

## 8. Troubleshooting

### `OpenCL miner belum ada`

Build dulu:

```bash
sh scripts/build-opencl.sh
```

### `clGetDeviceIDs(GPU)` error

GPU tidak terdeteksi oleh OpenCL. Cek:

```bash
nvidia-smi          # Apakah GPU terlihat?
clinfo -l           # Apakah OpenCL device terlihat?
ls /etc/OpenCL/vendors/  # Apakah ada .icd file?
```

Fix:

```bash
mkdir -p /etc/OpenCL/vendors
echo "libnvidia-opencl.so.1" > /etc/OpenCL/vendors/nvidia.icd
```

### `insufficient funds`

Wallet tidak punya ETH. Kirim ETH ke wallet mining kamu.

### `execution reverted` / `InsufficientWork`

Challenge berubah sebelum TX masuk. Ini normal — miner akan otomatis coba lagi.
Naikkan `PRIORITY_FEE_GWEI` untuk prioritas lebih tinggi.

### `GenesisNotComplete`

Mining belum dibuka oleh kontrak. Tunggu sampai genesis selesai.
Cek status: `npm run check`

### Node.js crash / out of memory

Pastikan instance punya RAM cukup (minimal 4GB).

### SSH disconnect = miner mati

Selalu jalankan miner di `screen`, `tmux`, atau `nohup`.

---

## 9. Estimasi Biaya

### Biaya Vast.ai

- GPU murah (RTX 3060): ~$0.05-0.10/jam = ~$1.20-2.40/hari
- GPU medium (RTX 3090): ~$0.10-0.20/jam = ~$2.40-4.80/hari  
- GPU mahal (A100): ~$0.50-1.00/jam = ~$12-24/hari

### Biaya Gas Ethereum

- Per transaksi mine(): ~200-450k gas
- Dengan gas 5 Gwei + priority 2 Gwei: ~$0.50-2.00 per mint
- Biaya tergantung network congestion

### Apakah Profitable?

Tergantung:
- Harga token HASH256 vs biaya gas + biaya GPU
- Reward per epoch (menurun seiring era naik)
- Difficulty (naik kalau banyak miner)
- Gas price saat ini

Cek reward saat ini: `npm run check` → lihat `reward` field.

---

## Quick Reference

```bash
# Setup (pertama kali)
bash setup-vastai.sh
nano .env                       # Edit PRIVATE_KEY

# Mining
npm run start:gpu               # GPU mining
npm run start:cpu               # CPU mining (lambat)
npm run check                   # Cek status kontrak

# Background mining
screen -S miner && npm run start:gpu    # Ctrl+A D untuk detach
screen -r miner                          # Reconnect

# Monitoring
tail -f miner.log               # Kalau pakai nohup
nvidia-smi                      # Monitor GPU usage
```
