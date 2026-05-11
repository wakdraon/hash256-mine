#!/usr/bin/env bash
# =============================================================================
#  HASH256 GPU Miner - Vast.ai One-Click Setup
# =============================================================================
#
#  Jalankan di Vast.ai instance (SSH/Jupyter terminal):
#
#    bash setup-vastai.sh
#
#  Script ini akan:
#    1. Install Node.js 20 LTS
#    2. Install OpenCL headers + ICD loader
#    3. Clone repo & npm install
#    4. Build binary OpenCL GPU miner
#    5. Verifikasi GPU terdeteksi
#    6. Buat template .env
#
#  Setelah selesai, edit .env lalu jalankan: npm run start:gpu
# =============================================================================
set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }

# ---------------------------------------------------------------------------
# 1. Detect GPU
# ---------------------------------------------------------------------------
info "Mengecek GPU..."
if command -v nvidia-smi &>/dev/null; then
  nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader
  info "NVIDIA GPU terdeteksi."
else
  warn "nvidia-smi tidak ditemukan. Pastikan instance Vast.ai kamu pakai GPU NVIDIA."
fi

# ---------------------------------------------------------------------------
# 2. Install system dependencies
# ---------------------------------------------------------------------------
info "Menginstall system dependencies..."
apt-get update -qq
apt-get install -y -qq build-essential ocl-icd-opencl-dev clinfo git curl ca-certificates > /dev/null 2>&1
info "System dependencies terinstall."

# ---------------------------------------------------------------------------
# 3. Install Node.js 20 LTS (kalau belum ada)
# ---------------------------------------------------------------------------
if command -v node &>/dev/null; then
  NODE_VERSION=$(node -v)
  info "Node.js sudah ada: $NODE_VERSION"
else
  info "Menginstall Node.js 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
  apt-get install -y -qq nodejs > /dev/null 2>&1
  info "Node.js terinstall: $(node -v)"
fi

# ---------------------------------------------------------------------------
# 4. Verify OpenCL
# ---------------------------------------------------------------------------
info "Mengecek OpenCL devices..."
if command -v clinfo &>/dev/null; then
  GPU_COUNT=$(clinfo -l 2>/dev/null | grep -c "Device" || true)
  if [ "$GPU_COUNT" -gt 0 ]; then
    info "OpenCL: $GPU_COUNT device(s) terdeteksi."
    clinfo -l
  else
    warn "OpenCL: tidak ada device terdeteksi."
    warn "Coba install NVIDIA OpenCL ICD:"
    warn "  apt-get install -y nvidia-opencl-icd"
    warn "Atau cek apakah file /etc/OpenCL/vendors/*.icd ada."

    # Attempt to fix: on Vast.ai NVIDIA instances, the ICD file might be missing
    if [ -f /usr/lib/x86_64-linux-gnu/libnvidia-opencl.so.1 ] || [ -f /usr/lib/libnvidia-opencl.so.1 ]; then
      info "Menemukan libnvidia-opencl, membuat ICD file..."
      mkdir -p /etc/OpenCL/vendors
      echo "libnvidia-opencl.so.1" > /etc/OpenCL/vendors/nvidia.icd
      info "ICD file dibuat. Mengecek ulang..."
      clinfo -l || true
    fi
  fi
else
  warn "clinfo tidak tersedia."
fi

# ---------------------------------------------------------------------------
# 5. Clone repo (kalau belum ada)
# ---------------------------------------------------------------------------
WORK_DIR="${HASH256_DIR:-/root/hash256-mine}"

if [ -d "$WORK_DIR/.git" ]; then
  info "Repo sudah ada di $WORK_DIR, git pull..."
  cd "$WORK_DIR"
  git pull --ff-only || true
else
  info "Cloning repo..."
  git clone https://github.com/wakdraon/hash256-mine "$WORK_DIR"
  cd "$WORK_DIR"
fi

# ---------------------------------------------------------------------------
# 6. npm install
# ---------------------------------------------------------------------------
info "Menjalankan npm install..."
npm install --production
info "Dependencies terinstall."

# ---------------------------------------------------------------------------
# 7. Build OpenCL miner binary
# ---------------------------------------------------------------------------
info "Building OpenCL GPU miner..."
mkdir -p bin
if cc native/hash256_opencl.c -O3 -o bin/hash256-opencl -lOpenCL 2>/dev/null; then
  info "Binary GPU miner berhasil dibuild: bin/hash256-opencl"
  ls -lh bin/hash256-opencl
else
  error "Gagal build OpenCL miner. Cek apakah OpenCL headers terinstall."
  error "Jalankan: apt-get install -y ocl-icd-opencl-dev"
  exit 1
fi

# ---------------------------------------------------------------------------
# 8. Create .env (kalau belum ada)
# ---------------------------------------------------------------------------
if [ ! -f .env ]; then
  cat > .env <<'EOF'
# === HASH256 Miner Configuration ===

# Ethereum RPC URL (public node, gratis tapi lambat)
# Untuk performa lebih baik, pakai Alchemy/Infura/QuickNode
RPC_URL=https://ethereum-rpc.publicnode.com

# PRIVATE KEY wallet mining (JANGAN pakai wallet utama!)
# Buat wallet baru khusus mining, kirim sedikit ETH untuk gas
PRIVATE_KEY=0xPRIVATE_KEY_WALLET_KAMU

# Mining backend: opencl (GPU), cpu, atau auto
MINER_BACKEND=opencl

# GPU batch size (default 67 juta, naikkan kalau GPU kuat)
# RTX 3090/4090: coba 134217728 (128M)
# RTX 3060/3070: coba 67108864 (64M) 
GPU_BATCH_SIZE=67108864

# Gas priority fee dalam Gwei (naikkan kalau kompetisi tinggi)
PRIORITY_FEE_GWEI=2

# Terus mining setelah berhasil 1x? true/false
KEEP_MINING=true

# Telegram Bot (opsional - untuk notifikasi mining via Telegram)
# Buat bot di @BotFather, lalu paste token di sini
TELEGRAM_BOT_TOKEN=
# Chat ID kamu (kirim /start ke bot, chat ID akan auto-detect)
TELEGRAM_CHAT_ID=
EOF
  info ".env dibuat. EDIT DULU sebelum mining!"
  warn ">>> nano .env  (atau vi .env)"
  warn ">>> Isi PRIVATE_KEY dengan private key wallet mining kamu"
else
  info ".env sudah ada, skip."
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
echo ""
echo "============================================="
echo -e "${GREEN}  SETUP SELESAI!${NC}"
echo "============================================="
echo ""
echo "Langkah selanjutnya:"
echo ""
echo "  1. Edit .env → isi PRIVATE_KEY"
echo "     nano .env"
echo ""
echo "  2. (Opsional) Cek status kontrak"
echo "     npm run check"
echo ""
echo "  3. Jalankan GPU miner"
echo "     npm run start:gpu"
echo ""
echo "  4. Dengan Telegram notifikasi"
echo "     npm run start:telegram:gpu"
echo ""
echo "  5. Atau jalankan di background (tetap jalan walau SSH disconnect)"
echo "     nohup npm run start:telegram:gpu > miner.log 2>&1 &"
echo "     tail -f miner.log"
echo ""
echo "============================================="
