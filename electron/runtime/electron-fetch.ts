import { net } from 'electron';

import type { FetchTransport } from '../../shared/network/fetch-transport';

/** Routes HTTP requests through Chromium's system-aware network stack. */
export const electronFetch: FetchTransport = (input, init) => {
    const normalizedInput = input instanceof URL ? input.toString() : input;
    return net.fetch(normalizedInput, init);
};
