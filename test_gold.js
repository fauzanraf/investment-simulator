// test_gold.js
const TradingView = require('/tmp/TV-API/main.js');

async function test() {
    try {
        const searchResults = await TradingView.searchMarketV3('GOLD');
        console.log('--- GOLD SEARCH RESULTS ---');
        console.log(searchResults.slice(0, 5));

        const searchResultsXau = await TradingView.searchMarketV3('XAUUSD');
        console.log('\n--- XAUUSD SEARCH RESULTS ---');
        console.log(searchResultsXau.slice(0, 5));

        console.log('\n--- FETCHING HISTORICAL DATA FOR XAUUSD ---');

        // Test historical data
        const client = new TradingView.Client();
        const chart = new client.Session.Chart();

        chart.setMarket('OANDA:XAUUSD', { timeframe: 'D' });

        chart.onError((...err) => {
            console.error('Chart error:', ...err);
            client.end();
        });

        chart.onUpdate(() => {
            console.log('Received chart update');
            const latest = chart.periods[0];
            if (latest) {
                console.log(`[${chart.infos.description}] Close: ${latest.close} \nAll Data length: ${chart.periods.length} \nFirst Date: ${new Date(chart.periods[chart.periods.length - 1].time * 1000).toISOString()}`);
            }
            client.end();
        });

    } catch (err) {
        console.error('Error during test:', err);
    }
}

test();
