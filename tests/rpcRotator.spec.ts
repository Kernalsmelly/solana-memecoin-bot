import { describe, it, expect } from 'vitest';
import { RpcRotator } from '../src/integrations/data-hub/RpcRotator';

const urls = ['http://fake1/', 'http://fake2/', 'http://fake3/'];

describe('RpcRotator', () => {
  it('rotates endpoints and ejects after 3 fails', () => {
    const rotator = new RpcRotator(urls);
    const c1 = rotator.getConnection();
    expect(c1._rpcEndpoint).toBe('http://fake1/');
    rotator.reportTimeout('http://fake1/');
    rotator.reportTimeout('http://fake1/');
    rotator.reportTimeout('http://fake1/');
    // After 3 fails, fake1 is on cooldown, should rotate to fake2
    const c2 = rotator.getConnection();
    expect(c2._rpcEndpoint).toBe('http://fake2/');
  });
});
