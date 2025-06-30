"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.appendPoolDetectionLog = appendPoolDetectionLog;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const LOG_PATH = path.resolve(__dirname, '../../data/pool_detection_log.csv');
const CSV_HEADER = 'timestamp,poolAddress,baseMint,quoteMint,lpMint,market,signature';
function appendPoolDetectionLog(event) {
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
    }
    else {
        fs.appendFileSync(LOG_PATH, row + '\n', { encoding: 'utf8' });
    }
}
//# sourceMappingURL=poolDetectionLogger.js.map