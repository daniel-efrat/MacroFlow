import { createClient } from './supabase-js.js';

const storageAdapter = {
  getItem: (key) => {
    return new Promise((resolve) => {
      chrome.storage.local.get([key], (result) => {
        resolve(result[key] || null);
      });
    });
  },
  setItem: (key, value) => {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, () => {
        resolve();
      });
    });
  },
  removeItem: (key) => {
    return new Promise((resolve) => {
      chrome.storage.local.remove([key], () => {
        resolve();
      });
    });
  }
};

const supabaseUrl = typeof process !== 'undefined' ? process.env.SUPABASE_URL : 'YOUR_SUPABASE_URL_HERE';
const supabaseKey = typeof process !== 'undefined' ? process.env.SUPABASE_KEY : 'YOUR_SUPABASE_KEY_HERE';

const localMutexes = {};

async function acquireLocalMutex(name, acquire) {
  if (!localMutexes[name]) {
    localMutexes[name] = Promise.resolve();
  }
  
  let releaseMutex;
  const nextMutex = new Promise(resolve => { releaseMutex = resolve; });
  const waitMutex = localMutexes[name];
  localMutexes[name] = waitMutex.then(() => nextMutex);
  
  await waitMutex;
  try {
    return await acquire();
  } finally {
    releaseMutex();
  }
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: storageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    lock: async (name, ...args) => {
      const acquire = typeof args[0] === 'function' ? args[0] : args[1];
      return await acquireLocalMutex(name, acquire);
    }
  }
});
