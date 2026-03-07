# Investment Simulator

A financial dashboard that simulates investments, showing key statistics, revenue vs profit, charts, and dividend history, powered by real market data using `yfinance`.

## Architecture
This project is split into two parts:
1. **Frontend**: A React application using Vite.
2. **Backend**: A Python Flask REST API server that provides Yahoo Finance data.

---

## How to Run It Yourself

### Prerequisites
- [Node.js](https://nodejs.org/) (installed and ready)
- [Python 3.x](https://www.python.org/) (installed and ready)

### 1. Start the Backend Server
The backend serves market data on `http://localhost:5000`.

1. Open your terminal and navigate to the `backend` folder:
   ```bash
   cd backend
   ```
2. (Optional but recommended) Create and activate a Virtual Environment:
   ```bash
   python -m venv venv
   # On Windows:
   venv\Scripts\activate
   # On macOS/Linux:
   source venv/bin/activate
   ```
3. Install the required Python packages:
   ```bash
   pip install -r requirements.txt
   ```
4. Run the Flask application:
   ```bash
   python app.py
   ```
You should see: `🚀 Investment Simulator API Server starting on http://localhost:5000`

### 2. Start the Frontend Server
The frontend runs the user interface, typically hosted on `http://localhost:5173`.

1. Open a **new** terminal window and navigate to the `frontend` folder:
   ```bash
   cd frontend
   ```
2. Install the necessary Node modules:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Open the Local URL shown in your terminal (usually `http://localhost:5173`) in your web browser.

## Deployment

This project consists of a frontend (React) and a backend (Python Flask). **GitHub Pages can only host the frontend** because it only supports static files. 

### 1. Deploying the Backend
To make the application fully functional online, you must deploy the `backend/` folder to a service that supports Python, such as:
- **[Render](https://render.com/)** (Free tier available)
- **[Railway](https://railway.app/)**
- **[Heroku](https://www.heroku.com/)**

Once your backend is deployed, note the public URL (e.g., `https://my-investment-api.onrender.com`).

### 2. Deploying the Frontend to GitHub Pages
1. Open the `frontend/` folder.
2. In your terminal, run:
   ```bash
   npm run deploy
   ```
   *(This script runs `vite build`, then uses the `gh-pages` package to push the `dist/` folder to the `gh-pages` branch).*

3. **Connecting to your Deployed Backend**: 
   By default, the deployed frontend will have an empty base URL and try to fetch from the same origin. 
   To point it to your live backend, create a `.env` file in the `frontend/` folder before running the deploy command:
   ```env
   VITE_API_URL=https://my-investment-api.onrender.com
   ```
   Then run `npm run deploy` again.

---

Enjoy the Investment Simulator!
