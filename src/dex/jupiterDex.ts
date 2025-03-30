import { Connection, PublicKey, Transaction, Keypair, sendAndConfirmTransaction } from '@solana/web3.js';
import { Jupiter, RouteInfo, TOKEN_LIST_URL, SwapMode, MarketInfo } from '@jup-ag/core';
import { TokenInfo } from '@solana/spl-token-registry';
import JSBI from 'jsbi';
import Decimal from 'decimal.js';
import logger from '../utils/logger';
import { RiskManager, CircuitBreakerReason } from '../live/riskManager';

export interface JupiterQuote {
    route: RouteInfo;
    outAmount: number;
    price: number;
    priceImpactPct: number;
}

export interface JupiterSwapResult {
    success: boolean;
    signature?: string;
    error?: string;
    outAmount?: number;
    price?: number;
    errorType?: string;
}

export interface RiskParams {
    maxSlippageBps: number;
    maxPriceImpactPct: number;
    minLiquidityUsd: number;
    maxPositionSizeUsd: number;
    maxPortfolioExposure: number;
}

const DEFAULT_RISK_PARAMS: RiskParams = {
    maxSlippageBps: 100, // 1%
    maxPriceImpactPct: 5, // 5%
    minLiquidityUsd: 50000, // $50k
    maxPositionSizeUsd: 1000, // $1k
    maxPortfolioExposure: 0.1 // 10%
};

// Error types for better error handling
export enum JupiterErrorType {
    INITIALIZATION_ERROR = 'INITIALIZATION_ERROR',
    INSUFFICIENT_LIQUIDITY = 'INSUFFICIENT_LIQUIDITY',
    INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
    HIGH_PRICE_IMPACT = 'HIGH_PRICE_IMPACT',
    NO_ROUTE_FOUND = 'NO_ROUTE_FOUND',
    TRANSACTION_ERROR = 'TRANSACTION_ERROR',
    CIRCUIT_BREAKER_ACTIVE = 'CIRCUIT_BREAKER_ACTIVE',
    EMERGENCY_STOP_ACTIVE = 'EMERGENCY_STOP_ACTIVE',
    SYSTEM_DISABLED = 'SYSTEM_DISABLED',
    RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
    UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

export class JupiterError extends Error {
    constructor(
        public type: JupiterErrorType,
        message: string,
        public details?: any
    ) {
        super(message);
        this.name = 'JupiterError';
    }
}

export class JupiterDex {
    private jupiter: Jupiter | null = null;
    private connection: Connection;
    private wallet: Keypair;
    private tokenMap: Map<string, { address: string; decimals: number }>;
    private riskParams: RiskParams;
    private retryAttempts: number = 3;
    private retryDelayMs: number = 1000;
    private riskManager: RiskManager | null = null;
    private lastApiCallTimestamp: number = 0;
    private rateLimitWindowMs: number = 500; // 500ms between API calls

    constructor(
        connection: Connection, 
        wallet: Keypair,
        riskParams: Partial<RiskParams> = {},
        riskManager?: RiskManager
    ) {
        this.connection = connection;
        this.wallet = wallet;
        this.tokenMap = new Map();
        this.riskParams = { ...DEFAULT_RISK_PARAMS, ...riskParams };
        this.riskManager = riskManager || null;
    }

    public async initialize(): Promise<void> {
        try {
            // Load Jupiter instance
            this.jupiter = await Jupiter.load({
                connection: this.connection,
                cluster: 'mainnet-beta',
                user: this.wallet.publicKey
            });

            // Load token list
            const response = await fetch(TOKEN_LIST_URL.toString());
            const tokens = await response.json();
            
            // Initialize token map
            tokens.forEach((token: TokenInfo) => {
                this.tokenMap.set(token.symbol, {
                    address: token.address,
                    decimals: token.decimals
                });
            });

            logger.info('Jupiter DEX initialized successfully');
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            logger.error('Failed to initialize Jupiter DEX:', msg);
            throw new JupiterError(JupiterErrorType.INITIALIZATION_ERROR, msg);
        }
    }

