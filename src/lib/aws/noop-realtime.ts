/** No-op realtime so NotificationBell / eMAR don't crash when PostgREST realtime is absent. */

export function createNoopChannel(_name?: string) {
  const ch = {
    on() {
      return ch;
    },
    subscribe() {
      return ch;
    },
    unsubscribe() {
      return ch;
    },
  };
  return ch;
}

export function noopRemoveChannel(_ch?: unknown) {
  return undefined;
}
