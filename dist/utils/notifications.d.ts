export type AlertLevel = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
interface AlertOptions {
    useDiscord?: boolean;
    useTelegram?: boolean;
    includeTimestamp?: boolean;
}
/**
 * Send an alert through configured notification channels
 * @param message Alert message
 * @param level Alert level (INFO, WARNING, ERROR, CRITICAL)
 * @param options Notification options
 */
export declare function sendAlert(message: string, level?: AlertLevel, options?: AlertOptions): Promise<boolean>;
export default sendAlert;
//# sourceMappingURL=notifications.d.ts.map