    private async validateLiquidity(route: RouteInfo): Promise<boolean> {
        try {
            // Get market info from route
            const marketInfos = route.marketInfos;
            if (!marketInfos || marketInfos.length === 0) {
                return false;
            }

            // Check liquidity of each market in the route
            for (const market of marketInfos) {
                const liquidity = Number((market as MarketInfo).lpFee?.amount || 0);
                if (liquidity < this.riskParams.minLiquidityUsd) {
                    const details = {
                        marketInfo: market,
                        liquidity,
                        required: this.riskParams.minLiquidityUsd
                    };
                    logger.warn('Insufficient liquidity', details);
                    throw new JupiterError(
                        JupiterErrorType.INSUFFICIENT_LIQUIDITY,
                        'Insufficient liquidity in market',
                        details
                    );
                }
            }

            return true;
        } catch (error) {
            if (error instanceof JupiterError) {
                throw error;
            }
            const msg = error instanceof Error ? error.message : 'Unknown error';
            logger.error('Failed to validate liquidity:', msg);
            throw new JupiterError(JupiterErrorType.UNKNOWN_ERROR, msg);
        }
    }

    private async validatePositionSize(amountUsd: number, tokenAddress: string, currentPrice: number): Promise<boolean> {
        try {
            // Check if amount exceeds max position size
            if (amountUsd > this.riskParams.maxPositionSizeUsd) {
                const details = {
                    amount: amountUsd,
                    maxSize: this.riskParams.maxPositionSizeUsd
                };
                logger.warn('Position size too large', details);
                throw new JupiterError(
                    JupiterErrorType.INSUFFICIENT_BALANCE,
                    'Position size exceeds maximum allowed',
                    details
                );
            }

            // If risk manager is available, use it for additional checks
            if (this.riskManager) {
                const tokenSymbol = await this.getTokenSymbol(tokenAddress);
                const canOpen = this.riskManager.canOpenPosition(amountUsd, tokenSymbol || tokenAddress, currentPrice);
                
                if (!canOpen) {
                    // Check what circuit breaker is active if any
                    const metrics = this.riskManager.getMetrics();
                    
                    if (metrics.emergencyStopActive) {
                        throw new JupiterError(
                            JupiterErrorType.EMERGENCY_STOP_ACTIVE,
                            'Emergency stop is active'
                        );
                    }
                    
                    if (!metrics.systemEnabled) {
                        throw new JupiterError(
                            JupiterErrorType.SYSTEM_DISABLED,
                            'Trading system is disabled'
                        );
                    }
                    
                    // Check which circuit breaker is active
                    if (metrics.circuitBreakers) {
                        for (const [reason, active] of Object.entries(metrics.circuitBreakers)) {
                            if (active) {
                                throw new JupiterError(
                                    JupiterErrorType.CIRCUIT_BREAKER_ACTIVE,
                                    `Circuit breaker active: ${reason}`
                                );
                            }
                        }
                    }
                    
                    throw new JupiterError(
                        JupiterErrorType.CIRCUIT_BREAKER_ACTIVE,
                        'Position rejected by risk manager'
                    );
                }
            } else {
                // Get total portfolio value
                const portfolioValue = await this.getPortfolioValue();
                const exposure = amountUsd / portfolioValue;
    
                // Check portfolio exposure
                if (exposure > this.riskParams.maxPortfolioExposure) {
                    const details = {
                        exposure,
                        maxExposure: this.riskParams.maxPortfolioExposure
                    };
                    logger.warn('Portfolio exposure too high', details);
                    throw new JupiterError(
                        JupiterErrorType.INSUFFICIENT_BALANCE,
                        'Trade would exceed maximum portfolio exposure',
                        details
                    );
                }
            }

            return true;
        } catch (error) {
            if (error instanceof JupiterError) {
                throw error;
            }
            const msg = error instanceof Error ? error.message : 'Unknown error';
            logger.error('Failed to validate position size:', msg);
            throw new JupiterError(JupiterErrorType.UNKNOWN_ERROR, msg);
        }
    }

