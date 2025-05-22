#!/usr/bin/env ts-node
"use strict";
/**
 * Production Launch Script
 *
 * This script provides a robust wrapper for launching the trading bot in production:
 * - Validates configuration before startup
 * - Handles graceful shutdown on various signals
 * - Performs hourly health checks
 * - Provides periodic status reports
 * - Manages state persistence
 */
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
const childProcess = __importStar(require("child_process"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const dotenv = __importStar(require("dotenv"));
const notifications_1 = require("../utils/notifications");
// Load environment variables
dotenv.config();
// Constants
const DATA_DIR = process.env.DATA_DIRECTORY || './data';
const STATE_FILE = path.join(DATA_DIR, 'bot_state.json');
const OVERRIDE_FILE = path.join(DATA_DIR, 'emergency_stop');
const STATUS_INTERVAL_MS = 3600000; // 1 hour
const MAX_RESTART_ATTEMPTS = 5;
const RESTART_DELAY_MS = 10000; // 10 seconds
let botProcess = null;
let isShuttingDown = false;
let startTime = Date.now();
let restartCount = 0;
let statusInterval;
// Format time duration in human-readable format
function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0)
        return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0)
        return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0)
        return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}
// Validate configuration before starting
async function validateConfig() {
    console.log('🧪 Validating configuration...');
    return new Promise((resolve) => {
        const validator = childProcess.spawn('ts-node', ['src/scripts/validate-config.ts'], {
            stdio: 'inherit'
        });
        validator.on('close', (code) => {
            if (code === 0) {
                console.log('✅ Configuration validation passed');
                resolve(true);
            }
            else {
                console.error('❌ Configuration validation failed');
                resolve(false);
            }
        });
    });
}
// Check for emergency stop override
function checkEmergencyStop() {
    if (fs.existsSync(OVERRIDE_FILE)) {
        console.error(`⛔ Emergency stop file detected: ${OVERRIDE_FILE}`);
        return true;
    }
    return false;
}
// Start the bot process
function startBot() {
    console.log('🚀 Launching trading bot...');
    const process = childProcess.spawn('ts-node', ['src/launch.ts'], {
        stdio: ['pipe', 'pipe', 'pipe'], // Use tuple form for stdio
        env: { ...global.process.env, PRODUCTION_MODE: 'true' } // Use global.process.env to avoid conflict
    });
    // Handle output
    process.stdout?.on('data', (data) => {
        global.process.stdout.write(data); // Write to parent stdout
    });
    process.stderr?.on('data', (data) => {
        global.process.stderr.write(data); // Write to parent stderr
    });
    // Handle process events
    process.on('exit', async (code) => {
        if (isShuttingDown)
            return;
        console.log(`⚠️ Bot process exited with code ${code}`);
        if (code !== 0) {
            await (0, notifications_1.sendAlert)(`Bot process terminated unexpectedly with code ${code}`, 'WARNING');
            // Auto-restart logic
            if (restartCount < MAX_RESTART_ATTEMPTS) {
                restartCount++;
                console.log(`🔄 Attempting restart (${restartCount}/${MAX_RESTART_ATTEMPTS})...`);
                setTimeout(() => {
                    if (!isShuttingDown && !checkEmergencyStop()) {
                        botProcess = startBot();
                    }
                }, RESTART_DELAY_MS);
            }
            else {
                console.error(`❌ Maximum restart attempts (${MAX_RESTART_ATTEMPTS}) reached. Exiting.`);
                await (0, notifications_1.sendAlert)('Maximum restart attempts reached. Bot is down.', 'CRITICAL');
                shutdown();
            }
        }
    });
    return process;
}
// Print bot status
async function printStatus() {
    if (!botProcess || botProcess.exitCode !== null) {
        console.log('ℹ️ Bot is not running.');
        return;
    }
    const uptime = Date.now() - startTime;
    console.log('='.repeat(50));
    console.log(`📊 BOT STATUS REPORT`);
    console.log('='.repeat(50));
    console.log(`⏱️ Uptime: ${formatDuration(uptime)}`);
    console.log(`🔄 Restarts: ${restartCount}/${MAX_RESTART_ATTEMPTS}`);
    // Load and print state information if available
    if (fs.existsSync(STATE_FILE)) {
        try {
            const stateData = fs.readFileSync(STATE_FILE, 'utf8');
            const state = JSON.parse(stateData);
            console.log(`📈 Current Balance: $${state.currentBalance?.toFixed(2) || 'N/A'}`);
            console.log(`🏆 High Water Mark: $${state.highWaterMark?.toFixed(2) || 'N/A'}`);
            console.log(`📉 Daily Start: $${state.dailyStartBalance?.toFixed(2) || 'N/A'}`);
            console.log(`💰 Active Positions: ${state.activePositions || 0}`);
            console.log(`🕒 Last Update: ${state.lastUpdated || 'N/A'}`);
            console.log(`⚡ System Enabled: ${state.systemEnabled ? 'Yes' : 'No'}`);
            if (state.systemEnabled === false) {
                console.log(`⛔ System Disabled Reason: ${state.emergencyStopReason || 'Unknown'}`);
            }
            // Send status alert
            if (restartCount === 0) { // Only send if things are stable
                await (0, notifications_1.sendAlert)(`Status: Uptime ${formatDuration(uptime)}, Balance $${state.currentBalance?.toFixed(2) || 'N/A'}`, 'INFO');
            }
        }
        catch (err) {
            console.error(`❌ Error reading state file: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    else {
        console.log(`⚠️ No state file found at ${STATE_FILE}`);
    }
    console.log('='.repeat(50));
}
// Gracefully shutdown the bot
async function shutdown() {
    if (isShuttingDown)
        return;
    isShuttingDown = true;
    console.log('🛑 Shutting down bot...');
    clearInterval(statusInterval);
    if (botProcess && botProcess.exitCode === null) {
        // Try graceful shutdown first
        botProcess.kill('SIGTERM');
        // Force kill after timeout
        setTimeout(() => {
            if (botProcess && botProcess.exitCode === null) {
                console.log('⚠️ Force killing bot process...');
                botProcess.kill('SIGKILL');
            }
        }, 5000);
    }
    await (0, notifications_1.sendAlert)('Bot has been shut down.', 'WARNING');
    process.exit(0);
}
// Main function
async function main() {
    console.log('='.repeat(50));
    console.log('🤖 SOLANA MEMECOIN TRADING BOT - PRODUCTION MODE');
    console.log('='.repeat(50));
    // Check for emergency stop
    if (checkEmergencyStop()) {
        console.log('⛔ Emergency stop is active. Please remove the override file to continue.');
        await (0, notifications_1.sendAlert)('Bot startup prevented: Emergency stop is active', 'CRITICAL');
        process.exit(1);
    }
    // Validate configuration
    const configValid = await validateConfig();
    if (!configValid) {
        console.error('❌ Configuration validation failed. Please fix the issues before starting.');
        await (0, notifications_1.sendAlert)('Bot startup prevented: Configuration validation failed', 'CRITICAL');
        process.exit(1);
    }
    // Start the bot
    botProcess = startBot();
    // Setup periodic status reports
    statusInterval = setInterval(printStatus, STATUS_INTERVAL_MS);
    // Run first status report after 1 minute
    setTimeout(printStatus, 60000);
    // Handle termination signals
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('SIGHUP', shutdown);
    // Handle unhandled errors
    process.on('uncaughtException', async (err) => {
        console.error('❌ Unhandled exception:', err);
        await (0, notifications_1.sendAlert)(`Wrapper caught unhandled exception: ${err.message}`, 'CRITICAL');
        shutdown();
    });
    process.on('unhandledRejection', async (reason) => {
        console.error('❌ Unhandled rejection:', reason);
        await (0, notifications_1.sendAlert)(`Wrapper caught unhandled rejection: ${String(reason)}`, 'CRITICAL');
        shutdown();
    });
}
// Run main function
main().catch(async (err) => {
    console.error('❌ Fatal error in main wrapper:', err);
    await (0, notifications_1.sendAlert)(`Fatal error in production wrapper: ${err instanceof Error ? err.message : String(err)}`, 'CRITICAL');
    process.exit(1);
});
//# sourceMappingURL=production-launch.js.map