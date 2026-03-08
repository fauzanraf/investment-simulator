# Investment Simulator

A financial dashboard that simulates investments, showing key statistics, revenue vs profit, historical charts, dividend history, and ETF allocation data. Powered by real market data using `yahoo-finance2` via a custom Node.js backend.

## Architecture
The application uses a **split architecture**:
1. **Frontend**: React (Vite) application hosted on GitHub Pages or any static host.
2. **Backend**: Node.js Express server acting as an API proxy to `yahoo-finance2`. Hosted as a Vercel Serverless Function to bypass CORS and provide secure, reliable data fetching.

**Features:**
- 🔍 Ticker search (Stocks, ETFs, Mutual Funds)
- 📊 Price history chart (1Y / 3Y / 5Y / 10Y)
- 📈 Trailing returns & CAGR
- 💰 Dividend history & annual chart
- 📋 Financial statements (Income, Balance Sheet, Cash Flow)
- 🏢 Company info & key statistics
- 📉 Revenue vs Profit dual-axis chart
- 🥧 ETF Top Holdings & Sector Weightings

---

## How to Run It Yourself (Locally)

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+ recommended)

### 1. Clone & Install
```bash
git clone https://github.com/your-username/investment-simulator.git
cd investment-simulator
```

### 2. Start the Backend
```bash
cd backend
npm install
npm run dev
```
The backend will start on `http://localhost:5000`. It requires no API keys.

### 3. Start the Frontend
Open a new terminal window:
```bash
cd frontend
npm install
npm run dev
```
The frontend proxy (`vite.config.js`) is configured to route `/api` requests to your local backend automatically.

---

## Deployment 

### 1. Deploy the Backend to Vercel
1. Install the Vercel CLI: `npm i -g vercel`
2. Navigate to the `backend/` folder and initialize a deployment:
   ```bash
   cd backend
   vercel
   ```
3. Follow the CLI prompts. Once deployed, Vercel will give you a production URL (e.g., `https://your-backend-app.vercel.app`).

### 2. Deploy the Frontend to GitHub Pages
1. Open `frontend/.env` (or create it) and set `VITE_API_URL` to your new Vercel backend URL:
   ```env
   VITE_API_URL=https://your-backend-app.vercel.app
   ```
2. Build and deploy:
   ```bash
   npm run deploy
   ```
   This builds the app and pushes the `dist/` folder to the `gh-pages` branch.

---

## API Rate Limits
- The backend uses robust endpoints from Yahoo Finance.
- It is recommended to use the `yahoo-finance2` caching mechanisms if you plan to scale the application to many concurrent users.

---

Enjoy the Investment Simulator!
