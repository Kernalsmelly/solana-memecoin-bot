import express from 'express';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import logger from './logger';
import { RiskManager } from '../live/riskManager';

interface DashboardOptions {
  port: number;
  riskManager: RiskManager;
  dataDir?: string;
  refreshInterval?: number; // in milliseconds
}

export class PerformanceDashboard {
  private app: express.Express;
  private server: http.Server | null = null;
  private riskManager: RiskManager;
  private port: number;
  private dataDir: string;
  private refreshInterval: number;
  private performanceHistory: any[] = [];

  constructor(options: DashboardOptions) {
    this.app = express();
    this.riskManager = options.riskManager;
    this.port = options.port || 3000;
    this.dataDir = options.dataDir || './data/performance';
    this.refreshInterval = options.refreshInterval || 5000;

    // Ensure data directory exists
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    this.setupRoutes();
  }

  private setupRoutes() {
    // Serve static assets
    this.app.use(express.static(path.join(__dirname, '../../public')));

    // API routes
    this.app.get('/api/metrics', (req, res) => {
      const metrics = this.riskManager.getMetrics();
      res.json(metrics);
    });

    this.app.get('/api/performance', (req, res) => {
      res.json(this.performanceHistory.slice(-100)); // Return last 100 data points
    });

    this.app.get('/api/status', (req, res) => {
      const metrics = this.riskManager.getMetrics();
      const circuitBreakers = metrics.circuitBreakers;
      const emergencyStop = metrics.emergencyStopActive;
      const systemEnabled = metrics.systemEnabled;
      
      res.json({
        status: systemEnabled ? (emergencyStop ? 'EMERGENCY_STOP' : 'RUNNING') : 'DISABLED',
        circuitBreakers,
        lastUpdated: new Date().toISOString()
      });
    });

    // Main dashboard HTML
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, '../../public/dashboard.html'));
    });
  }

  public start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        logger.info(`Performance dashboard running on port ${this.port}`);
        
        // Start metrics collection
        this.startMetricsCollection();
        
        resolve();
      });
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        return resolve();
      }
      
      this.server.close((err) => {
        if (err) {
          return reject(err);
        }
        logger.info('Performance dashboard stopped');
        resolve();
      });
    });
  }

  private startMetricsCollection() {
    // Record metrics periodically
    setInterval(() => {
      try {
        const metrics = this.riskManager.getMetrics();
        const timestamp = new Date().toISOString();
        
        const performancePoint = {
          timestamp,
          ...metrics
        };
        
        this.performanceHistory.push(performancePoint);
        
        // Truncate history to avoid memory issues
        if (this.performanceHistory.length > 1000) {
          this.performanceHistory = this.performanceHistory.slice(-1000);
        }
        
        // Save performance data to disk periodically (every hour)
        const minutes = new Date().getMinutes();
        if (minutes === 0) {
          this.savePerformanceData();
        }
      } catch (error) {
        logger.error('Error collecting metrics', error);
      }
    }, this.refreshInterval);
  }

  private savePerformanceData() {
    try {
      const date = new Date().toISOString().split('T')[0];
      const filePath = path.join(this.dataDir, `performance-${date}.json`);
      
      fs.writeFileSync(filePath, JSON.stringify(this.performanceHistory, null, 2));
      logger.debug('Performance data saved to disk', { file: filePath });
    } catch (error) {
      logger.error('Error saving performance data', error);
    }
  }
}

export default PerformanceDashboard;
