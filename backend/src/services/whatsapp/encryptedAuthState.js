const fs = require('fs');
const path = require('path');
const { initAuthCreds, BufferJSON, proto } = require('@whiskeysockets/baileys');
const sessionCrypto = require('./sessionCrypto');

/**
 * Custom Multi-File Auth State adapter with AES-256-GCM authenticated encryption at rest.
 * Ensures zero plaintext credentials exist on disk.
 *
 * @param {string} sessionDir Directory to store encrypted session files
 * @param {Buffer} [customKey] Optional derived 32-byte encryption key
 */
async function useEncryptedAuthState(sessionDir, customKey = null) {
  // Ensure session directory exists with restricted permissions
  fs.mkdirSync(sessionDir, { recursive: true, mode: 0o700 });

  const encKey = customKey || sessionCrypto.getEncryptionKey();

  const sanitizeFilename = (name) => {
    return name.replace(/\//g, '__').replace(/:/g, '-').replace(/[/\\?%*:|"<>]/g, '_');
  };

  const getFilePath = (file) => {
    return path.join(sessionDir, `${sanitizeFilename(file)}.enc`);
  };

  const writeData = async (file, data) => {
    try {
      const filePath = getFilePath(file);
      const jsonString = JSON.stringify(data, BufferJSON.replacer);
      const encryptedBuffer = sessionCrypto.encrypt(jsonString, encKey);
      await fs.promises.writeFile(filePath, encryptedBuffer, { mode: 0o600 });
    } catch (err) {
      console.error(`[EncryptedAuthState] Failed to write encrypted state for ${file}:`, err.message);
      throw err;
    }
  };

  const readData = async (file) => {
    try {
      const filePath = getFilePath(file);
      if (!fs.existsSync(filePath)) {
        return null;
      }
      const encryptedBuffer = await fs.promises.readFile(filePath);
      const decryptedBuffer = sessionCrypto.decrypt(encryptedBuffer, encKey);
      return JSON.parse(decryptedBuffer.toString('utf8'), BufferJSON.reviver);
    } catch (err) {
      console.error(`[EncryptedAuthState] Failed to read/decrypt state for ${file}:`, err.message);
      return null;
    }
  };

  const removeData = async (file) => {
    try {
      const filePath = getFilePath(file);
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
    } catch (err) {
      console.error(`[EncryptedAuthState] Failed to remove state file ${file}:`, err.message);
    }
  };

  const clearSession = async () => {
    try {
      if (fs.existsSync(sessionDir)) {
        await fs.promises.rm(sessionDir, { recursive: true, force: true });
      }
    } catch (err) {
      console.error(`[EncryptedAuthState] Failed to clear session directory ${sessionDir}:`, err.message);
    }
  };

  // Initialize or restore credentials
  let creds = await readData('creds');
  if (!creds) {
    creds = initAuthCreds();
    await writeData('creds', creds);
  }

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}`);
              if (type === 'app-state-sync-key' && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              if (value) {
                data[id] = value;
              }
            })
          );
          return data;
        },
        set: async (data) => {
          const tasks = [];
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const file = `${category}-${id}`;
              tasks.push(value ? writeData(file, value) : removeData(file));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: () => writeData('creds', creds),
    clearSession,
  };
}

module.exports = {
  useEncryptedAuthState,
};

