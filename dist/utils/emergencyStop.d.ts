interface EmergencyStopOptions {
    reason: string;
    shutdownProcess?: boolean;
    saveState?: boolean;
    notifyContacts?: boolean;
}
/**
 * Trigger emergency stop for the trading bot
 * @param options Emergency stop options
 */
export declare function triggerEmergencyStop(options: EmergencyStopOptions): Promise<boolean>;
export default triggerEmergencyStop;
//# sourceMappingURL=emergencyStop.d.ts.map