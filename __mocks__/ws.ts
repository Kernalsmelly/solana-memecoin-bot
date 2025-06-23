export async function* fakeWsEvents() {
  yield { type: 'buy', amount: 100, price: 0.01, token: 'So11111111111111111111111111111111111111112' };
  yield { type: 'sell', amount: 50, price: 0.012, token: 'So11111111111111111111111111111111111111112' };
}