    private async getPortfolioValue(): Promise<number> {
        // For now, just return USDC balance
        // TODO: Implement full portfolio value calculation
        const usdcBalance = await this.getTokenBalance('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
        return usdcBalance;
    }
    
    private async getTokenSymbol(tokenAddress: string): Promise<string | null> {
        try {
            for (const [symbol, data] of this.tokenMap.entries()) {
                if (data.address === tokenAddress) {
                    return symbol;
                }
            }
            return null;
        } catch (error) {
            logger.warn('Failed to get token symbol:', error);
            return null;
        }
    }
    
    private async checkRateLimit(): Promise<void> {
        const now = Date.now();
        const timeSinceLastCall = now - this.lastApiCallTimestamp;
        
        if (timeSinceLastCall < this.rateLimitWindowMs) {
            const waitTime = this.rateLimitWindowMs - timeSinceLastCall;
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        this.lastApiCallTimestamp = Date.now();
    }

    public async getQuote(
        inputMint: string,
        outputMint: string,
        amount: number,
        slippageBps: number = this.riskParams.maxSlippageBps
    ): Promise<JupiterQuote> {
        try {
            // Apply rate limiting
            await this.checkRateLimit();
            
            if (!this.jupiter) {
                throw new JupiterError(
                    JupiterErrorType.INITIALIZATION_ERROR,
                    'Jupiter not initialized'
                );
            }
            
            // Record execution start time if risk manager is available
            let executionId: string | undefined;
            if (this.riskManager) {
                const tokenSymbol = await this.getTokenSymbol(outputMint) || 'unknown';
                executionId = this.riskManager.startTradeExecution(tokenSymbol);
            }
            
            try {
                const routes = await this.jupiter.computeRoutes({
                    inputMint: new PublicKey(inputMint),
                    outputMint: new PublicKey(outputMint),
                    amount: JSBI.BigInt(Math.floor(amount * 1e6)), // Convert to USDC decimals
                    slippageBps,
                    onlyDirectRoutes: false,
                    swapMode: SwapMode.ExactIn
                });
    
                if (!routes.routesInfos || routes.routesInfos.length === 0) {
                    throw new JupiterError(
                        JupiterErrorType.NO_ROUTE_FOUND,
                        'No routes found for swap',
                        { inputMint, outputMint, amount }
                    );
                }
    
                // Get best route
                const bestRoute = routes.routesInfos[0];
                
                // Update price in risk manager if available
                if (this.riskManager) {
                    const tokenSymbol = await this.getTokenSymbol(outputMint) || outputMint;
                    const price = Number(bestRoute.outAmount) / amount;
                    this.riskManager.updatePrice(tokenSymbol, price);
                }
                
                // Validate liquidity
                await this.validateLiquidity(bestRoute);
    
                // Validate position size with risk manager
                const outputPrice = Number(bestRoute.outAmount) / amount;
                await this.validatePositionSize(amount, outputMint, outputPrice);
                
                // Record successful execution
                if (this.riskManager && executionId) {
                    this.riskManager.completeTradeExecution(executionId, true);
                }
                
                return {
                    route: bestRoute,
                    outAmount: Number(bestRoute.outAmount),
                    price: Number(bestRoute.outAmount) / amount,
                    priceImpactPct: Number(bestRoute.priceImpactPct)
                };
            } catch (error) {
                // Record failed execution
                if (this.riskManager && executionId) {
                    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                    this.riskManager.completeTradeExecution(executionId, false, errorMsg);
                }
                throw error;
            }
        } catch (error) {
            if (error instanceof JupiterError) {
                throw error;
            }
            const msg = error instanceof Error ? error.message : 'Unknown error';
            logger.error('Failed to get quote:', msg);
            throw new JupiterError(JupiterErrorType.UNKNOWN_ERROR, msg);
        }
    }

    private async executeWithRetry<T>(
        operation: () => Promise<T>,
        attempt: number = 1
    ): Promise<T> {
        try {
            return await operation();
        } catch (error) {
            if (attempt >= this.retryAttempts) {
                throw error;
            }

            const msg = error instanceof Error ? error.message : 'Unknown error';
            logger.warn(`Retry attempt ${attempt} of ${this.retryAttempts}`, { error: msg });

            await new Promise(resolve => setTimeout(resolve, this.retryDelayMs * attempt));
            return this.executeWithRetry(operation, attempt + 1);
        }
    }

    public async executeSwap(
        inputMint: string,
        outputMint: string,
        amount: number,
        maxSlippageBps: number = this.riskParams.maxSlippageBps
    ): Promise<JupiterSwapResult> {
        try {
            // Apply rate limiting
            await this.checkRateLimit();
            
            if (!this.jupiter) {
                throw new JupiterError(
                    JupiterErrorType.INITIALIZATION_ERROR,
                    'Jupiter not initialized'
                );
            }
            
            // Record execution start time if risk manager is available
            let executionId: string | undefined;
            if (this.riskManager) {
                const tokenSymbol = await this.getTokenSymbol(outputMint) || 'unknown';
                executionId = this.riskManager.startTradeExecution(tokenSymbol);
            }

            try {
                // Get quote first
                const quote = await this.getQuote(inputMint, outputMint, amount, maxSlippageBps);
    
                // Check price impact
                if (quote.priceImpactPct > this.riskParams.maxPriceImpactPct) {
                    throw new JupiterError(
                        JupiterErrorType.HIGH_PRICE_IMPACT,
                        `Price impact too high: ${quote.priceImpactPct}%`,
                        { priceImpact: quote.priceImpactPct, maxAllowed: this.riskParams.maxPriceImpactPct }
                    );
                }
    
                // Execute swap with retry
                const result = await this.executeWithRetry(async () => {
                    const swapResult = await this.jupiter!.exchange({
                        routeInfo: quote.route
                    });
    
                    // Sign and send transaction
                    const { swapTransaction } = swapResult;
                    const signature = await sendAndConfirmTransaction(
                        this.connection,
                        swapTransaction as Transaction,
                        [this.wallet],
                        { commitment: 'confirmed' }
                    );
    
                    // Record trade in risk manager if available
                    if (this.riskManager) {
                        // For simplicity, we're assuming this is a buy, adjust as needed
                        this.riskManager.incrementActivePositions();
                    }
    
                    return {
                        success: true,
                        signature,
                        outAmount: quote.outAmount,
                        price: quote.price
                    };
                });
                
                // Record successful execution
                if (this.riskManager && executionId) {
                    this.riskManager.completeTradeExecution(executionId, true);
                }
    
                return result;
            } catch (error) {
                // Record failed execution
                if (this.riskManager && executionId) {
                    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                    this.riskManager.completeTradeExecution(executionId, false, errorMsg);
                }
                throw error;
            }
        } catch (error) {
            if (error instanceof JupiterError) {
                return {
                    success: false,
                    error: `${error.type}: ${error.message}`,
                    errorType: error.type
                };
            }
            const msg = error instanceof Error ? error.message : 'Unknown error';
            logger.error('Swap failed:', msg);
            return {
                success: false,
                error: `${JupiterErrorType.UNKNOWN_ERROR}: ${msg}`,
                errorType: JupiterErrorType.UNKNOWN_ERROR
            };
        }
    }

    public async getTokenBalance(tokenMint: string): Promise<number> {
        try {
            if (!this.jupiter) {
                throw new JupiterError(
                    JupiterErrorType.INITIALIZATION_ERROR,
                    'Jupiter not initialized'
                );
            }

            const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
                this.wallet.publicKey,
                { mint: new PublicKey(tokenMint) }
            );
            
            const account = tokenAccounts.value[0];
            if (!account) {
                return 0;
            }

            const token = Array.from(this.tokenMap.values()).find(t => t.address === tokenMint);
            if (!token) {
                throw new JupiterError(
                    JupiterErrorType.UNKNOWN_ERROR,
                    'Token not found in token list'
                );
            }

            return Number(account.account.data.parsed.info.tokenAmount.amount) / Math.pow(10, token.decimals);

        } catch (error) {
            if (error instanceof JupiterError) {
                throw error;
            }
            const msg = error instanceof Error ? error.message : 'Unknown error';
            logger.error('Failed to get token balance:', msg);
            throw new JupiterError(JupiterErrorType.UNKNOWN_ERROR, msg);
        }
    }
    
    // Set or update the risk manager
    public setRiskManager(riskManager: RiskManager) {
        this.riskManager = riskManager;
        logger.info('Risk manager set for Jupiter DEX');
    }
}
