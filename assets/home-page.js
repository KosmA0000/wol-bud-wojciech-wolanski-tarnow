// Deprecated legacy home-content.json loader replaced by static HTML publishing from CMS.
export const ready = Promise.resolve(null);

if (typeof window !== 'undefined') {
  window.wolbudHome = { ready };
}

export default { ready };
