#!/usr/bin/env ts-node
/**
 * Emergency Stop Script
 *
 * This script provides a way to immediately stop all trading activities
 * by setting a flag in the state file. It can be executed independently
 * of the main bot process.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import logger from '../utils/logger';
import { sendAlert } from '../utils/notifications';

// Load environment variables
dotenv.config();

// Constants
const DATA_DIR = process.env.DATA_DIRECTORY || './data';
const STATE_FILE = path.join(DATA_DIR, 'bot_state.json');
const OVERRIDE_FILE = path.join(DATA_DIR, 'emergency_stop');

async function main() {
  const reason = process.argv[2] || 'Manual emergency stop triggered';
  
  console.log('\x1b[31m==============================================\x1b[0m');
  console.log('\x1b[31m              EMERGENCY STOP                 \x1b[0m');
  console.log('\x1b[31m==============================================\x1b[0m');
  console.log();
  console.log(`Reason: ${reason}`);
  console.log();
  
  try {
    // Check if data directory exists
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      console.log(`Created data directory: ${DATA_DIR}`);
    }
    
    // Create emergency override file
    fs.writeFileSync(OVERRIDE_FILE, `Emergency stop activated: ${reason}\nTimestamp: ${new Date().toISOString()}`);
    console.log(`Created emergency override file: ${OVERRIDE_FILE}`);
    
    // Try to update the state file if it exists
    if (fs.existsSync(STATE_FILE)) {
      let state;
      try {
        const stateData = fs.readFileSync(STATE_FILE, 'utf8');
        state = JSON.parse(stateData);
        
        // Update the state
        state.emergencyStopActive = true;
        state.systemEnabled = false;
        state.lastUpdated = new Date().toISOString();
        state.emergencyStopReason = reason;
        
        // Write updated state back to file
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
        console.log(`Updated state file: ${STATE_FILE}`);
      } catch (parseErr) {
        console.error(`Error parsing state file: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`);
        console.log('Created emergency override file anyway');
      }
    } else {
      console.log(`State file ${STATE_FILE} does not exist, created override file only`);
    }
    
    // Send alert notification
    try {
      await sendAlert('EMERGENCY STOP ACTIVATED: ' + reason, 'CRITICAL');
      console.log('Emergency alert notification sent successfully');
    } catch (alertErr) {
      console.error(`Failed to send alert notification: ${alertErr instanceof Error ? alertErr.message : String(alertErr)}`);
    }
    
    console.log();
    console.log('\x1b[32m✓ Emergency stop has been successfully activated!\x1b[0m');
    console.log('\x1b[33m⚠ The bot will stop all trading activities as soon as possible.\x1b[0m');
    console.log('\x1b[33m⚠ To resume operations, delete the file:\x1b[0m');
    console.log(`\x1b[33m   ${OVERRIDE_FILE}\x1b[0m`);
    console.log('\x1b[33m⚠ And restart the bot.\x1b[0m');
    
  } catch (err) {
    console.error(`\x1b[31mFailed to activate emergency stop: ${err instanceof Error ? err.message : String(err)}\x1b[0m`);
    process.exit(1);
  }
}

// Execute main function
main().catch(err => {
  console.error('\x1b[31mError executing emergency stop script:\x1b[0m', err);
  process.exit(1);
});
