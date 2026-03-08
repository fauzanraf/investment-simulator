import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
    TrendingUp,
    TrendingDown,
    Info,
    DollarSign,
    Calendar,
    PieChart,
    Search,
    Activity,
    ChevronDown,
    Globe,
    BarChart3,
    Wallet,
    AlertCircle,
    Building2,
    Layers,
    Calculator,
} from 'lucide-react';

// ── Helpers ────────────────────────────────────────────────────
const formatCurrency = (val, currency = 'USD') => {
    if (val == null) return '—';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(val);
};

const formatPercent = (val) => {
    if (val == null) return '—';
    return `${val > 0 ? '+' : ''}${val.toFixed(2)}%`;
};

const getCurrencySymbol = (currency = 'USD') => {
    try {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 })
            .format(0).replace(/[\d.,\s]/g, '');
    } catch { return '$'; }
};

const formatLargeNumber = (val, currency = 'USD') => {
    if (val == null) return '—';
    const sym = getCurrencySymbol(currency);
    const abs = Math.abs(val);
    const sign = val < 0 ? '-' : '';
    if (abs >= 1e12) return `${sign}${sym}${(abs / 1e12).toFixed(2)}T`;
    if (abs >= 1e9) return `${sign}${sym}${(abs / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${sign}${sym}${(abs / 1e6).toFixed(2)}M`;
    return formatCurrency(val, currency);
};

const formatNumber = (val) => {
    if (val == null) return '—';
    return new Intl.NumberFormat('en-US').format(val);
};

const calcReturn = (current, past) => {
    if (!current || !past || past === 0) return null;
    return ((current - past) / past) * 100;
};

const calcCAGR = (current, past, years) => {
    if (!current || !past || past === 0 || years <= 0) return null;
    return (((current / past) ** (1 / years)) - 1) * 100;
};

const calcDCA = (all, monthsAgo, initialAmount, monthlyContribution) => {
    if (!all || all.length === 0 || monthsAgo <= 0) return null;

    const initAmt = Number(initialAmount) || 0;
    const monthlyAmt = Number(monthlyContribution) || 0;

    // We only simulate up to monthsAgo months of data
    const startIndex = Math.max(0, all.length - 1 - monthsAgo);

    // Check if we actually have data that far back (allow a 2 month tolerance)
    if (monthsAgo > all.length + 2) return null;

    let shares = 0;
    let totalInvested = 0;
    let actualMonths = 0;

    for (let i = startIndex; i < all.length; i++) {
        const price = all[i]?.adjClose || all[i]?.close;
        if (!price) continue;
        if (actualMonths === 0) {
            shares += initAmt / price;
            totalInvested += initAmt;
        } else {
            shares += monthlyAmt / price;
            totalInvested += monthlyAmt;
        }
        actualMonths++;
    }
    const currentPrice = all[all.length - 1]?.adjClose || all[all.length - 1]?.close;
    if (!currentPrice || actualMonths === 0) return null;
    const portfolioValue = shares * currentPrice;

    // Total Return %
    const totalReturnPct = totalInvested > 0 ? ((portfolioValue - totalInvested) / totalInvested) * 100 : 0;

    const years = actualMonths / 12;
    if (years <= 0 || totalInvested <= 0) return null;
    const cagr = ((portfolioValue / totalInvested) ** (1 / years)) - 1;

    return {
        cagr: cagr * 100,
        trailing: totalReturnPct
    };
};

// ── API Calls ──────────────────────────────────────────────────
const rawApiUrl = import.meta.env.VITE_API_URL || '';
const API_BASE = rawApiUrl.replace(/\/$/, "");

