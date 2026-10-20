export function enquiryFields(input) {
  const source = input && typeof input === 'object' ? input : {};
  const text = (key, max) => typeof source[key] === 'string'
    ? source[key].replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) || 'Not provided'
    : 'Not provided';
  return {name: text('name', 60), contact: text('contact', 100), service: text('service', 160), location: text('location', 100), time: text('preferred_time', 100)};
}

export function observeSession(session, observers, isCurrent) {
  // shortcut: observe v0.20.0's session callbacks until public lifecycle events exist; retain the widget UI if this contract changes.
  const callbacks = session?.options;
  if (!callbacks || typeof session.endSession !== 'function') return false;
  for (const [name, observer] of Object.entries(observers)) {
    const original = callbacks[name];
    callbacks[name] = function (...args) {
      try {
        return original?.apply(this, args);
      } finally {
        if (isCurrent()) observer(...args);
        else if (name === 'onConnect') Promise.resolve(session.endSession()).catch(() => {});
      }
    };
  }
  return true;
}
