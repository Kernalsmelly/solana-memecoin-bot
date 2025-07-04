import * as fs from 'fs';
import * as path from 'path';
import { NewPoolDetectedEvent } from '../services/newCoinDetector';

const LOG_PATH = path.resolve(__dirname, '../../data/pool_detection_log.csv');

const CSV_HEADER = 'timestamp,poolAddress,baseMint,quoteMint,lpMint,market,signature';

export function appendPoolDetectionLog(event: NewPoolDetectedEvent) {
    const exists = fs.existsSync(LOG_PATH);
    const row = [
        event.timestamp,
        event.poolAddress,
        event.baseMint,
        event.quoteMint,
        event.lpMint,
        event.market,
        event.signature
    ].map(x => `"${x ?? ''}"`).join(',');
    if (!exists) {
        fs.writeFileSync(LOG_PATH, CSV_HEADER + '\n' + row + '\n', { encoding: 'utf8' });
    } else {
        fs.appendFileSync(LOG_PATH, row + '\n', { encoding: 'utf8' });
    }
}
