# macOS Development Setup Guide

## Prerequisites

### 1. Homebrew
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### 2. Node.js 20 LTS
```bash
brew install node@20
brew link --force --overwrite node@20
```

### 3. pnpm
```bash
npm install -g pnpm
```

## Project Setup

### 1. Clone Repository
```bash
git clone https://github.com/Kernalsmelly/solana-memecoin-bot.git
```

### 2. Install Dependencies
```bash
cd solana-memecoin-bot
pnpm install
```

### 3. Build & Test
```bash
pnpm run build
pnpm run test
```

### 4. Development Scripts
- `pnpm run dev` - Start development server
- `pnpm run test:watch` - Run tests in watch mode

## Environment Variables

Create a `.env` file in the root directory:
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
```bash
RPC_ENDPOINT=https://api.mainnet-beta.solana.com
BIRDEYE_WS=wss://token-price.birdeye.so
SLIPPAGE_BPS=300
WALLET_PRIVATE_KEY=<<your-key-here>>
```

## Development Tips

1. Use VS Code with these extensions:
   - ESLint
   - Prettier
   - TypeScript

2. Keep your dependencies up to date:
```bash
pnpm outdated
pnpm update
```
