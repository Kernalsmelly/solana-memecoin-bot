import { validateContract } from './contractValidator';

export function executeTrade(token: string, amount: number) {
    if (!validateContract(token)) {
        console.log('Invalid contract:', token);
        return;
    }
    console.log(`Executing trade for ${amount} of ${token}`);
}

console.log("Order Execution module is initialized.");
