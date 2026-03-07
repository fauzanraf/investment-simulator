"""
Investment Simulator — Flask Backend
Serves real market data via yfinance through a REST API.
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
import yfinance as yf
import pandas as pd
import math
import time
import traceback
from functools import wraps
import requests
import requests_cache
from fake_useragent import UserAgent

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# ── Yahoo Finance Session Setup ────────────────────────────────
# Cloud providers (like Render) are often instantly rate-limited 
# by Yahoo Finance. Using a cached session and rotating User-Agents fixes this.

# Enable SQLite caching to heavily reduce duplicate outbound requests
yf_session = requests_cache.CachedSession('yfinance.cache', expire_after=3600)

ua = UserAgent()

def get_randomized_session():
    """Update headers with a fresh randomized desktop User-Agent."""
    yf_session.headers.update({
        "User-Agent": ua.random,
        "Accept": "text/html,application/json,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Cache-Control": "max-age=0",
    })
    return yf_session

# Initialize headers
get_randomized_session()

# ── Simple in-memory cache ─────────────────────────────────────
_cache = {}
CACHE_TTL = 300  # 5 minutes

def cached(key):
    """Return cached value if still valid, else None."""
    entry = _cache.get(key)
    if entry and (time.time() - entry['ts']) < CACHE_TTL:
        return entry['val']
    return None

def set_cache(key, val):
    _cache[key] = {'val': val, 'ts': time.time()}


def retry_on_rate_limit(max_retries=3, base_delay=2):
    """Decorator that retries a function when yfinance raises a rate-limit error."""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            last_err = None
            for attempt in range(max_retries):
                try:
                    return fn(*args, **kwargs)
                except Exception as e:
                    err_str = str(e).lower()
                    if 'rate' in err_str or 'too many' in err_str or '429' in err_str:
                        last_err = e
                        delay = base_delay * (2 ** attempt)
                        print(f"⏳ Rate limited on {fn.__name__}, retrying in {delay}s (attempt {attempt + 1}/{max_retries})")
                        time.sleep(delay)
                    else:
                        raise
            # All retries exhausted
            raise last_err
        return wrapper
    return decorator


def safe_val(val):
    """Convert pandas/numpy values to JSON-safe Python types."""
    if val is None:
        return None
    if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
        return None
    if hasattr(val, 'item'):  # numpy scalar
        return val.item()
    return val


# ── Ticker Search ──────────────────────────────────────────────
@app.route('/api/search')
def search_ticker():
    """Search for tickers matching a query string."""
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify([])

    try:
        session = get_randomized_session()
        # yf.Search does not accept a session argument directly in older yfinance, 
        # but the backend is now usingrequests_cache globally or we can use the explicit session
        # For Search, we'll try passing it if supported, or fall back to requests 
        # Actually newer yfinance supports session in yf.Search
        # If it throws, we can handle it
        try:
            results = yf.Search(query, max_results=8, session=session)
        except TypeError:
            results = yf.Search(query, max_results=8)
            
        quotes = []
        for q in (results.quotes or []):
            quotes.append({
                'symbol': q.get('symbol', ''),
                'name': q.get('shortname') or q.get('longname', ''),
                'type': q.get('quoteType', ''),
                'exchange': q.get('exchange', ''),
            })
        return jsonify(quotes)
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# ── Historical Price Data ──────────────────────────────────────
@app.route('/api/stock/<ticker>/history')
@retry_on_rate_limit()
def stock_history(ticker):
    """Get historical price data (monthly by default)."""
    period = request.args.get('period', '10y')
    interval = request.args.get('interval', '1mo')

    try:
        stock = yf.Ticker(ticker, session=yf_session)
        hist = stock.history(period=period, interval=interval, auto_adjust=True)

        if hist.empty:
            return jsonify({'error': f'No data found for {ticker}'}), 404

        data = []
        for date, row in hist.iterrows():
            data.append({
                'date': date.strftime('%Y-%m-%d'),
                'open': safe_val(row.get('Open')),
                'high': safe_val(row.get('High')),
                'low': safe_val(row.get('Low')),
                'close': safe_val(row.get('Close')),
                'volume': safe_val(row.get('Volume')),
            })

        return jsonify({
            'ticker': ticker.upper(),
            'period': period,
            'interval': interval,
            'data': data,
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# ── Company Information ────────────────────────────────────────
@app.route('/api/stock/<ticker>/info')
@retry_on_rate_limit()
def stock_info(ticker):
    """Get company information and key statistics."""
    cache_key = f'info:{ticker.upper()}'
    hit = cached(cache_key)
    if hit is not None:
        return jsonify(hit)

    try:
        stock = yf.Ticker(ticker, session=yf_session)
        info = stock.info

        if not info or info.get('regularMarketPrice') is None:
            # Try fetching basic data even if info is sparse
            pass

        result = {
            'symbol': info.get('symbol', ticker.upper()),
            'name': info.get('longName') or info.get('shortName', ticker.upper()),
            'sector': info.get('sector'),
            'industry': info.get('industry'),
            'description': info.get('longBusinessSummary'),
            'website': info.get('website'),
            'country': info.get('country'),
            'currency': info.get('currency', 'USD'),
            'exchange': info.get('exchange'),

            # Price data
            'currentPrice': safe_val(info.get('currentPrice') or info.get('regularMarketPrice')),
            'previousClose': safe_val(info.get('previousClose') or info.get('regularMarketPreviousClose')),
            'open': safe_val(info.get('open') or info.get('regularMarketOpen')),
            'dayHigh': safe_val(info.get('dayHigh') or info.get('regularMarketDayHigh')),
            'dayLow': safe_val(info.get('dayLow') or info.get('regularMarketDayLow')),

            # 52-week range
            'fiftyTwoWeekHigh': safe_val(info.get('fiftyTwoWeekHigh')),
            'fiftyTwoWeekLow': safe_val(info.get('fiftyTwoWeekLow')),

            # Volume
            'volume': safe_val(info.get('volume') or info.get('regularMarketVolume')),
            'avgVolume': safe_val(info.get('averageVolume')),

            # Fundamentals
            'marketCap': safe_val(info.get('marketCap')),
            'trailingPE': safe_val(info.get('trailingPE')),
            'forwardPE': safe_val(info.get('forwardPE')),
            'trailingEps': safe_val(info.get('trailingEps')),
            'forwardEps': safe_val(info.get('forwardEps')),
            'dividendYield': safe_val(info.get('dividendYield')),
            'dividendRate': safe_val(info.get('dividendRate')),
            'beta': safe_val(info.get('beta')),
            'bookValue': safe_val(info.get('bookValue')),
            'priceToBook': safe_val(info.get('priceToBook')),

            # Additional
            'fiftyDayAverage': safe_val(info.get('fiftyDayAverage')),
            'twoHundredDayAverage': safe_val(info.get('twoHundredDayAverage')),

            # Quote type (EQUITY, ETF, MUTUALFUND, etc.)
            'quoteType': info.get('quoteType'),
        }
        set_cache(cache_key, result)
        return jsonify(result)
    except Exception as e:
        traceback.print_exc()
        err_str = str(e).lower()
        if 'rate' in err_str or 'too many' in err_str:
            return jsonify({'error': 'Rate limited by Yahoo Finance. Please wait a moment and try again.'}), 429
        return jsonify({'error': str(e)}), 500


# ── Dividend History ───────────────────────────────────────────
@app.route('/api/stock/<ticker>/dividends')
@retry_on_rate_limit()
def stock_dividends(ticker):
    """Get historical dividend payments."""
    try:
        stock = yf.Ticker(ticker, session=yf_session)
        dividends = stock.dividends

        if dividends is None or dividends.empty:
            return jsonify({'ticker': ticker.upper(), 'dividends': [], 'annualYield': []})

        # Individual dividends
        div_list = []
        for date, amount in dividends.items():
            div_list.append({
                'date': date.strftime('%Y-%m-%d'),
                'amount': safe_val(amount),
            })

        # Annual aggregation
        annual = {}
        for date, amount in dividends.items():
            year = date.year
            if year not in annual:
                annual[year] = 0.0
            annual[year] += float(amount)

        annual_list = [{'year': y, 'total': round(v, 4)} for y, v in sorted(annual.items())]

        return jsonify({
            'ticker': ticker.upper(),
            'dividends': div_list,
            'annual': annual_list,
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# ── Financial Statements ──────────────────────────────────────
@app.route('/api/stock/<ticker>/financials')
@retry_on_rate_limit()
def stock_financials(ticker):
    """Get income statement, balance sheet, and cash flow."""
    try:
        stock = yf.Ticker(ticker, session=yf_session)

        def df_to_dict(df):
            if df is None or df.empty:
                return []
            result = []
            for col in df.columns:
                period_data = {'period': col.strftime('%Y-%m-%d') if hasattr(col, 'strftime') else str(col)}
                for idx in df.index:
                    period_data[str(idx)] = safe_val(df.loc[idx, col])
                result.append(period_data)
            return result

        return jsonify({
            'ticker': ticker.upper(),
            'incomeStatement': df_to_dict(stock.financials),
            'balanceSheet': df_to_dict(stock.balance_sheet),
            'cashFlow': df_to_dict(stock.cashflow),
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# ── ETF Fund Data ──────────────────────────────────────────────
@app.route('/api/stock/<ticker>/etf')
@retry_on_rate_limit()
def stock_etf(ticker):
    """Get ETF-specific data: top holdings and sector weightings."""
    try:
        stock = yf.Ticker(ticker, session=yf_session)

        # Check if this is actually an ETF
        info = stock.info
        quote_type = info.get('quoteType', '')
        if quote_type != 'ETF':
            return jsonify({'error': f'{ticker} is not an ETF (type: {quote_type})'}), 400

        result = {
            'ticker': ticker.upper(),
            'topHoldings': [],
            'sectorWeightings': [],
        }

        try:
            fd = stock.funds_data

            # Top holdings
            try:
                holdings = fd.top_holdings
                if holdings is not None and not holdings.empty:
                    for symbol, row in holdings.iterrows():
                        result['topHoldings'].append({
                            'symbol': str(symbol),
                            'name': str(row.get('Name', row.get('Holding Name', symbol))),
                            'weight': safe_val(row.get('Holding Percent', row.get('% Assets', 0))),
                        })
            except Exception:
                pass

            # Sector weightings
            try:
                sectors = fd.sector_weightings
                if sectors is not None:
                    if isinstance(sectors, dict):
                        for sector, weight in sectors.items():
                            result['sectorWeightings'].append({
                                'sector': str(sector).replace('_', ' ').title(),
                                'weight': safe_val(weight),
                            })
                    elif hasattr(sectors, 'items'):
                        for sector, weight in sectors.items():
                            result['sectorWeightings'].append({
                                'sector': str(sector).replace('_', ' ').title(),
                                'weight': safe_val(weight),
                            })
            except Exception:
                pass

        except Exception:
            pass

        return jsonify(result)
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    print("🚀 Investment Simulator API Server starting on http://localhost:5000")
    app.run(debug=True, port=5000)
