import fs from 'fs';
import path from 'path';

const CONFIG_PATH = path.join(__dirname, '../src/utils/config.ts');
const SWEEP_RESULTS_PATH = path.join(__dirname, '../data/parameter_sweep_results.json');

function updateConfigFile(stopLoss: number, takeProfit: number) {
  let configText = fs.readFileSync(CONFIG_PATH, 'utf8');
  configText = configText.replace(/stopLossPercent:\s*[^,}]+/, `stopLossPercent: ${stopLoss}`);
  configText = configText.replace(/takeProfitPercent:\s*[^,}]+/, `takeProfitPercent: ${takeProfit}`);
  fs.writeFileSync(CONFIG_PATH, configText);
}

function emitParameterUpdateEvent(params: { stopLoss: number, takeProfit: number }) {
  // Placeholder: In production, this could emit to an event bus, log, or notification system
  console.log('ParameterUpdateEvent', params);
}

function main() {
  const sweep = JSON.parse(fs.readFileSync(SWEEP_RESULTS_PATH, 'utf8'));
  const { stopLoss, takeProfit } = sweep.bestParams;
  updateConfigFile(stopLoss, takeProfit);
  emitParameterUpdateEvent({ stopLoss, takeProfit });
  console.log('Config updated with best params:', { stopLoss, takeProfit });
}

if (require.main === module) main();
