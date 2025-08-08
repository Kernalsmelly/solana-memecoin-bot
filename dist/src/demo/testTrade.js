import { MockPriceFeed } from '../utils/mockPriceFeed.js';
import { TradeSimulator } from '../tradeSimulator.js';
async function runRobustTest() {
    console.log('\n🎯 Enhanced Smart Money Strategy - Robust Test Suite');
    console.log('================================================\n');
    const scenarios = [
        {
            name: 'Accumulation Phase',
            patterns: [
                { name: 'Selling Climax', price: 0.85, volume: 150, momentum: 15, volumeTrend: 50 },
                { name: 'Spring Formation', price: 0.8, volume: 180, momentum: -5, volumeTrend: 80 },
                { name: 'Test', price: 0.95, volume: 80, momentum: 25, volumeTrend: -20 },
                { name: 'Sign of Strength', price: 1.2, volume: 120, momentum: 40, volumeTrend: 20 },
                { name: 'Backup', price: 1.1, volume: 60, momentum: -10, volumeTrend: -40 },
                { name: 'Markup', price: 1.5, volume: 200, momentum: 45, volumeTrend: 100 },
            ],
        },
        {
            name: 'Distribution Phase',
            patterns: [
                { name: 'Preliminary Supply', price: 1.2, volume: 120, momentum: 30, volumeTrend: 20 },
                { name: 'Buying Climax', price: 1.5, volume: 180, momentum: 40, volumeTrend: 80 },
                { name: 'Automatic Reaction', price: 1.35, volume: 90, momentum: -15, volumeTrend: -10 },
                { name: 'Secondary Test', price: 1.45, volume: 70, momentum: 10, volumeTrend: -30 },
                { name: 'SOW', price: 1.25, volume: 150, momentum: -25, volumeTrend: 50 },
                { name: 'Markdown', price: 0.9, volume: 200, momentum: -40, volumeTrend: 100 },
            ],
        },
        {
            name: 'Bull Trap',
            patterns: [
                { name: 'Initial Rally', price: 1.3, volume: 150, momentum: 35, volumeTrend: 50 },
                { name: 'FOMO Peak', price: 1.5, volume: 200, momentum: 45, volumeTrend: 100 },
                { name: 'Sharp Decline', price: 1.2, volume: 180, momentum: -30, volumeTrend: 80 },
                { name: 'Bull Trap Rally', price: 1.35, volume: 120, momentum: 15, volumeTrend: 20 },
                { name: 'Capitulation', price: 0.8, volume: 250, momentum: -50, volumeTrend: 150 },
            ],
        },
        {
            name: 'Extreme Volatility',
            patterns: [
                { name: 'Initial Surge', price: 1.5, volume: 300, momentum: 60, volumeTrend: 150 },
                { name: 'First Shakeout', price: 1.2, volume: 400, momentum: -40, volumeTrend: 200 },
                { name: 'V-Shaped Recovery', price: 1.8, volume: 500, momentum: 70, volumeTrend: 250 },
                { name: 'Sharp Rejection', price: 1.4, volume: 600, momentum: -50, volumeTrend: 300 },
                { name: 'Final Surge', price: 2.0, volume: 700, momentum: 80, volumeTrend: 350 },
                { name: 'Collapse', price: 1.0, volume: 800, momentum: -70, volumeTrend: 400 },
            ],
        },
        {
            name: 'Low Liquidity Pump',
            patterns: [
                { name: 'Stealth Phase', price: 1.2, volume: 50, momentum: 20, volumeTrend: -50 },
                { name: 'Initial Pump', price: 2.0, volume: 30, momentum: 90, volumeTrend: -70 },
                { name: 'Volume Spike', price: 3.0, volume: 400, momentum: 95, volumeTrend: 200 },
                { name: 'Quick Drop', price: 2.5, volume: 300, momentum: -60, volumeTrend: 150 },
                { name: 'Dead Cat', price: 2.8, volume: 100, momentum: 30, volumeTrend: -30 },
                { name: 'Liquidity Crisis', price: 1.5, volume: 20, momentum: -80, volumeTrend: -90 },
            ],
        },
        {
            name: 'Flash Crash',
            patterns: [
                { name: 'Pre-Crash High', price: 2.0, volume: 200, momentum: 40, volumeTrend: 50 },
                { name: 'Initial Break', price: 1.8, volume: 400, momentum: -30, volumeTrend: 100 },
                { name: 'Cascade Start', price: 1.5, volume: 600, momentum: -50, volumeTrend: 200 },
                { name: 'Liquidation', price: 1.0, volume: 1000, momentum: -90, volumeTrend: 400 },
                { name: 'Bounce Attempt', price: 1.2, volume: 800, momentum: 20, volumeTrend: 300 },
                { name: 'Secondary Drop', price: 0.8, volume: 500, momentum: -60, volumeTrend: 150 },
            ],
        },
        {
            name: 'Wyckoff Spring',
            patterns: [
                { name: 'PS', price: 0.9, volume: 120, momentum: -20, volumeTrend: 20 },
                { name: 'SC', price: 0.85, volume: 150, momentum: -15, volumeTrend: 50 },
                { name: 'Spring', price: 0.75, volume: 200, momentum: -25, volumeTrend: 100 },
                { name: 'Test', price: 0.95, volume: 80, momentum: 30, volumeTrend: -20 },
                { name: 'Phase B', price: 1.2, volume: 180, momentum: 40, volumeTrend: 80 },
                { name: 'Phase C', price: 1.5, volume: 250, momentum: 45, volumeTrend: 150 },
                { name: 'Phase D', price: 2.0, volume: 300, momentum: 50, volumeTrend: 200 },
            ],
        },
        {
            name: 'Cascading Liquidation',
            patterns: [
                { price: 2.0, volume: 200, momentum: 40, volumeTrend: 50 },
                { price: 1.8, volume: 400, momentum: -20, volumeTrend: 150 },
                { price: 1.6, volume: 800, momentum: -40, volumeTrend: 250 },
                { price: 1.2, volume: 1200, momentum: -60, volumeTrend: 400 },
                { price: 1.0, volume: 2000, momentum: -80, volumeTrend: 600 },
                { price: 0.8, volume: 3000, momentum: -90, volumeTrend: 800 },
            ],
        },
        {
            name: 'Volatility Squeeze',
            patterns: [
                { price: 1.0, volume: 100, momentum: 10, volumeTrend: -50 },
                { price: 1.05, volume: 50, momentum: 5, volumeTrend: -70 },
                { price: 1.02, volume: 20, momentum: -5, volumeTrend: -90 },
                { price: 1.5, volume: 2000, momentum: 80, volumeTrend: 500 },
                { price: 1.2, volume: 1500, momentum: -40, volumeTrend: 400 },
                { price: 1.1, volume: 1000, momentum: -20, volumeTrend: 300 },
            ],
        },
        {
            name: 'Multi-Wave Bull Trap',
            patterns: [
                { price: 1.2, volume: 200, momentum: 30, volumeTrend: 50 },
                { price: 1.5, volume: 400, momentum: 50, volumeTrend: 100 },
                { price: 1.3, volume: 300, momentum: -20, volumeTrend: 80 },
                { price: 1.6, volume: 500, momentum: 60, volumeTrend: 150 },
                { price: 1.4, volume: 400, momentum: -30, volumeTrend: 120 },
                { price: 1.8, volume: 600, momentum: 70, volumeTrend: 200 },
                { price: 1.0, volume: 1000, momentum: -80, volumeTrend: 400 },
            ],
        },
        {
            name: 'Low Volume Manipulation',
            patterns: [
                { price: 1.0, volume: 100, momentum: 10, volumeTrend: -40 },
                { price: 1.2, volume: 50, momentum: 30, volumeTrend: -60 },
                { price: 1.5, volume: 20, momentum: 50, volumeTrend: -80 },
                { price: 1.4, volume: 30, momentum: -20, volumeTrend: -70 },
                { price: 1.6, volume: 10, momentum: 40, volumeTrend: -90 },
                { price: 1.1, volume: 500, momentum: -60, volumeTrend: 200 },
            ],
        },
        {
            name: 'Momentum Divergence',
            patterns: [
                { price: 1.0, volume: 200, momentum: 40, volumeTrend: 100 },
                { price: 1.2, volume: 300, momentum: 50, volumeTrend: 150 },
                { price: 1.4, volume: 200, momentum: 45, volumeTrend: 120 },
                { price: 1.6, volume: 150, momentum: 40, volumeTrend: 80 },
                { price: 1.8, volume: 100, momentum: 30, volumeTrend: 40 },
                { price: 1.3, volume: 400, momentum: -50, volumeTrend: 200 },
            ],
        },
        {
            name: 'Whale Distribution Game',
            patterns: [
                { price: 1.0, volume: 200, momentum: 20, volumeTrend: 50 }, // Base accumulation
                { price: 1.2, volume: 500, momentum: 40, volumeTrend: 150 }, // First push
                { price: 1.15, volume: 300, momentum: -10, volumeTrend: 80 }, // Mini dip
                { price: 1.4, volume: 800, momentum: 60, volumeTrend: 250 }, // FOMO push
                { price: 1.35, volume: 400, momentum: -20, volumeTrend: 100 }, // First distribution
                { price: 1.5, volume: 1000, momentum: 70, volumeTrend: 300 }, // Peak push
                { price: 1.45, volume: 600, momentum: -15, volumeTrend: 150 }, // Second distribution
                { price: 1.6, volume: 1200, momentum: 80, volumeTrend: 400 }, // Final push
                { price: 1.0, volume: 2000, momentum: -90, volumeTrend: 800 }, // Whale dump
            ],
        },
        {
            name: 'Low Float Squeeze',
            patterns: [
                { price: 1.0, volume: 100, momentum: 10, volumeTrend: -60 }, // Base
                { price: 1.05, volume: 50, momentum: 5, volumeTrend: -80 }, // Volume dry up
                { price: 1.03, volume: 20, momentum: -5, volumeTrend: -90 }, // Tight range
                { price: 1.1, volume: 10, momentum: 10, volumeTrend: -95 }, // Final squeeze
                { price: 1.5, volume: 1000, momentum: 90, volumeTrend: 300 }, // Breakout
                { price: 2.0, volume: 2000, momentum: 95, volumeTrend: 500 }, // Parabolic
                { price: 2.5, volume: 3000, momentum: 98, volumeTrend: 800 }, // Climax
                { price: 1.8, volume: 4000, momentum: -70, volumeTrend: 1000 }, // Blow-off top
            ],
        },
        {
            name: 'Smart Money Trap',
            patterns: [
                { price: 1.0, volume: 300, momentum: 30, volumeTrend: 100 }, // Strong base
                { price: 0.8, volume: 1000, momentum: -50, volumeTrend: 300 }, // Stop hunt
                { price: 0.9, volume: 500, momentum: 20, volumeTrend: 150 }, // Recovery
                { price: 0.75, volume: 1500, momentum: -60, volumeTrend: 400 }, // Second hunt
                { price: 1.1, volume: 2000, momentum: 70, volumeTrend: 600 }, // Strong reversal
                { price: 1.4, volume: 2500, momentum: 85, volumeTrend: 800 }, // Momentum peak
                { price: 1.2, volume: 1500, momentum: -30, volumeTrend: 400 }, // Distribution
                { price: 1.5, volume: 3000, momentum: 90, volumeTrend: 1000 }, // Final push
                { price: 0.9, volume: 4000, momentum: -80, volumeTrend: 1200 }, // Trap spring
            ],
        },
        {
            name: 'Momentum Cascade',
            patterns: [
                { price: 1.0, volume: 200, momentum: 40, volumeTrend: 100 }, // Strong start
                { price: 1.2, volume: 400, momentum: 60, volumeTrend: 200 }, // First leg
                { price: 1.5, volume: 800, momentum: 80, volumeTrend: 400 }, // Second leg
                { price: 1.8, volume: 1600, momentum: 90, volumeTrend: 800 }, // Peak momentum
                { price: 1.6, volume: 2000, momentum: -20, volumeTrend: 1000 }, // First crack
                { price: 1.4, volume: 2500, momentum: -40, volumeTrend: 1200 }, // Acceleration
                { price: 1.2, volume: 3000, momentum: -60, volumeTrend: 1400 }, // Cascade
                { price: 1.0, volume: 3500, momentum: -80, volumeTrend: 1600 }, // Panic
                { price: 0.8, volume: 4000, momentum: -90, volumeTrend: 1800 }, // Capitulation
            ],
        },
        {
            name: 'Volume Climax Reversal',
            patterns: [
                { price: 1.0, volume: 100, momentum: 20, volumeTrend: 50 }, // Base
                { price: 1.2, volume: 200, momentum: 40, volumeTrend: 100 }, // First push
                { price: 1.4, volume: 400, momentum: 60, volumeTrend: 200 }, // Acceleration
                { price: 1.6, volume: 800, momentum: 80, volumeTrend: 400 }, // FOMO
                { price: 1.8, volume: 1600, momentum: 90, volumeTrend: 800 }, // Climax
                { price: 1.6, volume: 3200, momentum: -30, volumeTrend: 1600 }, // Volume spike
                { price: 1.4, volume: 2400, momentum: -50, volumeTrend: 1200 }, // Distribution
                { price: 1.2, volume: 1800, momentum: -70, volumeTrend: 900 }, // Continuation
                { price: 1.0, volume: 1200, momentum: -85, volumeTrend: 600 }, // Final flush
            ],
        },
        {
            name: 'Hidden Accumulation',
            patterns: [
                { price: 1.0, volume: 0.1, momentum: 10, volumeTrend: -30 }, // Low volume decline
                { price: 0.8, volume: 0.2, momentum: -20, volumeTrend: -50 }, // Selling climax
                { price: 0.9, volume: 0.3, momentum: 30, volumeTrend: 100 }, // Spring test
                { price: 0.85, volume: 0.1, momentum: -10, volumeTrend: -20 }, // Secondary test
                { price: 1.2, volume: 0.5, momentum: 60, volumeTrend: 200 }, // Sign of strength
                { price: 1.1, volume: 0.2, momentum: -15, volumeTrend: 50 }, // Backup
                { price: 1.5, volume: 0.8, momentum: 80, volumeTrend: 400 }, // Markup
            ],
        },
        {
            name: 'Liquidity Cascade',
            patterns: [
                { price: 1.0, volume: 0.2, momentum: 40, volumeTrend: 100 }, // Initial stability
                { price: 1.2, volume: 0.5, momentum: 60, volumeTrend: 200 }, // First push
                { price: 1.0, volume: 1.0, momentum: -30, volumeTrend: 400 }, // First liquidation
                { price: 1.1, volume: 0.8, momentum: 20, volumeTrend: 300 }, // Dead cat bounce
                { price: 0.9, volume: 1.5, momentum: -50, volumeTrend: 600 }, // Second liquidation
                { price: 0.95, volume: 1.2, momentum: 10, volumeTrend: 500 }, // Weak bounce
                { price: 0.7, volume: 2.0, momentum: -70, volumeTrend: 800 }, // Final cascade
                { price: 0.8, volume: 2.5, momentum: 30, volumeTrend: 1000 }, // Recovery attempt
            ],
        },
        {
            name: 'Momentum Divergence Trap',
            patterns: [
                { price: 1.0, volume: 0.1, momentum: 30, volumeTrend: 50 }, // Initial move
                { price: 1.2, volume: 0.2, momentum: 50, volumeTrend: 100 }, // First peak
                { price: 1.1, volume: 0.3, momentum: -20, volumeTrend: 150 }, // First pullback
                { price: 1.3, volume: 0.2, momentum: 40, volumeTrend: 80 }, // Second peak (lower momentum)
                { price: 1.2, volume: 0.4, momentum: -30, volumeTrend: 200 }, // Second pullback
                { price: 1.4, volume: 0.1, momentum: 30, volumeTrend: -50 }, // Final peak (divergence)
                { price: 1.0, volume: 0.8, momentum: -60, volumeTrend: 400 }, // Sharp decline
            ],
        },
        {
            name: 'Low Float Manipulation',
            patterns: [
                { price: 1.0, volume: 0.05, momentum: 20, volumeTrend: -70 }, // Low volume base
                { price: 1.2, volume: 0.02, momentum: 40, volumeTrend: -90 }, // Stealth pump
                { price: 1.5, volume: 0.01, momentum: 60, volumeTrend: -95 }, // Low liquidity push
                { price: 2.0, volume: 0.3, momentum: 90, volumeTrend: 150 }, // Volume spike
                { price: 1.8, volume: 0.2, momentum: -20, volumeTrend: 100 }, // First distribution
                { price: 1.9, volume: 0.1, momentum: 30, volumeTrend: -30 }, // Bull trap
                { price: 1.2, volume: 0.4, momentum: -70, volumeTrend: 200 }, // Sharp decline
                { price: 0.8, volume: 0.5, momentum: -90, volumeTrend: 250 }, // Capitulation
            ],
        },
        {
            name: 'Range Break Trap',
            patterns: [
                { price: 1.0, volume: 0.1, momentum: 10, volumeTrend: 50 }, // Range bottom
                { price: 1.1, volume: 0.2, momentum: 30, volumeTrend: 100 }, // Range top
                { price: 1.0, volume: 0.1, momentum: -10, volumeTrend: 50 }, // Range retest
                { price: 1.2, volume: 0.3, momentum: 50, volumeTrend: 150 }, // False breakout
                { price: 1.3, volume: 0.2, momentum: 40, volumeTrend: -30 }, // Extended move
                { price: 1.1, volume: 0.4, momentum: -30, volumeTrend: 200 }, // Failed breakout
                { price: 0.9, volume: 0.5, momentum: -50, volumeTrend: 250 }, // Range breakdown
            ],
        },
        {
            name: 'Engineered Liquidation',
            patterns: [
                { price: 1.0, volume: 0.2, momentum: 30, volumeTrend: 100 }, // Base building
                { price: 1.2, volume: 0.4, momentum: 50, volumeTrend: 200 }, // Initial push
                { price: 1.4, volume: 0.8, momentum: 70, volumeTrend: 400 }, // FOMO rally
                { price: 1.3, volume: 1.0, momentum: -20, volumeTrend: 500 }, // First shake
                { price: 1.35, volume: 0.6, momentum: 30, volumeTrend: 300 }, // Relief bounce
                { price: 1.2, volume: 1.5, momentum: -40, volumeTrend: 700 }, // Second shake
                { price: 1.25, volume: 1.0, momentum: 20, volumeTrend: 500 }, // Weak bounce
                { price: 0.9, volume: 2.0, momentum: -80, volumeTrend: 1000 }, // Mass liquidation
                { price: 0.8, volume: 2.5, momentum: -90, volumeTrend: 1200 }, // Capitulation
            ],
        },
        {
            name: 'Wyckoff Re-Accumulation',
            patterns: [
                { price: 1.0, volume: 100, momentum: 20, volumeTrend: 50 }, // Preliminary Support (PS)
                { price: 1.2, volume: 200, momentum: 40, volumeTrend: 100 }, // Buying Climax (BC)
                { price: 1.05, volume: 150, momentum: -20, volumeTrend: 80 }, // Automatic Reaction (AR)
                { price: 1.15, volume: 100, momentum: 30, volumeTrend: -30 }, // Secondary Test (ST)
                { price: 1.0, volume: 300, momentum: -40, volumeTrend: 150 }, // Spring
                { price: 1.1, volume: 200, momentum: 20, volumeTrend: 100 }, // Test
                { price: 1.3, volume: 400, momentum: 50, volumeTrend: 200 }, // Sign of Strength (SOS)
                { price: 1.2, volume: 300, momentum: -20, volumeTrend: 150 }, // Backup
                { price: 1.5, volume: 500, momentum: 60, volumeTrend: 300 }, // Markup
            ],
        },
        {
            name: 'Triple Top Distribution',
            patterns: [
                { price: 1.0, volume: 100, momentum: 30, volumeTrend: 50 }, // Initial Rally
                { price: 1.2, volume: 200, momentum: 50, volumeTrend: 100 }, // First Top
                { price: 1.1, volume: 150, momentum: -20, volumeTrend: 80 }, // First Pullback
                { price: 1.2, volume: 180, momentum: 40, volumeTrend: 90 }, // Second Top
                { price: 1.08, volume: 160, momentum: -30, volumeTrend: 70 }, // Second Pullback
                { price: 1.2, volume: 150, momentum: 35, volumeTrend: 60 }, // Third Top
                { price: 1.05, volume: 200, momentum: -40, volumeTrend: 120 }, // Break Support
                { price: 1.12, volume: 180, momentum: 20, volumeTrend: -30 }, // Dead Cat Bounce
                { price: 0.9, volume: 400, momentum: -60, volumeTrend: 200 }, // Distribution Breakdown
            ],
        },
        {
            name: 'Institutional Absorption',
            patterns: [
                { price: 1.0, volume: 50, momentum: 10, volumeTrend: -50 }, // Low Volume Drift
                { price: 0.95, volume: 300, momentum: -30, volumeTrend: 150 }, // Selling Climax
                { price: 1.05, volume: 400, momentum: 20, volumeTrend: 200 }, // Hidden Accumulation
                { price: 1.0, volume: 200, momentum: -15, volumeTrend: 100 }, // Test of Support
                { price: 1.1, volume: 500, momentum: 40, volumeTrend: 250 }, // Institutional Buying
                { price: 1.05, volume: 300, momentum: -20, volumeTrend: 150 }, // Shake Out
                { price: 1.2, volume: 600, momentum: 50, volumeTrend: 300 }, // Mark Up Phase
                { price: 1.15, volume: 400, momentum: -15, volumeTrend: 200 }, // Consolidation
                { price: 1.4, volume: 800, momentum: 70, volumeTrend: 400 }, // Institutional Display
            ],
        },
        {
            name: 'Momentum Failure Pattern',
            patterns: [
                { price: 1.0, volume: 100, momentum: 20, volumeTrend: 50 }, // Base Building
                { price: 1.2, volume: 200, momentum: 40, volumeTrend: 100 }, // Initial Breakout
                { price: 1.4, volume: 300, momentum: 60, volumeTrend: 150 }, // Strong Momentum
                { price: 1.6, volume: 400, momentum: 80, volumeTrend: 200 }, // Peak Momentum
                { price: 1.55, volume: 350, momentum: 40, volumeTrend: 180 }, // First Warning
                { price: 1.65, volume: 300, momentum: 50, volumeTrend: 150 }, // Lower High
                { price: 1.5, volume: 400, momentum: -20, volumeTrend: 200 }, // Support Break
                { price: 1.55, volume: 200, momentum: 10, volumeTrend: -50 }, // Failed Rally
                { price: 1.3, volume: 500, momentum: -60, volumeTrend: 250 }, // Momentum Collapse
            ],
        },
        {
            name: 'Smart Money Divergence',
            patterns: [
                { price: 1.0, volume: 100, momentum: 30, volumeTrend: -30 }, // Quiet Accumulation
                { price: 1.1, volume: 50, momentum: 40, volumeTrend: -50 }, // Low Volume Rise
                { price: 1.25, volume: 30, momentum: 50, volumeTrend: -70 }, // Retail FOMO
                { price: 1.4, volume: 20, momentum: 60, volumeTrend: -90 }, // Volume Divergence
                { price: 1.35, volume: 200, momentum: -20, volumeTrend: 100 }, // First Distribution
                { price: 1.45, volume: 150, momentum: 30, volumeTrend: -40 }, // Bull Trap
                { price: 1.3, volume: 300, momentum: -40, volumeTrend: 150 }, // Heavy Distribution
                { price: 1.35, volume: 100, momentum: 10, volumeTrend: -60 }, // Final Bull Trap
                { price: 1.0, volume: 400, momentum: -70, volumeTrend: 200 }, // Smart Money Exit
            ],
        },
        {
            name: 'Liquidity Hunt Complex',
            patterns: [
                { price: 1.0, volume: 200, momentum: -40, volumeTrend: 100 }, // Stop Hunt Low
                { price: 1.15, volume: 300, momentum: 30, volumeTrend: 150 }, // Relief Rally
                { price: 1.1, volume: 250, momentum: -20, volumeTrend: 120 }, // First Consolidation
                { price: 1.25, volume: 400, momentum: 50, volumeTrend: 200 }, // Breakout
                { price: 1.2, volume: 350, momentum: -30, volumeTrend: 170 }, // High Test
                { price: 1.3, volume: 450, momentum: 40, volumeTrend: 220 }, // New High
                { price: 1.15, volume: 500, momentum: -50, volumeTrend: 250 }, // Stop Hunt High
                { price: 1.2, volume: 300, momentum: 20, volumeTrend: 150 }, // Failed Recovery
                { price: 0.9, volume: 600, momentum: -80, volumeTrend: 300 }, // Liquidity Cascade
            ],
        },
        {
            name: 'Institutional Iceberg',
            patterns: [
                { price: 1.0, volume: 50, momentum: 10, volumeTrend: -80 }, // Quiet Accumulation
                { price: 1.05, volume: 30, momentum: 20, volumeTrend: -90 }, // Stealth Buying
                { price: 1.1, volume: 20, momentum: 30, volumeTrend: -95 }, // Continued Accumulation
                { price: 1.08, volume: 200, momentum: -20, volumeTrend: 100 }, // First Iceberg Show
                { price: 1.15, volume: 300, momentum: 40, volumeTrend: 150 }, // Breakout
                { price: 1.12, volume: 400, momentum: -30, volumeTrend: 200 }, // Second Iceberg
                { price: 1.25, volume: 500, momentum: 60, volumeTrend: 250 }, // Major Push
                { price: 1.2, volume: 600, momentum: -40, volumeTrend: 300 }, // Final Iceberg
                { price: 1.4, volume: 1000, momentum: 80, volumeTrend: 500 }, // Full Display
            ],
        },
        {
            name: 'Algorithmic Stop Hunt',
            patterns: [
                { price: 1.0, volume: 200, momentum: -30, volumeTrend: 100 }, // Initial Drop
                { price: 0.95, volume: 300, momentum: -50, volumeTrend: 150 }, // Stop Trigger
                { price: 0.9, volume: 400, momentum: -70, volumeTrend: 200 }, // Cascade
                { price: 0.85, volume: 500, momentum: -90, volumeTrend: 250 }, // Capitulation
                { price: 0.95, volume: 400, momentum: 30, volumeTrend: 200 }, // Quick Recovery
                { price: 1.05, volume: 300, momentum: 50, volumeTrend: 150 }, // Momentum Shift
                { price: 1.15, volume: 200, momentum: 70, volumeTrend: 100 }, // Continuation
                { price: 1.25, volume: 100, momentum: 90, volumeTrend: 50 }, // Extension
                { price: 1.2, volume: 300, momentum: -20, volumeTrend: 150 }, // Consolidation
            ],
        },
        {
            name: 'Volatility Compression',
            patterns: [
                { price: 1.0, volume: 100, momentum: 10, volumeTrend: -50 }, // Base Building
                { price: 1.02, volume: 90, momentum: 5, volumeTrend: -60 }, // Compression Start
                { price: 0.98, volume: 80, momentum: -5, volumeTrend: -70 }, // Range Tightening
                { price: 1.01, volume: 70, momentum: 3, volumeTrend: -80 }, // Further Compression
                { price: 0.99, volume: 60, momentum: -3, volumeTrend: -90 }, // Maximum Compression
                { price: 1.2, volume: 500, momentum: 70, volumeTrend: 300 }, // Explosive Breakout
                { price: 1.15, volume: 400, momentum: -20, volumeTrend: 200 }, // First Pullback
                { price: 1.3, volume: 600, momentum: 60, volumeTrend: 400 }, // Continuation
                { price: 1.25, volume: 500, momentum: -30, volumeTrend: 300 }, // Stabilization
            ],
        },
        {
            name: 'Smart Money Accumulation',
            patterns: [
                { price: 1.0, volume: 300, momentum: -40, volumeTrend: 150 }, // Selling Climax
                { price: 0.9, volume: 400, momentum: -60, volumeTrend: 200 }, // Automatic Rally
                { price: 0.85, volume: 500, momentum: -80, volumeTrend: 250 }, // Secondary Test
                { price: 0.95, volume: 200, momentum: 20, volumeTrend: -50 }, // Spring
                { price: 0.9, volume: 100, momentum: -20, volumeTrend: -70 }, // Test
                { price: 1.1, volume: 600, momentum: 60, volumeTrend: 300 }, // Sign of Strength
                { price: 1.05, volume: 400, momentum: -30, volumeTrend: 200 }, // Backup
                { price: 1.2, volume: 700, momentum: 70, volumeTrend: 350 }, // First Markup
                { price: 1.4, volume: 1000, momentum: 90, volumeTrend: 500 }, // Second Markup
            ],
        },
        {
            name: 'Engineered Short Squeeze',
            patterns: [
                { price: 1.0, volume: 200, momentum: -20, volumeTrend: 100 }, // Initial Weakness
                { price: 0.95, volume: 300, momentum: -40, volumeTrend: 150 }, // Short Build-up
                { price: 0.9, volume: 400, momentum: -60, volumeTrend: 200 }, // Maximum Pain
                { price: 1.0, volume: 500, momentum: 20, volumeTrend: 250 }, // First Cover
                { price: 1.1, volume: 600, momentum: 40, volumeTrend: 300 }, // Momentum Shift
                { price: 1.25, volume: 700, momentum: 60, volumeTrend: 350 }, // Squeeze Start
                { price: 1.5, volume: 800, momentum: 80, volumeTrend: 400 }, // Peak Squeeze
                { price: 1.4, volume: 600, momentum: -20, volumeTrend: 300 }, // Profit Taking
                { price: 1.3, volume: 400, momentum: -40, volumeTrend: 200 }, // Stabilization
            ],
        },
        {
            name: 'Dark Pool Distribution',
            patterns: [
                { price: 1.0, volume: 50, momentum: 20, volumeTrend: -80 }, // Quiet Accumulation
                { price: 1.1, volume: 40, momentum: 30, volumeTrend: -90 }, // Stealth Distribution
                { price: 1.2, volume: 30, momentum: 40, volumeTrend: -95 }, // Continued Distribution
                { price: 1.3, volume: 20, momentum: 50, volumeTrend: -97 }, // Peak Distribution
                { price: 1.25, volume: 300, momentum: -20, volumeTrend: 150 }, // First Display
                { price: 1.35, volume: 400, momentum: 30, volumeTrend: 200 }, // Bull Trap
                { price: 1.2, volume: 500, momentum: -40, volumeTrend: 250 }, // Heavy Distribution
                { price: 1.25, volume: 600, momentum: 20, volumeTrend: 300 }, // Final Bull Trap
                { price: 1.0, volume: 1000, momentum: -70, volumeTrend: 500 }, // Collapse
            ],
        },
        {
            name: 'Iceberg Absorption',
            patterns: [
                { price: 1.0, volume: 100, momentum: 20, volumeTrend: -80 }, // Hidden accumulation
                { price: 0.95, volume: 50, momentum: -10, volumeTrend: -90 }, // Price suppression
                { price: 1.1, volume: 200, momentum: 30, volumeTrend: 100 }, // Visible buy
                { price: 1.05, volume: 50, momentum: -15, volumeTrend: -85 }, // Absorption
                { price: 1.2, volume: 300, momentum: 40, volumeTrend: 150 }, // Break up
                { price: 1.5, volume: 500, momentum: 60, volumeTrend: 250 }, // Markup
            ],
        },
        {
            name: 'Composite Man Game',
            patterns: [
                { price: 1.0, volume: 100, momentum: 15, volumeTrend: 50 }, // Initial interest
                { price: 1.2, volume: 200, momentum: 35, volumeTrend: 100 }, // Public participation
                { price: 1.1, volume: 300, momentum: -20, volumeTrend: 150 }, // Shakeout
                { price: 1.3, volume: 400, momentum: 45, volumeTrend: 200 }, // Mark up
                { price: 1.2, volume: 500, momentum: -25, volumeTrend: 250 }, // Secondary test
                { price: 1.5, volume: 600, momentum: 55, volumeTrend: 300 }, // Final markup
            ],
        },
        {
            name: 'Smart Money Reversal',
            patterns: [
                { price: 1.0, volume: 200, momentum: -30, volumeTrend: 100 }, // Selling climax
                { price: 0.9, volume: 300, momentum: -45, volumeTrend: 150 }, // Automatic rally
                { price: 0.85, volume: 400, momentum: -60, volumeTrend: 200 }, // Secondary test
                { price: 1.0, volume: 500, momentum: 20, volumeTrend: 250 }, // Spring
                { price: 1.2, volume: 600, momentum: 40, volumeTrend: 300 }, // Sign of strength
                { price: 1.5, volume: 700, momentum: 60, volumeTrend: 350 }, // Markup
            ],
        },
        {
            name: 'Institutional Distribution',
            patterns: [
                { price: 1.0, volume: 100, momentum: 40, volumeTrend: -70 }, // Stealth distribution
                { price: 1.2, volume: 200, momentum: 60, volumeTrend: -60 }, // Public participation
                { price: 1.15, volume: 300, momentum: -20, volumeTrend: 100 }, // Upthrust
                { price: 1.25, volume: 400, momentum: 30, volumeTrend: -50 }, // Secondary test
                { price: 1.15, volume: 500, momentum: -40, volumeTrend: 200 }, // Sign of weakness
                { price: 0.9, volume: 600, momentum: -60, volumeTrend: 300 }, // Markdown
            ],
        },
        {
            name: 'Algorithmic Liquidity Hunt',
            patterns: [
                { price: 1.0, volume: 200, momentum: -20, volumeTrend: 100 }, // Initial weakness
                { price: 0.9, volume: 300, momentum: -40, volumeTrend: 150 }, // Stop sweep low
                { price: 1.1, volume: 400, momentum: 30, volumeTrend: 200 }, // Sharp reversal
                { price: 1.3, volume: 500, momentum: 50, volumeTrend: 250 }, // Momentum chase
                { price: 1.5, volume: 600, momentum: 70, volumeTrend: 300 }, // FOMO peak
                { price: 1.2, volume: 700, momentum: -30, volumeTrend: 350 }, // Distribution
            ],
        },
        {
            name: 'Dark Pool Accumulation',
            patterns: [
                { price: 1.0, volume: 50, momentum: -10, volumeTrend: -90 }, // Hidden buying
                { price: 0.95, volume: 40, momentum: -20, volumeTrend: -95 }, // Price suppression
                { price: 0.9, volume: 30, momentum: -30, volumeTrend: -97 }, // Final test
                { price: 1.1, volume: 300, momentum: 40, volumeTrend: 150 }, // Visible breakout
                { price: 1.3, volume: 400, momentum: 60, volumeTrend: 200 }, // Public chase
                { price: 1.5, volume: 500, momentum: 80, volumeTrend: 250 }, // Mark up
            ],
        },
        {
            name: 'Volatility Expansion Trap',
            patterns: [
                { price: 1.0, volume: 100, momentum: 20, volumeTrend: -50 }, // Low volatility base
                { price: 1.2, volume: 200, momentum: 40, volumeTrend: 100 }, // Initial breakout
                { price: 1.4, volume: 300, momentum: 60, volumeTrend: 150 }, // Momentum chase
                { price: 1.2, volume: 400, momentum: -30, volumeTrend: 200 }, // Sharp reversal
                { price: 1.3, volume: 500, momentum: 20, volumeTrend: 250 }, // Dead cat bounce
                { price: 1.0, volume: 600, momentum: -50, volumeTrend: 300 }, // Trap completion
            ],
        },
        {
            name: 'Institutional Range Game',
            patterns: [
                { price: 1.0, volume: 200, momentum: 30, volumeTrend: -60 }, // Range establishment
                { price: 1.15, volume: 300, momentum: 45, volumeTrend: 100 }, // Upper test
                { price: 0.9, volume: 400, momentum: -35, volumeTrend: 150 }, // Lower sweep
                { price: 1.1, volume: 500, momentum: 25, volumeTrend: -70 }, // Accumulation
                { price: 1.3, volume: 600, momentum: 55, volumeTrend: 200 }, // Range break
                { price: 1.5, volume: 700, momentum: 75, volumeTrend: 250 }, // Trend start
            ],
        },
        {
            name: 'Smart Money Divergence',
            patterns: [
                { price: 1.0, volume: 300, momentum: 50, volumeTrend: 150 }, // Initial strength
                { price: 1.2, volume: 200, momentum: 60, volumeTrend: 100 }, // New high
                { price: 1.3, volume: 100, momentum: 70, volumeTrend: 50 }, // Volume divergence
                { price: 1.25, volume: 400, momentum: -20, volumeTrend: 200 }, // First crack
                { price: 1.35, volume: 300, momentum: 40, volumeTrend: 150 }, // Final test
                { price: 1.1, volume: 500, momentum: -40, volumeTrend: 250 }, // Distribution
            ],
        },
        {
            name: 'Mega Pump and Dump',
            patterns: [
                { price: 1.0, volume: 0.1, momentum: 20, volumeTrend: -50 }, // Quiet accumulation
                { price: 2.0, volume: 0.5, momentum: 80, volumeTrend: 200 }, // Initial pump
                { price: 5.0, volume: 1.0, momentum: 95, volumeTrend: 400 }, // FOMO peak
                { price: 3.0, volume: 1.5, momentum: -60, volumeTrend: 600 }, // Sharp rejection
                { price: 4.0, volume: 0.8, momentum: 40, volumeTrend: 300 }, // Dead cat bounce
                { price: 0.5, volume: 2.0, momentum: -90, volumeTrend: 800 }, // Complete collapse
            ],
        },
        {
            name: 'Flash Pump',
            patterns: [
                { price: 1.0, volume: 0.1, momentum: 10, volumeTrend: -30 }, // Quiet period
                { price: 10.0, volume: 5.0, momentum: 99, volumeTrend: 2000 }, // Massive spike
                { price: 2.0, volume: 3.0, momentum: -80, volumeTrend: 1500 }, // Instant crash
                { price: 1.5, volume: 0.5, momentum: -40, volumeTrend: 200 }, // Stabilization attempt
                { price: 0.8, volume: 0.2, momentum: -60, volumeTrend: 100 }, // Final capitulation
            ],
        },
        {
            name: 'Liquidity Black Hole',
            patterns: [
                { price: 1.0, volume: 0.5, momentum: 30, volumeTrend: 100 }, // Normal trading
                { price: 0.7, volume: 0.0, momentum: -40, volumeTrend: -100 }, // Liquidity vanishes
                { price: 0.4, volume: 0.0, momentum: -60, volumeTrend: -100 }, // Price vacuum
                { price: 0.2, volume: 0.0, momentum: -80, volumeTrend: -100 }, // Complete void
                { price: 0.1, volume: 0.1, momentum: -90, volumeTrend: -90 }, // Market death
            ],
        },
        {
            name: 'Momentum Cascade',
            patterns: [
                { price: 1.0, volume: 0.2, momentum: 40, volumeTrend: 100 }, // Initial strength
                { price: 1.2, volume: 0.4, momentum: 60, volumeTrend: 200 }, // Building momentum
                { price: 0.8, volume: 0.8, momentum: -30, volumeTrend: 400 }, // First break
                { price: 0.6, volume: 1.2, momentum: -50, volumeTrend: 600 }, // Acceleration
                { price: 0.4, volume: 1.6, momentum: -70, volumeTrend: 800 }, // Cascade
                { price: 0.2, volume: 2.0, momentum: -90, volumeTrend: 1000 }, // Waterfall
            ],
        },
        {
            name: 'Volume Extinction',
            patterns: [
                { price: 1.0, volume: 1.0, momentum: 20, volumeTrend: 100 }, // Normal volume
                { price: 0.9, volume: 0.5, momentum: -10, volumeTrend: -50 }, // Volume decline
                { price: 0.8, volume: 0.2, momentum: -30, volumeTrend: -80 }, // Volume dying
                { price: 0.7, volume: 0.1, momentum: -50, volumeTrend: -90 }, // Near death
                { price: 0.5, volume: 0.0, momentum: -70, volumeTrend: -100 }, // Complete death
            ],
        },
        {
            name: 'Algorithmic Warfare',
            patterns: [
                { price: 1.0, volume: 0.5, momentum: 30, volumeTrend: 100 }, // Base state
                { price: 1.5, volume: 2.0, momentum: 70, volumeTrend: 800 }, // Algo pump
                { price: 0.7, volume: 2.0, momentum: -60, volumeTrend: 800 }, // Algo dump
                { price: 1.2, volume: 2.0, momentum: 50, volumeTrend: 800 }, // Counter algo
                { price: 0.5, volume: 2.0, momentum: -80, volumeTrend: 800 }, // Algo victory
            ],
        },
        {
            name: 'Volatility Supernova',
            patterns: [
                { price: 1.0, volume: 0.2, momentum: 20, volumeTrend: 100 }, // Calm before storm
                { price: 2.0, volume: 1.0, momentum: 80, volumeTrend: 400 }, // First explosion
                { price: 0.5, volume: 1.5, momentum: -70, volumeTrend: 600 }, // Violent crash
                { price: 3.0, volume: 2.0, momentum: 90, volumeTrend: 800 }, // Mega bounce
                { price: 0.2, volume: 2.5, momentum: -90, volumeTrend: 1000 }, // Final implosion
            ],
        },
    ];
    const results = [];
    for (const scenario of scenarios) {
        console.log(`\n🔄 Testing Scenario: ${scenario.name}`);
        console.log('----------------------------------------\n');
        const priceFeed = new MockPriceFeed();
        const simulator = new TradeSimulator(priceFeed, 1000);
        const initialValue = 500;
        let totalValue = initialValue;
        let maxValue = initialValue;
        let minValue = initialValue;
        let realizedPnl = 0;
        // Initialize with base volume profile
        if (scenario.patterns.length > 0) {
            const firstPattern = scenario.patterns[0];
            // Double-check the first pattern exists to satisfy stricter TS checks
            if (firstPattern) {
                const baseVolume = 100000;
                priceFeed.updatePrice('TEST_TOKEN', firstPattern.price, baseVolume);
            }
            else {
                // This case should theoretically not happen due to the outer check,
                // but adding it handles edge cases and satisfies the compiler.
                console.error(`Scenario "${scenario.name}" has patterns array but first element is undefined.`);
                continue;
            }
        }
        else {
            console.warn(`Scenario "${scenario.name}" has no patterns, skipping initialization.`);
            continue; // Skip to the next scenario if no patterns exist
        }
        // Wait for initial setup
        await new Promise((resolve) => setTimeout(resolve, 100));
        // Execute buy
        await simulator.executeTrade('TEST_TOKEN', initialValue, 'BUY');
        // Run through patterns
        for (const pattern of scenario.patterns) {
            const volumeProfile = {
                volumeTrend: pattern.volumeTrend,
                volumeSpikes: pattern.volumeTrend > 100 ? 2 : 0,
                averageVolume: pattern.volumeTrend > 100 ? 1000000 : 100000,
                recentVolume: pattern.volume,
                previousPrice: priceFeed.getPrice('TEST_TOKEN'),
                currentPrice: pattern.price,
            };
            // Store position value before update
            const prevPositionValue = simulator.getPositionValue('TEST_TOKEN');
            // Update the price feed. The simulator should ideally react internally.
            priceFeed.updatePrice('TEST_TOKEN', pattern.price, pattern.volume, volumeProfile);
            // TODO: If the simulator needs to explicitly check patterns after a price update,
            // a method like simulator.checkForPatterns() could be called here.
            // For now, we remove the old logic relying on a return value from updatePrice.
            // Calculate current position value and any realized gains
            const currentPositionValue = simulator.getPositionValue('TEST_TOKEN');
            if (currentPositionValue < prevPositionValue) {
                realizedPnl += prevPositionValue - currentPositionValue;
            }
            totalValue = currentPositionValue + realizedPnl;
            maxValue = Math.max(maxValue, totalValue);
            minValue = Math.min(minValue, totalValue);
            const pnlPercent = ((totalValue - initialValue) / initialValue) * 100;
            const drawdown = ((maxValue - totalValue) / maxValue) * 100;
            console.log(`\n📊 ${pattern.name}:`);
            console.log(`Price: $${pattern.price.toFixed(3)} | Volume: ${(pattern.volume / 1000).toFixed(1)}K`);
            console.log(`P&L: ${pnlPercent.toFixed(1)}% | DD: ${drawdown.toFixed(1)}%`);
            console.log(`Momentum: ${pattern.momentum.toFixed(1)} | Volume Trend: ${pattern.volumeTrend.toFixed(1)}%`);
        }
        // Calculate final metrics
        const finalPnl = ((totalValue - initialValue) / initialValue) * 100;
        const maxDrawdown = ((maxValue - minValue) / maxValue) * 100;
        const profitFactor = maxDrawdown > 0 ? Math.abs(finalPnl) / maxDrawdown : 0;
        const winRate = finalPnl > 0 ? 100 : 0;
        console.log(`\n📈 Scenario Results:`);
        console.log(`PnL: ${finalPnl.toFixed(1)}%`);
        console.log(`Max Drawdown: ${maxDrawdown.toFixed(1)}%`);
        console.log(`Profit Factor: ${profitFactor.toFixed(2)}`);
        results.push({
            pnl: finalPnl,
            maxDrawdown,
            profitFactor,
            winRate,
        });
    }
    // Calculate overall performance
    const avgPnl = results.reduce((sum, r) => sum + r.pnl, 0) / results.length;
    const avgDrawdown = results.reduce((sum, r) => sum + r.maxDrawdown, 0) / results.length;
    const avgProfitFactor = results.reduce((sum, r) => sum + r.profitFactor, 0) / results.length;
    const overallWinRate = (results.filter((r) => r.pnl > 0).length / results.length) * 100;
    console.log('\n🎯 Overall Performance:');
    console.log('====================');
    console.log(`Average PnL: ${avgPnl.toFixed(1)}%`);
    console.log(`Average Max Drawdown: ${avgDrawdown.toFixed(1)}%`);
    console.log(`Average Profit Factor: ${avgProfitFactor.toFixed(2)}`);
    console.log(`Win Rate: ${overallWinRate.toFixed(1)}%`);
    console.log('\n📊 Scenario Breakdown:');
    scenarios.forEach((scenario, i) => {
        const result = results[i];
        if (result) {
            console.log(`${scenario.name}: ${result.pnl.toFixed(1)}% (DD: ${result.maxDrawdown.toFixed(1)}%)`);
        }
        else {
            console.warn(`No result found for scenario: ${scenario.name}`);
        }
    });
}
runRobustTest().catch(console.error);
//# sourceMappingURL=testTrade.js.map