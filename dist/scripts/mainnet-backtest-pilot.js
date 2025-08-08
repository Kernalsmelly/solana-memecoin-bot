import 'dotenv/config';
import ConnectionManager from '../src/connectionManager.js';
import { Trader } from '../src/lib/Trader.js';
(async () => {
    const conn = ConnectionManager.getInstance().getConnectionSync();
    const trader = new Trader(conn, { patternOnly: true });
    await trader.backtestAndApplyThresholds({
        minutes: 30,
        grid: {
            PRICE_CHANGE_THRESHOLD: [1, 2, 3],
            VOLUME_MULTIPLIER: [1.5, 2, 2.5],
        },
    });
    await trader.runPilot({ minutes: 10, maxTrades: 3 });
})();
//# sourceMappingURL=mainnet-backtest-pilot.js.map