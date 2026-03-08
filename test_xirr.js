const calcXIRR = (cashFlows, guess = 0.1) => {
    if (!cashFlows || cashFlows.length === 0) return null;

    // Sort cashflows by date
    cashFlows.sort((a, b) => a.date - b.date);

    const maxIter = 100;
    const tol = 1e-6;
    let rate = guess;

    const minDate = cashFlows[0].date;
    const getDays = (date) => (date - minDate) / (1000 * 60 * 60 * 24);

    for (let i = 0; i < maxIter; i++) {
        let f = 0;
        let df = 0;

        for (let j = 0; j < cashFlows.length; j++) {
            const days = getDays(cashFlows[j].date);
            const t = days / 365.0;
            const amount = cashFlows[j].amount;

            f += amount / Math.pow(1 + rate, t);
            if (t > 0) {
                df -= (t * amount) / Math.pow(1 + rate, t + 1);
            }
        }

        const nextRate = rate - f / df;
        if (Math.abs(nextRate - rate) < tol) {
            return nextRate;
        }
        rate = nextRate;

        if (rate <= -1) {
            rate = -0.999999;
        }
    }

    // If it fails to converge, try with a different guess or return null
    return rate;
};

// Test
const dcaCashFlows = [
    { amount: -100, date: new Date('2023-01-01') },
    { amount: -100, date: new Date('2023-02-01') },
    { amount: -100, date: new Date('2023-03-01') },
    { amount: -100, date: new Date('2023-04-01') },
    { amount: -100, date: new Date('2023-05-01') },
    { amount: -100, date: new Date('2023-06-01') },
    { amount: -100, date: new Date('2023-07-01') },
    { amount: -100, date: new Date('2023-08-01') },
    { amount: -100, date: new Date('2023-09-01') },
    { amount: -100, date: new Date('2023-10-01') },
    { amount: -100, date: new Date('2023-11-01') },
    { amount: -100, date: new Date('2023-12-01') },
    { amount: 1250, date: new Date('2023-12-31') }, // $50 profit
];

console.log("XIRR: ", calcXIRR(dcaCashFlows) * 100 + "%");
