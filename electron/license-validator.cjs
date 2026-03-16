/**
 * Валидатор лицензий для Electron/Node.js приложений.
 * Ed25519, офлайн-проверка по публичному ключу.
 * Нет внешних зависимостей — только встроенный crypto модуль.
 *
 * Использование:
 *
 *   const { LicenseValidator } = require('./license-validator');
 *
 *   // 1. Вставь свой публичный ключ (из keys/public.key)
 *   const validator = new LicenseValidator('MCowBQYDK2VwAyEA...');
 *
 *   // 2. Проверь лицензию
 *   const result = await validator.validateFile('path/to/license.key');
 *   if (result.valid) {
 *       console.log('Лицензия OK:', result.licensee);
 *   }
 *
 *   // 3. Проверка конкретных фич
 *   if (result.hasFeature('export')) { ... }
 */

const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

class LicenseValidator {
    /**
     * @param {string} publicKeyBase64 - публичный ключ в формате Base64 (из файла public.key)
     */
    constructor(publicKeyBase64) {
        // Формируем PEM из Base64
        this.publicKey = crypto.createPublicKey({
            key: Buffer.from(publicKeyBase64.trim(), 'base64'),
            format: 'der',
            type: 'spki'
        });
    }

    /**
     * Валидация файла лицензии.
     * @param {string} licensePath - путь к файлу лицензии
     * @returns {Promise<LicenseResult>}
     */
    async validateFile(licensePath) {
        try {
            const content = await fs.readFile(licensePath, 'utf-8');
            return this.validateContent(content);
        } catch (err) {
            return LicenseResult.invalid(`Не удалось прочитать файл: ${err.message}`);
        }
    }

    /**
     * Валидация содержимого лицензии (строка).
     * @param {string} licenseContent - содержимое файла лицензии
     * @returns {LicenseResult}
     */
    validateContent(licenseContent) {
        try {
            const parts = licenseContent.trim().split('.');
            if (parts.length !== 2) {
                return LicenseResult.invalid('Неверный формат лицензии');
            }

            const [payloadB64, signatureB64] = parts;

            // Декодируем
            const payloadBuffer = Buffer.from(payloadB64, 'base64url');
            const signatureBuffer = Buffer.from(signatureB64, 'base64url');

            // Проверяем подпись Ed25519
            const isValid = crypto.verify(
                null, // Ed25519 не использует отдельный алгоритм хеширования
                payloadBuffer,
                this.publicKey,
                signatureBuffer
            );

            if (!isValid) {
                return LicenseResult.invalid('Подпись недействительна');
            }

            // Парсим payload
            const data = JSON.parse(payloadBuffer.toString('utf-8'));

            // Проверяем срок действия
            if (data.expiresAt) {
                const expiryDate = new Date(data.expiresAt + 'T23:59:59');
                if (new Date() > expiryDate) {
                    return LicenseResult.expired(data);
                }
            }

            return LicenseResult.valid(data);

        } catch (err) {
            return LicenseResult.invalid(`Ошибка валидации: ${err.message}`);
        }
    }
}

class LicenseResult {
    constructor(status, data, error) {
        this.status = status;       // 'valid' | 'invalid' | 'expired'
        this.data = data || {};
        this.error = error || null;
    }

    /** @returns {boolean} */
    get valid() { return this.status === 'valid'; }

    /** @returns {boolean} */
    get expired() { return this.status === 'expired'; }

    /** @returns {string} */
    get id() { return this.data.id || ''; }

    /** @returns {string} */
    get licensee() { return this.data.licensee || ''; }

    /** @returns {string} */
    get email() { return this.data.email || ''; }

    /** @returns {string} */
    get company() { return this.data.company || ''; }

    /** @returns {string} */
    get type() { return this.data.type || ''; }

    /** @returns {string} */
    get issuedAt() { return this.data.issuedAt || ''; }

    /** @returns {string|null} */
    get expiresAt() { return this.data.expiresAt || null; }

    /** @returns {string[]} */
    get features() { return this.data.features || []; }

    /** @returns {number} */
    get maxDevices() { return this.data.maxDevices || 1; }

    /**
     * Проверяет наличие фичи в лицензии.
     * @param {string} feature
     * @returns {boolean}
     */
    hasFeature(feature) {
        return this.features.includes(feature);
    }

    static valid(data) { return new LicenseResult('valid', data, null); }
    static invalid(error) { return new LicenseResult('invalid', null, error); }
    static expired(data) { return new LicenseResult('expired', data, `Лицензия истекла ${data.expiresAt}`); }
}

module.exports = { LicenseValidator, LicenseResult };