const api = {
    search: async (q) => {
        const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(q)}`);
        if (!res.ok) throw new Error('Search failed');
        return res.json();
    },
    history: async (ticker, period = '10y', interval = '1mo') => {
        const res = await fetch(`${API_BASE}/api/stock/${ticker}/history?period=${period}&interval=${interval}`);
        if (!res.ok) throw new Error(`History failed for ${ticker}`);
        return res.json();
    },
    info: async (ticker) => {
        const res = await fetch(`${API_BASE}/api/stock/${ticker}/info`);
        if (!res.ok) throw new Error(`Info failed for ${ticker}`);
        return res.json();
    },
    dividends: async (ticker) => {
        const res = await fetch(`${API_BASE}/api/stock/${ticker}/dividends`);
        if (!res.ok) return null;
        return res.json();
    },
    financials: async (ticker) => {
        const res = await fetch(`${API_BASE}/api/stock/${ticker}/financials`);
        if (!res.ok) return null;
        return res.json();
    },
    etf: async (ticker) => {
        const res = await fetch(`${API_BASE}/api/stock/${ticker}/etf`);
        if (!res.ok) return null;
        return res.json();
    },
};

// ═══════════════════════════════════════════════════════════════
//  MAIN APP
// ═══════════════════════════════════════════════════════════════
export default function App() {
    const [ticker, setTicker] = useState('AAPL');
    const [loadingTicker, setLoadingTicker] = useState('AAPL');
    const [stockInfo, setStockInfo] = useState(null);
    const [historyData, setHistoryData] = useState(null);
    const [dividendData, setDividendData] = useState(null);
    const [financialData, setFinancialData] = useState(null);
    const [etfData, setEtfData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [hoveredPoint, setHoveredPoint] = useState(null);
    const [timeframe, setTimeframe] = useState('10Y');
    const [showStickyBar, setShowStickyBar] = useState(false);
    const headerRef = useRef(null);

    // DCA Configuration State
    const [dcaInitialAmount, setDcaInitialAmount] = useState(1000);
    const [dcaMonthlyContribution, setDcaMonthlyContribution] = useState(100);

    // Show sticky bar when the header scrolls out of view
    useEffect(() => {
        if (!headerRef.current) return;
        const observer = new IntersectionObserver(
            ([entry]) => setShowStickyBar(!entry.isIntersecting),
            { threshold: 0, rootMargin: '-64px 0px 0px 0px' } // 64px = nav height
        );
        observer.observe(headerRef.current);
        return () => observer.disconnect();
    }, [loading]);

    // Load all data for a ticker
    const loadTicker = useCallback(async (symbol) => {
        setLoadingTicker(symbol.toUpperCase());
        setLoading(true);
        setError(null);
        setHoveredPoint(null);

        try {
            // Fetch sequentially or parallel depending on backend limits
            // The new Node backend can handle parallel requests well
            const infoPromise = api.info(symbol);
            const historyPromise = api.history(symbol);
            const dividendsPromise = api.dividends(symbol);
            const financialsPromise = api.financials(symbol);

            const info = await infoPromise;
            setStockInfo(info);
            setTicker(symbol.toUpperCase());

            const history = await historyPromise;
            setHistoryData(history);

            const dividends = await dividendsPromise;
            setDividendData(dividends);

            const financials = await financialsPromise;
            setFinancialData(financials);

            // Fetch ETF-specific data if applicable
            if (info.quoteType === 'ETF') {
                try {
                    const etf = await api.etf(symbol);
                    setEtfData(etf);
                } catch {
                    setEtfData(null);
                }
            } else {
                setEtfData(null);
            }
        } catch (err) {
            setError(err.message || 'Failed to load data. Please try again.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadTicker('SPY');
    }, [loadTicker]);

    // Filter history data based on timeframe
    const chartData = useMemo(() => {
        if (!historyData?.data?.length) return [];
        const all = historyData.data;
        const tfMonths = { '1Y': 12, '3Y': 36, '5Y': 60, '10Y': all.length };
        const months = tfMonths[timeframe] || all.length;
        return all.slice(Math.max(all.length - months, 0));
    }, [historyData, timeframe]);

    // Calculate returns — only show periods that have enough data
    const metrics = useMemo(() => {
        if (!historyData?.data?.length) return null;
        const all = historyData.data;
        const current = all[all.length - 1]?.adjClose || all[all.length - 1]?.close;
        if (!current) return null;

        // Calculate actual data span in months
        const firstDate = new Date(all[0].date);
        const lastDate = new Date(all[all.length - 1].date);
        const totalMonths = (lastDate.getFullYear() - firstDate.getFullYear()) * 12
            + (lastDate.getMonth() - firstDate.getMonth());

        // Only return a price if we have enough months of data for that period.
        // Use a 2-month tolerance so ~119 months still qualifies for a 120-month (10y) period.
        const TOLERANCE = 2;
        const getPrice = (monthsAgo) => {
            if (monthsAgo > totalMonths + TOLERANCE) return null; // not enough data
            // Clamp to the first available data point if slightly out of range
            const idx = Math.max(0, all.length - 1 - monthsAgo);
            return all[idx]?.adjClose || all[idx]?.close || null;
        };

        // YTD: find start of current year
        const currentDate = new Date(all[all.length - 1].date);
        const currentYear = currentDate.getFullYear();
        const ytdStart = all.find((d) => new Date(d.date).getFullYear() === currentYear);
        const ytdPrice = ytdStart?.adjClose || ytdStart?.close;
        const ytdMonths = currentDate.getMonth() + 1;

        const p1y = getPrice(12);
        const p3y = getPrice(36);
        const p5y = getPrice(60);
        const p10y = getPrice(120);

        return {
            current,
            totalMonths,
            trailing: {
                ytd: calcReturn(current, ytdPrice),
                '1y': calcReturn(current, p1y),
                '3y': calcReturn(current, p3y),
                '5y': calcReturn(current, p5y),
                '10y': calcReturn(current, p10y),
            },
            cagr: {
                ytd: calcCAGR(current, ytdPrice, ytdMonths / 12),
                '1y': calcCAGR(current, p1y, 1),
                '3y': calcCAGR(current, p3y, 3),
                '5y': calcCAGR(current, p5y, 5),
                '10y': calcCAGR(current, p10y, 10),
            },
            dcaCagr: {
                ytd: calcDCA(all, ytdMonths, dcaInitialAmount, dcaMonthlyContribution)?.cagr,
                '1y': calcDCA(all, 12, dcaInitialAmount, dcaMonthlyContribution)?.cagr,
                '3y': calcDCA(all, 36, dcaInitialAmount, dcaMonthlyContribution)?.cagr,
                '5y': calcDCA(all, 60, dcaInitialAmount, dcaMonthlyContribution)?.cagr,
                '10y': calcDCA(all, 120, dcaInitialAmount, dcaMonthlyContribution)?.cagr,
            },
            dcaTrailing: {
                ytd: calcDCA(all, ytdMonths, dcaInitialAmount, dcaMonthlyContribution)?.trailing,
                '1y': calcDCA(all, 12, dcaInitialAmount, dcaMonthlyContribution)?.trailing,
                '3y': calcDCA(all, 36, dcaInitialAmount, dcaMonthlyContribution)?.trailing,
                '5y': calcDCA(all, 60, dcaInitialAmount, dcaMonthlyContribution)?.trailing,
                '10y': calcDCA(all, 120, dcaInitialAmount, dcaMonthlyContribution)?.trailing,
            }
        };
    }, [historyData, dcaInitialAmount, dcaMonthlyContribution]);

    if (loading) {
        return (
            <div className="loading-page">
                <div className="spinner" />
                <p className="loading-text">Loading {loadingTicker.length === 24 ? 'mutual fund' : loadingTicker} data...</p>
            </div>
        );
    }

    return (
        <div>
            {/* Navigation */}
            <nav className="nav">
                <div className="container nav-inner">
                    <div className="nav-brand">
                        <div className="nav-brand-icon">
                            <Activity size={20} />
                        </div>
                        <span className="nav-brand-text">Investment Simulator</span>
                    </div>

                    <div className="search-desktop">
                        <SearchBar onSelect={(symbol) => loadTicker(symbol)} />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div
                            style={{
                                width: 34,
                                height: 34,
                                borderRadius: '50%',
                                background: 'var(--accent-indigo-bg)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 700,
                                fontSize: '0.75rem',
                                color: 'var(--accent-indigo)',
                                border: '1px solid var(--border-light)',
                            }}
                        >
                            {stockInfo?.isMakmur ? 'MF' : 'YF'}
                        </div>
                    </div>
                </div>
            </nav>

            <div className="search-mobile">
                <SearchBar onSelect={(symbol) => loadTicker(symbol)} />
            </div>

            {/* Sticky Ticker Bar */}
            {stockInfo && (
                <div className={`sticky-ticker-bar ${showStickyBar ? 'visible' : ''}`}>
                    <div className="container sticky-ticker-inner">
                        <div className="sticky-ticker-left">
                            <span className="sticky-ticker-name">{stockInfo.name || ticker}</span>
                            <span className="sticky-ticker-badge">{stockInfo?.isMakmur ? 'Mutual Fund' : ticker}</span>
                        </div>
                        <div className="sticky-ticker-right">
                            <span className="sticky-ticker-price">
                                {formatCurrency(stockInfo.currentPrice, stockInfo.currency)}
                            </span>
                            {stockInfo.previousClose && stockInfo.currentPrice && (
                                <span className={`sticky-ticker-change ${stockInfo.currentPrice >= stockInfo.previousClose ? 'positive' : 'negative'}`}>
                                    {stockInfo.currentPrice >= stockInfo.previousClose ? (
                                        <TrendingUp size={13} />
                                    ) : (
                                        <TrendingDown size={13} />
                                    )}
                                    {formatPercent(calcReturn(stockInfo.currentPrice, stockInfo.previousClose))}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Content */}
            <main className="container sections" style={{ paddingTop: 32 }}>
                {error && (
                    <div className="error-banner animate-fade-in">
                        <AlertCircle size={18} />
                        {error}
                    </div>
                )}

                {/* Header: Stock Name + Price */}
                {stockInfo && (
                    <div className="page-header animate-fade-in" ref={headerRef}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                                <h1 className="stock-title">{stockInfo.name || ticker}</h1>
                                <span className="stock-ticker-badge">{stockInfo?.isMakmur ? 'Mutual Fund' : ticker}</span>
                            </div>
                            <p className="stock-meta">
                                {stockInfo.sector && (
                                    <>
                                        <Building2 size={14} /> {stockInfo.sector}
                                        {stockInfo.industry && ` · ${stockInfo.industry}`}
                                        &nbsp;&nbsp;
                                    </>
                                )}
                                <Globe size={14} /> {stockInfo.exchange || 'Exchange'} · {stockInfo.currency || 'USD'}
                            </p>
                        </div>

                        <div className="card price-card" style={{ padding: '20px 28px' }}>
                            <p className="price-label">Current Price</p>
                            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 8 }}>
                                <span className="price-value">{formatCurrency(stockInfo.currentPrice, stockInfo.currency)}</span>
                                {stockInfo.previousClose && stockInfo.currentPrice && (
                                    <span
                                        className={`price-change ${stockInfo.currentPrice >= stockInfo.previousClose ? 'positive' : 'negative'}`}
                                    >
                                        {stockInfo.currentPrice >= stockInfo.previousClose ? (
                                            <TrendingUp size={16} />
                                        ) : (
                                            <TrendingDown size={16} />
                                        )}
                                        {formatPercent(calcReturn(stockInfo.currentPrice, stockInfo.previousClose))}
                                    </span>
                                )}
                            </div>
                            <p className="price-sub">
                                Previous Close: {formatCurrency(stockInfo.previousClose, stockInfo.currency)}
                            </p>
                        </div>
                    </div>
                )}

                {/* Key Stats */}
                {stockInfo && (
                    <div className="card animate-fade-in stagger-1">
                        <div className="card-header">
                            <div className="card-title">
                                <Layers size={18} style={{ color: 'var(--accent-blue)' }} />
                                Key Statistics
                            </div>
                        </div>
                        <div className="card-body">
                            <div className="info-grid">
                                <InfoItem label="Market Cap" value={formatLargeNumber(stockInfo.marketCap, stockInfo.currency)} tooltip="Total market value of all outstanding shares. Calculated as share price × total shares outstanding." />
                                <InfoItem label="P/E (Trailing)" value={stockInfo.trailingPE?.toFixed(2)} tooltip="Trailing Price-to-Earnings ratio. Current stock price divided by the earnings per share (EPS) over the past 12 months. A higher P/E implies higher growth expectations." />
                                <InfoItem label="P/E (Forward)" value={stockInfo.forwardPE?.toFixed(2)} tooltip="Forward Price-to-Earnings ratio. Current stock price divided by estimated future EPS. Useful for comparing against trailing P/E to gauge expected growth." />
                                <InfoItem label="EPS (TTM)" value={stockInfo.trailingEps ? formatCurrency(stockInfo.trailingEps, stockInfo.currency) : null} tooltip="Earnings Per Share (Trailing Twelve Months). Net income divided by total shares outstanding over the last 12 months. Indicates profitability on a per-share basis." />
                                <InfoItem label="52W High" value={formatCurrency(stockInfo.fiftyTwoWeekHigh, stockInfo.currency)} tooltip="The highest price the stock has traded at in the past 52 weeks (1 year). Helps gauge how close the current price is to its recent peak." />
                                <InfoItem label="52W Low" value={formatCurrency(stockInfo.fiftyTwoWeekLow, stockInfo.currency)} tooltip="The lowest price the stock has traded at in the past 52 weeks (1 year). Helps assess downside risk relative to its recent trough." />
                                <InfoItem label="Dividend Yield" value={stockInfo.dividendYield ? `${stockInfo.dividendYield.toFixed(2)}%` : null} tooltip="Annual dividend payment as a percentage of the current stock price. A 2% yield means you earn $2 in dividends per year for every $100 invested." />
                                <InfoItem label="Beta" value={stockInfo.beta?.toFixed(2)} tooltip="Measures the stock's volatility relative to the overall market. Beta > 1 means more volatile than the market; Beta < 1 means less volatile. A beta of 1 moves in line with the market." />
                                <InfoItem label="Volume" value={formatNumber(stockInfo.volume)} tooltip="Number of shares traded during the most recent trading session. High volume indicates strong interest and better liquidity." />
                                <InfoItem label="Avg Volume" value={formatNumber(stockInfo.avgVolume)} tooltip="Average number of shares traded per day, typically over the past 3 months. Useful for comparing current volume to normal activity levels." />
                                <InfoItem label="50D Avg" value={formatCurrency(stockInfo.fiftyDayAverage, stockInfo.currency)} tooltip="50-Day Moving Average. The mean closing price over the last 50 trading days. A common short-term trend indicator — price above it suggests an uptrend." />
                                <InfoItem label="200D Avg" value={formatCurrency(stockInfo.twoHundredDayAverage, stockInfo.currency)} tooltip="200-Day Moving Average. The mean closing price over the last 200 trading days. A key long-term trend indicator used by institutional investors." />
                            </div>
                        </div>
                    </div>
                )}

                {/* Company Description */}
                {stockInfo?.description && <DescriptionCard description={stockInfo.description} />}

                {/* Chart */}
                {chartData.length > 0 && (
                    <div className="card animate-fade-in stagger-2">
                        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div className="card-title">
                                <BarChart3 size={18} style={{ color: 'var(--accent-blue)' }} />
                                Price History
                            </div>
                            <div style={{ display: 'flex', gap: 4 }}>
                                {['1Y', '3Y', '5Y', '10Y'].map((tf) => (
                                    <button
                                        key={tf}
                                        className={`timeframe-btn ${timeframe === tf ? 'active' : ''}`}
                                        onClick={() => setTimeframe(tf)}
                                    >
                                        {tf}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="card-body">
                            <PriceChart data={chartData} hoveredPoint={hoveredPoint} setHoveredPoint={setHoveredPoint} currency={stockInfo?.currency} />
                        </div>
                    </div>
                )}

                {/* Returns */}
                {metrics && (
                    <div className="two-col animate-fade-in stagger-3">
                        <div className="card">
                            <div className="card-header">
                                <div className="card-title">
                                    <PieChart size={18} style={{ color: 'var(--accent-indigo)' }} />
                                    Total Trailing Returns
                                </div>
                                <p className="card-subtitle">
                                    Absolute percentage change over each period, based on closing prices.
                                </p>
                            </div>
                            <div className="card-body">
                                <div className="metrics-grid">
                                    <MetricItem label="YTD" value={metrics.trailing.ytd} />
                                    <MetricItem label="1 Year" value={metrics.trailing['1y']} />
                                    <MetricItem label="3 Years" value={metrics.trailing['3y']} />
                                    <MetricItem label="5 Years" value={metrics.trailing['5y']} />
                                    <MetricItem label="10 Years" value={metrics.trailing['10y']} />
                                </div>
                                {metrics.totalMonths < 120 - 2 && (
                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 12, fontStyle: 'italic' }}>
                                        Note: This ticker has ~{Math.round(metrics.totalMonths)} months of data. Periods exceeding available history are shown as "—".
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="card">
                            <div className="card-header">
                                <div className="card-title">
                                    <TrendingUp size={18} style={{ color: 'var(--color-positive)' }} />
                                    CAGR
                                    <span className="info-tooltip-trigger">
                                        <Info size={15} style={{ color: 'var(--text-muted)' }} />
                                        <span className="info-tooltip-content">
                                            Compound Annual Growth Rate — the smoothed, annualized average return over each time period.
                                        </span>
                                    </span>
                                </div>
                                <p className="card-subtitle">Annualized average growth rate over each time period.</p>
                            </div>
                            <div className="card-body">
                                <div className="metrics-grid">
                                    <MetricItem label="YTD (Ann.)" value={metrics.cagr.ytd} />
                                    <MetricItem label="1 Year" value={metrics.cagr['1y']} />
                                    <MetricItem label="3 Years" value={metrics.cagr['3y']} />
                                    <MetricItem label="5 Years" value={metrics.cagr['5y']} />
                                    <MetricItem label="10 Years" value={metrics.cagr['10y']} />
                                </div>
                            </div>
                        </div>

                        <div className="card">
                            <div className="card-header">
                                <div className="card-title">
                                    <PieChart size={18} style={{ color: 'var(--accent-blue)' }} />
                                    DCA Total Trailing Returns
                                    <span className="info-tooltip-trigger">
                                        <Info size={15} style={{ color: 'var(--text-muted)' }} />
                                        <span className="info-tooltip-content">
                                            Absolute percentage change over each period if you continually bought shares at the configured DCA settings.
                                        </span>
                                    </span>
                                </div>
                                <p className="card-subtitle">Total return percentage of Dollar Cost Averaging.</p>
                            </div>
                            <div className="card-body">
                                <div className="metrics-grid">
                                    <MetricItem label="YTD" value={metrics.dcaTrailing.ytd} />
                                    <MetricItem label="1 Year" value={metrics.dcaTrailing['1y']} />
                                    <MetricItem label="3 Years" value={metrics.dcaTrailing['3y']} />
                                    <MetricItem label="5 Years" value={metrics.dcaTrailing['5y']} />
                                    <MetricItem label="10 Years" value={metrics.dcaTrailing['10y']} />
                                </div>
                            </div>
                        </div>

                        <div className="card">
                            <div className="card-header">
                                <div className="card-title">
                                    <Calculator size={18} style={{ color: 'var(--accent-blue)' }} />
                                    DCA CAGR
                                    <span className="info-tooltip-trigger">
                                        <Info size={15} style={{ color: 'var(--text-muted)' }} />
                                        <span className="info-tooltip-content">
                                            Return rate if you continually bought shares at the configured DCA settings below instead of a lumpsum.
                                        </span>
                                    </span>
                                </div>
                                <p className="card-subtitle">Annualized return of Dollar Cost Averaging.</p>
                            </div>
                            <div className="card-body">
                                <div className="metrics-grid">
                                    <MetricItem label="YTD (Ann.)" value={metrics.dcaCagr.ytd} />
                                    <MetricItem label="1 Year" value={metrics.dcaCagr['1y']} />
                                    <MetricItem label="3 Years" value={metrics.dcaCagr['3y']} />
                                    <MetricItem label="5 Years" value={metrics.dcaCagr['5y']} />
                                    <MetricItem label="10 Years" value={metrics.dcaCagr['10y']} />
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Note about limited history data span */}
                {metrics && metrics.totalMonths < 120 - 2 && (
                    <div style={{ marginTop: '-12px', marginBottom: '24px', paddingLeft: '8px' }}>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            Note: This ticker has ~{Math.round(metrics.totalMonths)} months of data. Periods exceeding available history are shown as "—".
                        </p>
                    </div>
                )}

                {chartData && chartData.length > 0 && (
                    <DCASimulator
                        chartData={chartData}
                        currency={stockInfo?.currency}
                        initialAmount={dcaInitialAmount}
                        setInitialAmount={setDcaInitialAmount}
                        monthlyContribution={dcaMonthlyContribution}
                        setMonthlyContribution={setDcaMonthlyContribution}
                        timeframe={timeframe}
                        setTimeframe={setTimeframe}
                    />
                )}

                {/* ETF Holdings & Sector Weightings */}
                {etfData && (
                    <div className="two-col animate-fade-in stagger-3">
                        {etfData.topHoldings?.length > 0 && (
                            <ETFHoldingsSection holdings={etfData.topHoldings} />
                        )}
                        {etfData.sectorWeightings?.length > 0 && (
                            <ETFSectorWeightingsSection sectors={etfData.sectorWeightings} />
                        )}
                    </div>
                )}

                {/* Revenue vs Profit */}
                {!stockInfo?.isMakmur && financialData && financialData.incomeStatement?.length > 0 && (
                    <RevenueVsProfitSection data={financialData.incomeStatement} currency={stockInfo?.currency} />
                )}

                {/* Dividends */}
                {!stockInfo?.isMakmur && dividendData && (dividendData.dividends?.length > 0 || dividendData.annual?.length > 0) && (
                    <DividendSection data={dividendData} currency={stockInfo?.currency} />
                )}

                {/* Financials */}
                {!stockInfo?.isMakmur && financialData && <FinancialSection data={financialData} currency={stockInfo?.currency} />}

                {/* Footer */}
                <footer className="footer">
                    {stockInfo?.isMakmur
                        ? 'Mutual fund data provided by Makmur.id. For informational purposes only — not financial advice.'
                        : 'Data provided by Yahoo Finance via yfinance. For informational purposes only — not financial advice.'
                    }
                </footer>
            </main>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
//  SEARCH BAR
// ═══════════════════════════════════════════════════════════════
function SearchBar({ onSelect }) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [open, setOpen] = useState(false);
    const [searchLoading, setSearchLoading] = useState(false);
    const timerRef = useRef(null);
    const containerRef = useRef(null);

    // Click outside to close
    useEffect(() => {
        const handler = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleChange = (e) => {
        const val = e.target.value;
        setQuery(val);
        clearTimeout(timerRef.current);

        if (val.trim().length < 1) {
            setResults([]);
            setOpen(false);
            return;
        }

        setSearchLoading(true);
        timerRef.current = setTimeout(async () => {
            try {
                const data = await api.search(val.trim());
                setResults(data);
                setOpen(data.length > 0);
            } catch {
                setResults([]);
            } finally {
                setSearchLoading(false);
            }
        }, 300);
    };

    const handleSelect = (symbol) => {
        setQuery('');
        setOpen(false);
        setResults([]);
        onSelect(symbol);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && query.trim()) {
            handleSelect(query.trim().toUpperCase());
        }
    };

    return (
        <div className="search-container" ref={containerRef} style={{ display: 'block' }}>
            <div className="search-input-wrapper">
                <Search size={16} className="search-icon" />
                <input
                    id="ticker-search"
                    className="search-input"
                    type="text"
                    placeholder="Search ticker or mutual fund (e.g. AAPL, Sucorinvest)..."
                    value={query}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    onFocus={() => results.length > 0 && setOpen(true)}
                    autoComplete="off"
                />
            </div>

            {open && results.length > 0 && (
                <div className="search-dropdown">
                    {results.map((r, i) => (
                        <div key={`${r.symbol}-${i}`} className="search-item" onClick={() => handleSelect(r.symbol)}>
                            <span className="search-item-symbol">{r.isMakmur ? '🏦' : ''} {r.isMakmur ? r.name?.substring(0, 20) : r.symbol}</span>
                            <span className="search-item-name">{r.isMakmur ? r.name : r.name}</span>
                            <span className="search-item-type">{r.isMakmur ? 'Mutual Fund' : r.type}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
//  SVG LINE CHART
// ═══════════════════════════════════════════════════════════════
function PriceChart({ data, hoveredPoint, setHoveredPoint, currency = 'USD' }) {
    if (!data.length) return null;

    const W = 1000;
    const H = 320;
    const PAD = 12;

    const closes = data.map((d) => d.close).filter(Boolean);
    const minVal = Math.min(...closes);
    const maxVal = Math.max(...closes);
    const range = maxVal - minVal || 1;

    const getX = (i) => PAD + (i / (data.length - 1)) * (W - PAD * 2);
    const getY = (v) => H - PAD - ((v - minVal) / range) * (H - PAD * 2);

    const pathPoints = data
        .map((d, i) => (d.close != null ? `${getX(i)},${getY(d.close)}` : null))
        .filter(Boolean);

    const linePath = `M ${pathPoints.join(' L ')}`;
    const areaPath = `M ${getX(0)},${H} L ${pathPoints.join(' L ')} L ${getX(data.length - 1)},${H} Z`;

    // Overall trend color
    const firstClose = data.find((d) => d.close != null)?.close || 0;
    const lastClose = data[data.length - 1]?.close || 0;
    const isPositive = lastClose >= firstClose;
    const strokeColor = isPositive ? '#059669' : '#dc2626';
    const gradId = 'chart-grad';

    return (
        <div className="chart-container" onMouseLeave={() => setHoveredPoint(null)}>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
                <defs>
                    <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor={strokeColor} stopOpacity="0.2" />
                        <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
                    </linearGradient>
                </defs>

                {/* Grid lines */}
                {[0, 1, 2, 3, 4].map((i) => {
                    const y = PAD + (i / 4) * (H - PAD * 2);
                    return <line key={i} x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="#f1f5f9" strokeWidth="1" />;
                })}

                {/* Area fill */}
                <path d={areaPath} fill={`url(#${gradId})`} />

                {/* Line */}
                <path d={linePath} fill="none" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

                {/* Hover rects */}
                {data.map((d, i) => {
                    if (d.close == null) return null;
                    const x = getX(i);
                    const y = getY(d.close);
                    return (
                        <rect
                            key={i}
                            x={x - (W / data.length) / 2}
                            y={0}
                            width={W / data.length}
                            height={H}
                            fill="transparent"
                            style={{ cursor: 'crosshair' }}
                            onMouseEnter={() =>
                                setHoveredPoint({
                                    ...d,
                                    label: new Date(d.date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
                                    x,
                                    y,
                                })
                            }
                        />
                    );
                })}

                {/* Hover indicator */}
                {hoveredPoint && (
                    <g>
                        <line x1={hoveredPoint.x} y1={PAD} x2={hoveredPoint.x} y2={H - PAD} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="4 4" />
                        <circle cx={hoveredPoint.x} cy={hoveredPoint.y} r="5" fill="white" stroke={strokeColor} strokeWidth="2.5" />
                    </g>
                )}
            </svg>

            {/* Tooltip */}
            {hoveredPoint && (
                <div
                    className="chart-tooltip"
                    style={{
                        left: `${(hoveredPoint.x / W) * 100}%`,
                        top: `${(hoveredPoint.y / H) * 100}%`,
                        transform: 'translateY(-50%)',
                        marginLeft: hoveredPoint.x > W * 0.8 ? '-160px' : '20px',
                    }}
                >
                    <div className="chart-tooltip-label">{hoveredPoint.label}</div>
                    <div className="chart-tooltip-value">{formatCurrency(hoveredPoint.close, currency)}</div>
                    {hoveredPoint.volume != null && (
                        <div className="chart-tooltip-label" style={{ marginTop: 4 }}>
                            Vol: {formatNumber(hoveredPoint.volume)}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
//  COMPONENTS
// ═══════════════════════════════════════════════════════════════

function MetricItem({ label, value }) {
    const isPositive = value != null && value >= 0;
    return (
        <div className="metric-item">
            <div className="metric-label">{label}</div>
            <div className={`metric-value ${value != null ? (isPositive ? 'positive' : 'negative') : ''}`}>
                {value != null && (isPositive ? <TrendingUp size={16} /> : <TrendingDown size={16} />)}
                {formatPercent(value)}
            </div>
        </div>
    );
}

function InfoItem({ label, value, tooltip }) {
    return (
        <div className="info-item">
            <div className="info-item-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {label}
                {tooltip && (
                    <span className="info-tooltip-trigger">
                        <Info size={12} style={{ color: 'var(--text-muted)', opacity: 0.6 }} />
                        <span className="info-tooltip-content">{tooltip}</span>
                    </span>
                )}
            </div>
            <div className="info-item-value">{value ?? '—'}</div>
        </div>
    );
}

function DescriptionCard({ description }) {
    const [expanded, setExpanded] = useState(false);
    return (
        <div className="card animate-fade-in stagger-1">
            <div className="card-header">
                <div className="card-title">
                    <Building2 size={18} style={{ color: 'var(--accent-indigo)' }} />
                    About
                </div>
            </div>
            <div className="card-body">
                <p className={`description-text ${expanded ? 'expanded' : ''}`}>{description}</p>
                <button className="description-toggle" onClick={() => setExpanded(!expanded)}>
                    {expanded ? 'Show less' : 'Read more'}
                </button>
            </div>
        </div>
    );
}

// ── Dividend Section ──────────────────────────────────────────
function DividendSection({ data, currency = 'USD' }) {
    const recentDivs = (data.dividends || []).slice(-20).reverse();
    const annualData = data.annual || [];
    const maxAnnual = Math.max(...annualData.map((d) => d.total), 0.01);

    return (
        <div className="card animate-fade-in stagger-4">
            <div className="card-header">
                <div className="card-title">
                    <Wallet size={18} style={{ color: 'var(--color-positive)' }} />
                    Dividend History
                </div>
                <p className="card-subtitle">
                    {data.dividends?.length || 0} dividend payments on record.
                </p>
            </div>
            <div className="card-body">
                {/* Annual Bar Chart */}
                {annualData.length > 0 && (
                    <div style={{ marginBottom: 24 }}>
                        <div className="metric-label" style={{ marginBottom: 12 }}>Annual Dividend per Share</div>
                        <div className="bar-chart">
                            {annualData.slice(-15).map((d) => (
                                <div className="bar-col" key={d.year}>
                                    <div className="bar-value">{formatCurrency(d.total, currency)}</div>
                                    <div
                                        className="bar"
                                        style={{ height: `${(d.total / maxAnnual) * 100}%` }}
                                        title={`${d.year}: ${getCurrencySymbol(currency)}${d.total.toFixed(4)}`}
                                    />
                                    <div className="bar-label">{String(d.year).slice(-2)}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Recent dividends table */}
                {recentDivs.length > 0 && (
                    <div className="table-wrapper" style={{ maxHeight: 320, overflow: 'auto' }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Ex-Date</th>
                                    <th>Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recentDivs.map((d, i) => (
                                    <tr key={i}>
                                        <td>{new Date(d.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
                                        <td className="amount">{formatCurrency(d.amount, currency)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Revenue vs Profit Section (Dual-Axis SVG Chart) ───────────
function RevenueVsProfitSection({ data, currency = 'USD' }) {
    const [hoveredIdx, setHoveredIdx] = useState(null);

    const chartItems = useMemo(() => {
        if (!data?.length) return [];
        return data
            .map((period) => {
                const year = new Date(period.period).getFullYear();
                const revenue = period['Total Revenue'] ?? period['TotalRevenue'] ?? null;
                const netIncome = period['Net Income'] ?? period['NetIncome'] ?? null;
                const grossProfit = period['Gross Profit'] ?? period['GrossProfit'] ?? null;
                const profitMargin = revenue && netIncome ? (netIncome / revenue) * 100 : null;
                const grossMargin = revenue && grossProfit ? (grossProfit / revenue) * 100 : null;
                return { year, revenue, netIncome, grossProfit, profitMargin, grossMargin };
            })
            .filter((d) => d.revenue != null)
            .reverse();
    }, [data]);

    if (chartItems.length === 0) return null;

    const hasGrossProfit = chartItems.some((d) => d.grossProfit != null);
    const maxVal = Math.max(...chartItems.map((d) => Math.abs(d.revenue || 0)), 1);
    const margins = chartItems.map((d) => d.profitMargin).filter((m) => m != null);
    const grossMargins = chartItems.map((d) => d.grossMargin).filter((m) => m != null);
    const allMargins = [...margins, ...grossMargins];
    const minMargin = allMargins.length > 0 ? Math.floor(Math.min(...allMargins) / 10) * 10 : 0;
    const maxMargin = allMargins.length > 0 ? Math.ceil(Math.max(...allMargins) / 10) * 10 : 50;
    const marginRange = maxMargin - minMargin || 10;

    // SVG dimensions
    const W = 900, H = 300;
    const PAD_LEFT = 70, PAD_RIGHT = 60, PAD_TOP = 20, PAD_BOTTOM = 48;
    const chartW = W - PAD_LEFT - PAD_RIGHT;
    const chartH = H - PAD_TOP - PAD_BOTTOM;
    const n = chartItems.length;
    const groupW = chartW / n;
    const barCount = hasGrossProfit ? 3 : 2;
    const barGap = 4;
    const barW = Math.min(28, (groupW - barGap * (barCount + 1)) / barCount);

    const yScale = (val) => PAD_TOP + chartH - (Math.abs(val) / maxVal) * chartH;
    const marginY = (val) => PAD_TOP + chartH - ((val - minMargin) / marginRange) * chartH;

    // Grid ticks for left axis
    const leftTicks = [0, maxVal * 0.25, maxVal * 0.5, maxVal * 0.75, maxVal];
    // Grid ticks for right axis
    const rightTicks = [];
    for (let t = minMargin; t <= maxMargin; t += (marginRange / 4)) rightTicks.push(t);

    return (
        <div className="card animate-fade-in stagger-2">
            <div className="card-header">
                <div className="card-title">
                    <BarChart3 size={18} style={{ color: 'var(--accent-blue)' }} />
                    Revenue vs Profit
                    <span className="info-tooltip-trigger">
                        <Info size={15} style={{ color: 'var(--text-muted)' }} />
                        <span className="info-tooltip-content">
                            Dual-axis chart: bars show absolute values in {currency} (left axis), lines show profit margins as percentages (right axis).
                        </span>
                    </span>
                </div>
                <p className="card-subtitle">Annual comparison of revenue, profit, and margins — bars scale to the left axis, margin lines to the right axis.</p>
            </div>
            <div className="card-body">
                <div className="rvp-svg-wrapper" onMouseLeave={() => setHoveredIdx(null)}>
                    <svg viewBox={`0 0 ${W} ${H}`} className="rvp-svg">
                        {/* Grid lines */}
                        {leftTicks.map((t, i) => {
                            const y = yScale(t);
                            return (
                                <line key={`g-${i}`} x1={PAD_LEFT} y1={y} x2={W - PAD_RIGHT} y2={y}
                                    stroke="#f1f5f9" strokeWidth="1" />
                            );
                        })}

                        {/* Left Y-axis labels (dollars) */}
                        {leftTicks.map((t, i) => (
                            <text key={`ly-${i}`} x={PAD_LEFT - 8} y={yScale(t)} dy="4"
                                textAnchor="end" fill="#94a3b8" fontSize="10" fontFamily="var(--font-mono)">
                                {formatLargeNumber(t, currency)}
                            </text>
                        ))}

                        {/* Right Y-axis labels (margin %) */}
                        {rightTicks.map((t, i) => (
                            <text key={`ry-${i}`} x={W - PAD_RIGHT + 8} y={marginY(t)} dy="4"
                                textAnchor="start" fill="#d97706" fontSize="10" fontFamily="var(--font-mono)">
                                {t.toFixed(0)}%
                            </text>
                        ))}

                        {/* Left axis line */}
                        <line x1={PAD_LEFT} y1={PAD_TOP} x2={PAD_LEFT} y2={PAD_TOP + chartH}
                            stroke="#e2e8f0" strokeWidth="1.5" />
                        {/* Right axis line */}
                        <line x1={W - PAD_RIGHT} y1={PAD_TOP} x2={W - PAD_RIGHT} y2={PAD_TOP + chartH}
                            stroke="#fbbf24" strokeWidth="1.5" strokeDasharray="4 3" />

                        {/* Bars per group */}
                        {chartItems.map((d, i) => {
                            const groupX = PAD_LEFT + i * groupW;
                            const centerX = groupX + groupW / 2;
                            const totalBarsW = barCount * barW + (barCount - 1) * barGap;
                            const startX = centerX - totalBarsW / 2;
                            const isHov = hoveredIdx === i;

                            const bars = [];
                            let bIdx = 0;

                            // Revenue bar
                            const revH = (Math.abs(d.revenue) / maxVal) * chartH;
                            bars.push(
                                <rect key={`rev-${i}`}
                                    x={startX + bIdx * (barW + barGap)} y={PAD_TOP + chartH - revH}
                                    width={barW} height={revH} rx="3"
                                    fill="url(#rvp-grad-rev)" opacity={isHov ? 1 : 0.85}
                                />
                            );
                            bIdx++;

                            // Gross Profit bar
                            if (hasGrossProfit && d.grossProfit != null) {
                                const gpH = (Math.abs(d.grossProfit) / maxVal) * chartH;
                                bars.push(
                                    <rect key={`gp-${i}`}
                                        x={startX + bIdx * (barW + barGap)} y={PAD_TOP + chartH - gpH}
                                        width={barW} height={gpH} rx="3"
                                        fill="url(#rvp-grad-gp)" opacity={isHov ? 1 : 0.85}
                                    />
                                );
                                bIdx++;
                            }

                            // Net Income bar
                            if (d.netIncome != null) {
                                const niH = (Math.abs(d.netIncome) / maxVal) * chartH;
                                bars.push(
                                    <rect key={`ni-${i}`}
                                        x={startX + bIdx * (barW + barGap)} y={PAD_TOP + chartH - niH}
                                        width={barW} height={niH} rx="3"
                                        fill={d.netIncome >= 0 ? 'url(#rvp-grad-ni)' : 'url(#rvp-grad-loss)'}
                                        opacity={isHov ? 1 : 0.85}
                                    />
                                );
                            }

                            // Year label
                            bars.push(
                                <text key={`yr-${i}`} x={centerX} y={H - PAD_BOTTOM + 18}
                                    textAnchor="middle" fill="#64748b" fontSize="11" fontWeight="700">
                                    {d.year}
                                </text>
                            );

                            // Hover area
                            bars.push(
                                <rect key={`hov-${i}`}
                                    x={groupX} y={PAD_TOP} width={groupW} height={chartH}
                                    fill="transparent" style={{ cursor: 'crosshair' }}
                                    onMouseEnter={() => setHoveredIdx(i)}
                                />
                            );

                            // Hover highlight column
                            if (isHov) {
                                bars.unshift(
                                    <rect key={`hl-${i}`}
                                        x={groupX} y={PAD_TOP} width={groupW} height={chartH}
                                        fill="#3b82f6" opacity="0.04" rx="4"
                                    />
                                );
                            }

                            return <g key={`grp-${i}`}>{bars}</g>;
                        })}

                        {/* Gross Margin line (if available) */}
                        {hasGrossProfit && chartItems.length > 1 && (
                            <polyline
                                fill="none" stroke="#a78bfa" strokeWidth="2" strokeDasharray="6 4"
                                strokeLinecap="round" strokeLinejoin="round"
                                points={chartItems.map((d, i) => {
                                    if (d.grossMargin == null) return null;
                                    const cx = PAD_LEFT + i * groupW + groupW / 2;
                                    return `${cx},${marginY(d.grossMargin)}`;
                                }).filter(Boolean).join(' ')}
                            />
                        )}

                        {/* Profit Margin line */}
                        {chartItems.length > 1 && (
                            <polyline
                                fill="none" stroke="#d97706" strokeWidth="2.5"
                                strokeLinecap="round" strokeLinejoin="round"
                                points={chartItems.map((d, i) => {
                                    if (d.profitMargin == null) return null;
                                    const cx = PAD_LEFT + i * groupW + groupW / 2;
                                    return `${cx},${marginY(d.profitMargin)}`;
                                }).filter(Boolean).join(' ')}
                            />
                        )}

                        {/* Margin dots */}
                        {chartItems.map((d, i) => {
                            const cx = PAD_LEFT + i * groupW + groupW / 2;
                            const dots = [];
                            if (d.profitMargin != null) {
                                dots.push(
                                    <circle key={`pm-${i}`} cx={cx} cy={marginY(d.profitMargin)} r={hoveredIdx === i ? 5 : 3.5}
                                        fill="white" stroke="#d97706" strokeWidth="2" />
                                );
                            }
                            if (hasGrossProfit && d.grossMargin != null) {
                                dots.push(
                                    <circle key={`gm-${i}`} cx={cx} cy={marginY(d.grossMargin)} r={hoveredIdx === i ? 4 : 2.5}
                                        fill="white" stroke="#a78bfa" strokeWidth="1.5" />
                                );
                            }
                            return dots;
                        })}

                        {/* Gradient definitions */}
                        <defs>
                            <linearGradient id="rvp-grad-rev" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#3b82f6" />
                                <stop offset="100%" stopColor="#6366f1" />
                            </linearGradient>
                            <linearGradient id="rvp-grad-gp" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#8b5cf6" />
                                <stop offset="100%" stopColor="#a78bfa" />
                            </linearGradient>
                            <linearGradient id="rvp-grad-ni" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#059669" />
                                <stop offset="100%" stopColor="#34d399" />
                            </linearGradient>
                            <linearGradient id="rvp-grad-loss" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#dc2626" />
                                <stop offset="100%" stopColor="#f87171" />
                            </linearGradient>
                        </defs>
                    </svg>

                    {/* Hover tooltip */}
                    {hoveredIdx != null && chartItems[hoveredIdx] && (() => {
                        const d = chartItems[hoveredIdx];
                        const tipX = PAD_LEFT + hoveredIdx * groupW + groupW / 2;
                        const leftPct = (tipX / W) * 100;
                        return (
                            <div className="rvp-tooltip" style={{
                                left: `${leftPct}%`,
                                transform: leftPct > 70 ? 'translateX(-100%)' : 'translateX(0)',
                            }}>
                                <strong style={{ fontSize: '0.85rem' }}>{d.year}</strong>
                                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    <span><span style={{ color: '#3b82f6' }}>■</span> Revenue: {formatLargeNumber(d.revenue, currency)}</span>
                                    {hasGrossProfit && d.grossProfit != null && (
                                        <span><span style={{ color: '#8b5cf6' }}>■</span> Gross Profit: {formatLargeNumber(d.grossProfit, currency)}</span>
                                    )}
                                    {d.netIncome != null && (
                                        <span><span style={{ color: d.netIncome >= 0 ? '#059669' : '#dc2626' }}>■</span> Net Income: {formatLargeNumber(d.netIncome, currency)}</span>
                                    )}
                                    {d.profitMargin != null && (
                                        <span><span style={{ color: '#d97706' }}>●</span> Net Margin: {d.profitMargin.toFixed(1)}%</span>
                                    )}
                                    {hasGrossProfit && d.grossMargin != null && (
                                        <span><span style={{ color: '#a78bfa' }}>●</span> Gross Margin: {d.grossMargin.toFixed(1)}%</span>
                                    )}
                                </div>
                            </div>
                        );
                    })()}
                </div>

                {/* Legend */}
                <div className="rvp-legend">
                    <div className="rvp-legend-item">
                        <div className="rvp-legend-swatch" style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)' }} />
                        Revenue
                    </div>
                    {hasGrossProfit && (
                        <div className="rvp-legend-item">
                            <div className="rvp-legend-swatch" style={{ background: 'linear-gradient(135deg, #8b5cf6, #a78bfa)' }} />
                            Gross Profit
                        </div>
                    )}
                    <div className="rvp-legend-item">
                        <div className="rvp-legend-swatch" style={{ background: 'linear-gradient(135deg, #059669, #34d399)' }} />
                        Net Income
                    </div>
                    <div className="rvp-legend-item">
                        <div className="rvp-legend-swatch" style={{ background: '#d97706', borderRadius: '50%', width: 10, height: 10 }} />
                        Net Margin %
                    </div>
                    {hasGrossProfit && (
                        <div className="rvp-legend-item">
                            <div className="rvp-legend-swatch" style={{ background: '#a78bfa', borderRadius: '50%', width: 10, height: 10 }} />
                            Gross Margin %
                        </div>
                    )}
                </div>

                {/* Data Table */}
                <div className="table-wrapper" style={{ marginTop: 16, maxHeight: 280, overflow: 'auto' }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Year</th>
                                <th style={{ textAlign: 'right' }}>Revenue</th>
                                {hasGrossProfit && <th style={{ textAlign: 'right' }}>Gross Profit</th>}
                                <th style={{ textAlign: 'right' }}>Net Income</th>
                                <th style={{ textAlign: 'right' }}>Net Margin</th>
                                {hasGrossProfit && <th style={{ textAlign: 'right' }}>Gross Margin</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {[...chartItems].reverse().map((d) => (
                                <tr key={d.year}>
                                    <td style={{ fontWeight: 600 }}>{d.year}</td>
                                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                                        {formatLargeNumber(d.revenue, currency)}
                                    </td>
                                    {hasGrossProfit && (
                                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                                            {formatLargeNumber(d.grossProfit, currency)}
                                        </td>
                                    )}
                                    <td style={{
                                        textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.8rem',
                                        color: d.netIncome >= 0 ? 'var(--color-positive)' : 'var(--color-negative)',
                                        fontWeight: 600,
                                    }}>
                                        {formatLargeNumber(d.netIncome, currency)}
                                    </td>
                                    <td style={{
                                        textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.8rem',
                                        fontWeight: 600,
                                        color: d.profitMargin != null && d.profitMargin >= 0 ? 'var(--color-positive)' : 'var(--color-negative)',
                                    }}>
                                        {d.profitMargin != null ? `${d.profitMargin.toFixed(1)}%` : '—'}
                                    </td>
                                    {hasGrossProfit && (
                                        <td style={{
                                            textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.8rem',
                                            color: 'var(--text-secondary)',
                                        }}>
                                            {d.grossMargin != null ? `${d.grossMargin.toFixed(1)}%` : '—'}
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

// ── Financial Statements Section ──────────────────────────────
function FinancialSection({ data, currency = 'USD' }) {
    const hasIncome = data.incomeStatement?.length > 0;
    const hasBalance = data.balanceSheet?.length > 0;
    const hasCash = data.cashFlow?.length > 0;

    if (!hasIncome && !hasBalance && !hasCash) return null;

    return (
        <div className="card animate-fade-in stagger-5">
            <div className="card-header">
                <div className="card-title">
                    <DollarSign size={18} style={{ color: 'var(--color-warning)' }} />
                    Financial Statements
                </div>
                <p className="card-subtitle">Annual data from company filings.</p>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {hasIncome && <FinancialAccordion title="Income Statement" data={data.incomeStatement} currency={currency} />}
                {hasBalance && <FinancialAccordion title="Balance Sheet" data={data.balanceSheet} currency={currency} />}
                {hasCash && <FinancialAccordion title="Cash Flow" data={data.cashFlow} currency={currency} />}
            </div>
        </div>
    );
}

function FinancialAccordion({ title, data, currency = 'USD' }) {
    const [open, setOpen] = useState(false);

    if (!data?.length) return null;

    // data is array of period objects: [{period, "Total Revenue": ..., ...}]
    const periods = data.map((d) => d.period);
    const rows = Object.keys(data[0]).filter((k) => k !== 'period');

    // Show only top ~15 line items for brevity
    const displayRows = rows.slice(0, 15);

    return (
        <div>
            <button className={`accordion-trigger ${open ? 'open' : ''}`} onClick={() => setOpen(!open)}>
                <span>{title}</span>
                <ChevronDown size={18} className={`accordion-chevron ${open ? 'open' : ''}`} />
            </button>
            {open && (
                <div className="accordion-content">
                    <div className="table-wrapper">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th style={{ minWidth: 200 }}>Item</th>
                                    {periods.map((p) => (
                                        <th key={p} style={{ textAlign: 'right', minWidth: 110 }}>
                                            {new Date(p).getFullYear()}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {displayRows.map((row) => (
                                    <tr key={row}>
                                        <td style={{ fontWeight: 500 }}>{row.replace(/([A-Z])/g, ' $1').trim()}</td>
                                        {data.map((period) => (
                                            <td
                                                key={period.period}
                                                style={{
                                                    textAlign: 'right',
                                                    fontFamily: 'var(--font-mono)',
                                                    fontSize: '0.8rem',
                                                    color: period[row] < 0 ? 'var(--color-negative)' : 'var(--text-secondary)',
                                                }}
                                            >
                                                {period[row] != null ? formatLargeNumber(period[row], currency) : '—'}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
//  ETF TOP HOLDINGS
// ═══════════════════════════════════════════════════════════════
function ETFHoldingsSection({ holdings }) {
    const [hoveredIdx, setHoveredIdx] = useState(null);
    const top10 = holdings.slice(0, 10);
    const maxWeight = Math.max(...top10.map((h) => h.weight || 0), 0.01);

    // Colors for bars
    const barColors = [
        '#3b82f6', '#6366f1', '#8b5cf6', '#a78bfa', '#06b6d4',
        '#0ea5e9', '#2563eb', '#7c3aed', '#4f46e5', '#0284c7',
    ];

    return (
        <div className="card">
            <div className="card-header">
                <div className="card-title">
                    <Layers size={18} style={{ color: 'var(--accent-indigo)' }} />
                    Top 10 Holdings
                </div>
                <p className="card-subtitle">Largest positions by portfolio weight.</p>
            </div>
            <div className="card-body">
                <div className="etf-holdings-chart">
                    {top10.map((h, i) => (
                        <div
                            key={h.symbol}
                            className={`etf-holding-row ${hoveredIdx === i ? 'hovered' : ''}`}
                            onMouseEnter={() => setHoveredIdx(i)}
                            onMouseLeave={() => setHoveredIdx(null)}
                        >
                            <div className="etf-holding-label">
                                <span className="etf-holding-rank">#{i + 1}</span>
                                <span className="etf-holding-symbol">{h.symbol}</span>
                            </div>
                            <div className="etf-holding-bar-track">
                                <div
                                    className="etf-holding-bar-fill"
                                    style={{
                                        width: `${(h.weight / maxWeight) * 100}%`,
                                        background: barColors[i % barColors.length],
                                    }}
                                />
                            </div>
                            <span className="etf-holding-pct">
                                {(h.weight * 100).toFixed(2)}%
                            </span>
                            {hoveredIdx === i && (
                                <div className="etf-holding-tooltip">
                                    <strong>{h.symbol}</strong> — {h.name}
                                    <div style={{ marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                                        Weight: {(h.weight * 100).toFixed(2)}%
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
//  ETF SECTOR WEIGHTINGS (Donut Chart)
// ═══════════════════════════════════════════════════════════════
function ETFSectorWeightingsSection({ sectors }) {
    const [hoveredIdx, setHoveredIdx] = useState(null);
    const sorted = [...sectors].sort((a, b) => (b.weight || 0) - (a.weight || 0));
    const total = sorted.reduce((sum, s) => sum + (s.weight || 0), 0) || 1;

    // Donut chart params
    const SIZE = 220;
    const CX = SIZE / 2;
    const CY = SIZE / 2;
    const R = 85;
    const STROKE = 32;

    const sectorColors = [
        '#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b',
        '#ef4444', '#ec4899', '#6366f1', '#14b8a6', '#f97316',
        '#84cc16', '#a855f7',
    ];

    // Build donut arcs
    const circumference = 2 * Math.PI * R;
    let accOffset = 0;
    const arcs = sorted.map((s, i) => {
        const pct = (s.weight || 0) / total;
        const dashLen = pct * circumference;
        const dashGap = circumference - dashLen;
        const offset = -accOffset * circumference + circumference * 0.25; // start from top
        accOffset += pct;
        return {
            ...s,
            color: sectorColors[i % sectorColors.length],
            dashLen,
            dashGap,
            offset,
            pct,
        };
    });

    // Compute tooltip position for hovered arc midpoint
    const getArcMidpoint = (arcIdx) => {
        let beforePct = 0;
        for (let j = 0; j < arcIdx; j++) beforePct += arcs[j].pct;
        const midPct = beforePct + arcs[arcIdx].pct / 2;
        const angle = midPct * 2 * Math.PI - Math.PI / 2; // start from top
        const tipR = R + STROKE / 2 + 20;
        return {
            x: CX + tipR * Math.cos(angle),
            y: CY + tipR * Math.sin(angle),
        };
    };

    return (
        <div className="card">
            <div className="card-header">
                <div className="card-title">
                    <PieChart size={18} style={{ color: 'var(--accent-blue)' }} />
                    Sector Weightings
                </div>
                <p className="card-subtitle">Allocation by sector.</p>
            </div>
            <div className="card-body">
                <div className="etf-sector-layout">
                    {/* Donut Chart */}
                    <div className="etf-donut-wrapper" style={{ position: 'relative' }}>
                        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
                            {/* Background ring */}
                            <circle cx={CX} cy={CY} r={R} fill="none"
                                stroke="#f1f5f9" strokeWidth={STROKE} />
                            {arcs.map((arc, i) => (
                                <circle
                                    key={i}
                                    cx={CX} cy={CY} r={R}
                                    fill="none"
                                    stroke={arc.color}
                                    strokeWidth={hoveredIdx === i ? STROKE + 6 : STROKE}
                                    strokeDasharray={`${arc.dashLen} ${arc.dashGap}`}
                                    strokeDashoffset={arc.offset}
                                    strokeLinecap="butt"
                                    style={{
                                        transition: 'stroke-width 0.2s ease, stroke-dasharray 0.5s ease, stroke-dashoffset 0.5s ease',
                                        cursor: 'pointer',
                                        filter: hoveredIdx === i ? 'brightness(1.15)' : 'none',
                                    }}
                                    onMouseEnter={() => setHoveredIdx(i)}
                                    onMouseLeave={() => setHoveredIdx(null)}
                                />
                            ))}
                            {/* Center label — show hovered sector or count */}
                            {hoveredIdx != null && arcs[hoveredIdx] ? (
                                <>
                                    <text x={CX} y={CY - 6} textAnchor="middle"
                                        fill="var(--text-primary)" fontSize="16" fontWeight="700">
                                        {(arcs[hoveredIdx].pct * 100).toFixed(1)}%
                                    </text>
                                    <text x={CX} y={CY + 12} textAnchor="middle"
                                        fill="var(--text-muted)" fontSize="9">
                                        {arcs[hoveredIdx].sector}
                                    </text>
                                </>
                            ) : (
                                <>
                                    <text x={CX} y={CY - 6} textAnchor="middle"
                                        fill="var(--text-primary)" fontSize="18" fontWeight="700">
                                        {sorted.length}
                                    </text>
                                    <text x={CX} y={CY + 12} textAnchor="middle"
                                        fill="var(--text-muted)" fontSize="11">
                                        Sectors
                                    </text>
                                </>
                            )}
                        </svg>
                    </div>

                    {/* Legend */}
                    <div className="etf-sector-legend">
                        {arcs.map((arc, i) => (
                            <div
                                key={i}
                                className={`etf-sector-legend-item ${hoveredIdx === i ? 'hovered' : ''}`}
                                onMouseEnter={() => setHoveredIdx(i)}
                                onMouseLeave={() => setHoveredIdx(null)}
                            >
                                <div className="etf-sector-swatch" style={{ background: arc.color }} />
                                <span className="etf-sector-name">{arc.sector}</span>
                                <span className="etf-sector-pct">{(arc.pct * 100).toFixed(1)}%</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
//  DCA SIMULATOR
// ═══════════════════════════════════════════════════════════════
function DCASimulator({ chartData, currency = 'USD', initialAmount, setInitialAmount, monthlyContribution, setMonthlyContribution, timeframe, setTimeframe }) {
    const dcaResult = useMemo(() => {
        if (!chartData || chartData.length === 0) return null;

        let shares = 0;
        let totalInvested = 0;
        const chartPoints = [];

        const initAmt = Number(initialAmount) || 0;
        const monthlyAmt = Number(monthlyContribution) || 0;

        const getPrice = (d) => d?.adjClose || d?.close;

        let totalMonths = 0;
        for (let i = 0; i < chartData.length; i++) {
            if (getPrice(chartData[i])) totalMonths++;
        }

        const finalTotalInvested = initAmt + Math.max(0, totalMonths - 1) * monthlyAmt;
        const startPrice = getPrice(chartData.find(d => getPrice(d)));
        const lumpsumShares = startPrice ? finalTotalInvested / startPrice : 0;

        let actualMonths = 0;
        for (let i = 0; i < chartData.length; i++) {
            const price = getPrice(chartData[i]);
            if (!price) continue;

            if (actualMonths === 0) {
                shares += initAmt / price;
                totalInvested += initAmt;
            } else {
                shares += monthlyAmt / price;
                totalInvested += monthlyAmt;
            }
            actualMonths++;

            chartPoints.push({
                date: chartData[i].date,
                dcaValue: shares * price,
                lumpsumValue: lumpsumShares * price,
                invested: totalInvested,
            });
        }

        const currentPrice = getPrice(chartData[chartData.length - 1]);
        const portfolioValue = shares * currentPrice;
        const totalReturn = portfolioValue - totalInvested;
        const returnPct = totalInvested > 0 ? (totalReturn / totalInvested) * 100 : 0;

        const lumpsumValue = lumpsumShares * currentPrice;

        return {
            totalInvested,
            portfolioValue,
            totalReturn,
            returnPct,
            lumpsumValue,
            finalTotalInvested,
            chartPoints
        };
    }, [chartData, initialAmount, monthlyContribution]);

    const [hoveredIdx, setHoveredIdx] = useState(null);

    if (!dcaResult) return null;

    const isPositive = dcaResult.totalReturn >= 0;
    const { chartPoints } = dcaResult;

    // --- Chart SVG Config ---
    const W = 900;
    const H = 260;
    const PAD_LEFT = 60;
    const PAD_RIGHT = 30;
    const PAD_TOP = 20;
    const PAD_BOTTOM = 20;
    const chartW = W - PAD_LEFT - PAD_RIGHT;
    const chartH = H - PAD_TOP - PAD_BOTTOM;

    const maxVal = Math.max(...chartPoints.map(p => Math.max(p.dcaValue, p.lumpsumValue, p.invested)), dcaResult.finalTotalInvested, 1);
    const yTicks = [0, maxVal * 0.25, maxVal * 0.5, maxVal * 0.75, maxVal];

    const getX = (i) => PAD_LEFT + (i / Math.max(1, chartPoints.length - 1)) * chartW;
    const getY = (v) => PAD_TOP + chartH - (v / maxVal) * chartH;

    const dcaPath = chartPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(p.dcaValue)}`).join(' ');
    const lumpPath = chartPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(p.lumpsumValue)}`).join(' ');
    const invPath = chartPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(p.invested)}`).join(' ');
    const constLumpInvPath = `M ${PAD_LEFT} ${getY(dcaResult.finalTotalInvested)} L ${W - PAD_RIGHT} ${getY(dcaResult.finalTotalInvested)}`;

    const hPoint = hoveredIdx != null ? chartPoints[hoveredIdx] : null;

    return (
        <div className="card animate-fade-in stagger-4">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                    <div className="card-title">
                        <Calculator size={18} style={{ color: 'var(--accent-indigo)' }} />
                        DCA Simulator vs Lumpsum
                    </div>
                    <p className="card-subtitle">
                        Compare Dollar Cost Averaging against investing the same total cash amount as a lump sum on Day 1.
                    </p>
                </div>
                {timeframe && setTimeframe && (
                    <div className="timeframe-selector">
                        {['1Y', '3Y', '5Y', '10Y'].map((tf) => (
                            <button
                                key={tf}
                                className={`timeframe-btn ${timeframe === tf ? 'active' : ''}`}
                                onClick={() => setTimeframe(tf)}
                            >
                                {tf}
                            </button>
                        ))}
                    </div>
                )}
            </div>
            <div className="card-body">
                <div style={{ display: 'flex', gap: '20px', marginBottom: '24px', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '200px' }}>
                        <label className="metric-label" style={{ display: 'block', marginBottom: '8px' }}>
                            Initial Amount ({getCurrencySymbol(currency)})
                        </label>
                        <input
                            type="text"
                            inputMode="numeric"
                            className="search-input"
                            style={{ width: '100%', padding: '10px' }}
                            value={initialAmount === '' ? '' : new Intl.NumberFormat('id-ID').format(initialAmount)}
                            onChange={(e) => {
                                const raw = e.target.value.replace(/\D/g, '');
                                setInitialAmount(raw === '' ? '' : Number(raw));
                            }}
                        />
                    </div>
                    <div style={{ flex: 1, minWidth: '200px' }}>
                        <label className="metric-label" style={{ display: 'block', marginBottom: '8px' }}>
                            Planned Monthly Savings ({getCurrencySymbol(currency)})
                        </label>
                        <input
                            type="text"
                            inputMode="numeric"
                            className="search-input"
                            style={{ width: '100%', padding: '10px' }}
                            value={monthlyContribution === '' ? '' : new Intl.NumberFormat('id-ID').format(monthlyContribution)}
                            onChange={(e) => {
                                const raw = e.target.value.replace(/\D/g, '');
                                setMonthlyContribution(raw === '' ? '' : Number(raw));
                            }}
                        />
                    </div>
                </div>

                <div className="metrics-grid" style={{ marginBottom: '24px' }}>
                    <div className="metric-item">
                        <div className="metric-label">Total Invested</div>
                        <div className="metric-value">{formatCurrency(dcaResult.totalInvested, currency)}</div>
                    </div>
                    <div className="metric-item">
                        <div className="metric-label">DCA Value</div>
                        <div className="metric-value">{formatCurrency(dcaResult.portfolioValue, currency)}</div>
                    </div>
                    <div className="metric-item">
                        <div className="metric-label">Lumpsum Value</div>
                        <div className="metric-value">{formatCurrency(dcaResult.lumpsumValue, currency)}</div>
                    </div>
                    <div className="metric-item">
                        <div className="metric-label">DCA Return %</div>
                        <div className={`metric-value ${isPositive ? 'positive' : 'negative'}`}>
                            {isPositive ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                            {formatPercent(dcaResult.returnPct)}
                        </div>
                    </div>
                </div>

                {/* SVG Chart */}
                <div className="rvp-svg-wrapper" onMouseLeave={() => setHoveredIdx(null)}>
                    <svg viewBox={`0 0 ${W} ${H}`} className="rvp-svg" onMouseMove={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const rawX = e.clientX - rect.left;
                        const scaleX = W / rect.width;
                        const x = rawX * scaleX;
                        if (x < PAD_LEFT || x > W - PAD_RIGHT) return;
                        const pct = (x - PAD_LEFT) / chartW;
                        const idx = Math.min(Math.floor(pct * chartPoints.length), chartPoints.length - 1);
                        setHoveredIdx(idx);
                    }}>
                        {/* Grid lines */}
                        {yTicks.map((t, i) => {
                            const y = getY(t);
                            return (
                                <React.Fragment key={i}>
                                    <line x1={PAD_LEFT} y1={y} x2={W - PAD_RIGHT} y2={y} stroke="#f1f5f9" strokeWidth="1" />
                                    <text x={PAD_LEFT - 8} y={y} dy="4" textAnchor="end" fill="#94a3b8" fontSize="10" fontFamily="var(--font-mono)">
                                        {formatLargeNumber(t, currency)}
                                    </text>
                                </React.Fragment>
                            );
                        })}

                        {/* Chart Lines */}
                        {/* Lumpsum */}
                        <path d={lumpPath} fill="none" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="4 4" />
                        {/* Constant Lumpsum Invested */}
                        <path d={constLumpInvPath} fill="none" stroke="#f87171" strokeWidth="2" strokeDasharray="4 4" />
                        {/* Invested */}
                        <path d={invPath} fill="none" stroke="#94a3b8" strokeWidth="2" />
                        {/* DCA Value */}
                        <path d={dcaPath} fill="none" stroke="var(--accent-blue)" strokeWidth="2.5" />

                        {/* Hover Overlay */}
                        {hPoint && hoveredIdx !== null && (
                            <g>
                                <line x1={getX(hoveredIdx)} y1={PAD_TOP} x2={getX(hoveredIdx)} y2={H - PAD_BOTTOM} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="4 4" />
                                <circle cx={getX(hoveredIdx)} cy={getY(hPoint.dcaValue)} r="4" fill="white" stroke="var(--accent-blue)" strokeWidth="2" />
                                <circle cx={getX(hoveredIdx)} cy={getY(hPoint.lumpsumValue)} r="4" fill="white" stroke="#cbd5e1" strokeWidth="2" />
                                <circle cx={getX(hoveredIdx)} cy={getY(hPoint.invested)} r="4" fill="white" stroke="#94a3b8" strokeWidth="2" />
                            </g>
                        )}
                    </svg>

                    {/* Legend */}
                    <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginTop: '12px', fontSize: '0.8rem', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ width: '12px', height: '3px', background: 'var(--accent-blue)' }}></div>
                            DCA Value
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ width: '12px', height: '3px', borderTop: '2px dashed #cbd5e1' }}></div>
                            Lumpsum Value
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ width: '12px', height: '3px', background: '#94a3b8' }}></div>
                            Total Invested (DCA)
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ width: '12px', height: '3px', borderTop: '2px dashed #f87171' }}></div>
                            Total Invested (Lumpsum)
                        </div>
                    </div>

                    {/* Tooltip */}
                    {hPoint && (
                        <div className="chart-tooltip" style={{
                            left: `${(getX(hoveredIdx) / W) * 100}%`,
                            top: `20%`,
                            marginLeft: getX(hoveredIdx) > W * 0.7 ? '-160px' : '20px'
                        }}>
                            <div className="chart-tooltip-label">{new Date(hPoint.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</div>
                            <div className="chart-tooltip-value" style={{ color: 'var(--accent-blue)' }}>DCA: {formatCurrency(hPoint.dcaValue, currency)}</div>
                            <div className="chart-tooltip-value" style={{ color: '#94a3b8' }}>Lumpsum: {formatCurrency(hPoint.lumpsumValue, currency)}</div>
                            <div className="chart-tooltip-value" style={{ color: '#64748b', fontSize: '11px', marginTop: '4px' }}>Invested (DCA): {formatCurrency(hPoint.invested, currency)}</div>
                            <div className="chart-tooltip-value" style={{ color: '#f87171', fontSize: '11px', marginTop: '2px' }}>Invested (Lumpsum): {formatCurrency(dcaResult.finalTotalInvested, currency)}</div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
