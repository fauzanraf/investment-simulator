const express = require('express');
const cors = require('cors');
const YahooFinance = require('yahoo-finance2').default; // v3 class
let yahooFinance;
try {
    yahooFinance = new YahooFinance();
} catch (e) {
    yahooFinance = YahooFinance; // Fallback if it's v2
}

const app = express();
app.use(cors());

// Helper to safely extract and format values
const safeVal = (val) => {
    if (val === undefined || val === null || Number.isNaN(val)) return null;
    return val;
};

// ── 1. Ticker Search ──────────────────────────────────────────────────
app.get('/api/search', async (req, res) => {
    try {
        const query = req.query.q || '';
        if (!query.trim()) return res.json([]);

        const results = await yahooFinance.search(query, { quotesCount: 8, newsCount: 0 });

        const quotes = (results.quotes || []).map(q => ({
            symbol: q.symbol || '',
            name: q.shortname || q.longname || '',
            type: q.quoteType || '',
            exchange: q.exchange || ''
        }));
        res.json(quotes);
    } catch (err) {
        console.error('Search error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── 2. Historical Price Data ──────────────────────────────────────────
app.get('/api/stock/:ticker/history', async (req, res) => {
    try {
        const { ticker } = req.params;
        const period = req.query.period || '10y';
        const interval = req.query.interval || '1mo';

        // Map python yfinance periods to JS dates
        const periodMap = {
            '1y': 1, '3y': 3, '5y': 5, '10y': 10, 'max': 20
        };
        const years = periodMap[period.toLowerCase()] || 10;
        const period1 = new Date();
        period1.setFullYear(period1.getFullYear() - years);

        const queryOptions = {
            period1: period1,
            period2: new Date(),
            interval: interval === '1mo' ? '1mo' : interval === '1wk' ? '1wk' : '1d' // yf2 uses '1mo', '1d' etc.
        };

        const result = await yahooFinance.historical(ticker, queryOptions);

        if (!result || result.length === 0) {
            return res.status(404).json({ error: `No data found for ${ticker}` });
        }

        const data = result.map(row => ({
            date: row.date.toISOString().split('T')[0],
            open: safeVal(row.open),
            high: safeVal(row.high),
            low: safeVal(row.low),
            close: safeVal(row.close),
            adjClose: safeVal(row.adjClose),
            volume: safeVal(row.volume),
        }));

        res.json({
            ticker: ticker.toUpperCase(),
            period,
            interval,
            data
        });
    } catch (err) {
        console.error('History error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── 3. Company Information ────────────────────────────────────────────
app.get('/api/stock/:ticker/info', async (req, res) => {
    try {
        const { ticker } = req.params;
        const quote = await yahooFinance.quote(ticker);
        const quoteSummary = await yahooFinance.quoteSummary(ticker, {
            modules: ['assetProfile', 'summaryDetail', 'defaultKeyStatistics', 'financialData']
        });

        const profile = quoteSummary.assetProfile || {};
        const detail = quoteSummary.summaryDetail || {};
        const stats = quoteSummary.defaultKeyStatistics || {};
        const fin = quoteSummary.financialData || {};

        const result = {
            symbol: quote.symbol || ticker.toUpperCase(),
            name: quote.longName || quote.shortName || ticker.toUpperCase(),
            sector: profile.sector || null,
            industry: profile.industry || null,
            description: profile.longBusinessSummary || null,
            website: profile.website || null,
            country: profile.country || null,
            currency: quote.currency || 'USD',
            exchange: quote.fullExchangeName || quote.exchange || null,

            // Price data
            currentPrice: safeVal(fin.currentPrice || quote.regularMarketPrice),
            previousClose: safeVal(detail.previousClose || quote.regularMarketPreviousClose),
            open: safeVal(detail.open || quote.regularMarketOpen),
            dayHigh: safeVal(detail.dayHigh || quote.regularMarketDayHigh),
            dayLow: safeVal(detail.dayLow || quote.regularMarketDayLow),

            // 52-week range
            fiftyTwoWeekHigh: safeVal(detail.fiftyTwoWeekHigh || quote.fiftyTwoWeekHigh),
            fiftyTwoWeekLow: safeVal(detail.fiftyTwoWeekLow || quote.fiftyTwoWeekLow),

            // Volume
            volume: safeVal(detail.volume || quote.regularMarketVolume),
            avgVolume: safeVal(detail.averageVolume || quote.averageDailyVolume10Day),

            // Fundamentals
            marketCap: safeVal(detail.marketCap || quote.marketCap),
            trailingPE: safeVal(detail.trailingPE || quote.trailingPE),
            forwardPE: safeVal(detail.forwardPE || quote.forwardPE),
            trailingEps: safeVal(stats.trailingEps || quote.epsTrailingTwelveMonths),
            forwardEps: safeVal(stats.forwardEps || quote.epsForward),
            dividendYield: safeVal(detail.dividendYield || quote.dividendYield),
            dividendRate: safeVal(detail.dividendRate),
            beta: safeVal(detail.beta || stats.beta),
            bookValue: safeVal(stats.bookValue || quote.bookValue),
            priceToBook: safeVal(stats.priceToBook || quote.priceToBook),

            // Additional
            fiftyDayAverage: safeVal(detail.fiftyDayAverage || quote.fiftyDayAverage),
            twoHundredDayAverage: safeVal(detail.twoHundredDayAverage || quote.twoHundredDayAverage),

            // Quote type (EQUITY, ETF, MUTUALFUND, etc.)
            quoteType: quote.quoteType || null,
        };

        res.json(result);
    } catch (err) {
        console.error('Info error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── 4. Dividend History ───────────────────────────────────────────────
app.get('/api/stock/:ticker/dividends', async (req, res) => {
    try {
        const { ticker } = req.params;

        // Fetch 20 years of dividends
        const period1 = new Date();
        period1.setFullYear(period1.getFullYear() - 20);

        const result = await yahooFinance.historical(ticker, {
            period1,
            period2: new Date(),
            events: 'dividends'
        });

        if (!result || result.length === 0) {
            return res.json({ ticker: ticker.toUpperCase(), dividends: [], annual: [] });
        }

        const divList = [];
        const annualMap = {};

        for (const row of result) {
            if (row.dividends) {
                const dateStr = row.date.toISOString().split('T')[0];
                const year = row.date.getFullYear();

                divList.push({
                    date: dateStr,
                    amount: safeVal(row.dividends)
                });

                if (!annualMap[year]) annualMap[year] = 0;
                annualMap[year] += row.dividends;
            }
        }

        // Sort divList by date
        divList.sort((a, b) => new Date(a.date) - new Date(b.date));

        const annualList = Object.entries(annualMap)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([year, total]) => ({
                year: Number(year),
                total: Math.round(total * 10000) / 10000
            }));

        res.json({
            ticker: ticker.toUpperCase(),
            dividends: divList,
            annual: annualList
        });
    } catch (err) {
        console.error('Dividends error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── 5. Financial Statements ───────────────────────────────────────────
app.get('/api/stock/:ticker/financials', async (req, res) => {
    try {
        const { ticker } = req.params;
        const result = await yahooFinance.quoteSummary(ticker, {
            modules: ['incomeStatementHistory', 'balanceSheetHistory', 'cashflowStatementHistory']
        });

        const formatStatement = (statementData) => {
            if (!statementData || !statementData.length) return [];
            return statementData.map(period => {
                const dict = { period: period.endDate.toISOString().split('T')[0] };
                for (const [key, value] of Object.entries(period)) {
                    if (key !== 'endDate' && key !== 'maxAge' && typeof value === 'number') {
                        dict[key] = value;
                    } else if (value && typeof value === 'object' && value.raw !== undefined) {
                        dict[key] = value.raw;
                    }
                }
                return dict;
            });
        };

        res.json({
            ticker: ticker.toUpperCase(),
            incomeStatement: formatStatement(result.incomeStatementHistory?.incomeStatementHistory),
            balanceSheet: formatStatement(result.balanceSheetHistory?.balanceSheetStatements),
            cashFlow: formatStatement(result.cashflowStatementHistory?.cashflowStatements)
        });
    } catch (err) {
        console.error('Financials error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── 6. ETF Information ────────────────────────────────────────────────
app.get('/api/stock/:ticker/etf', async (req, res) => {
    try {
        const { ticker } = req.params;
        const result = await yahooFinance.quoteSummary(ticker, {
            modules: ['topHoldings']
        });

        if (!result.topHoldings) {
            return res.status(400).json({ error: `${ticker} is not an ETF or no holdings data` });
        }

        const holdings = result.topHoldings;
        const topHoldings = (holdings.holdings || []).map(h => ({
            symbol: h.symbol,
            name: h.holdingName,
            weight: h.holdingPercent
        }));

        const sectorWeightings = (holdings.sectorWeightings || []).map(s => {
            // Unpack object { "realestate": 0.05 } -> sector: Real Estate, weight: 0.05
            const key = Object.keys(s)[0];
            const weight = s[key];
            const name = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            return { sector: name, weight };
        });

        res.json({
            ticker: ticker.toUpperCase(),
            topHoldings,
            sectorWeightings
        });
    } catch (err) {
        console.error('ETF error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Start Server Locally
if (require.main === module) {
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
        console.log(`🚀 Node.js Backend Server starting on http://localhost:${PORT}`);
    });
}

// Export for Vercel
module.exports = app;
