/**
 * Sanitizes input to prevent malicious content.
 * Removes leading/trailing spaces and escapes special characters.
 * @param {string} input - The input string to sanitize.
 * @returns {string} - The sanitized string.
 */
export function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  return input.trim().replace(/[<>]/g, '');
}

/**
 * Validates login input fields such as email and password.
 * Ensures email and password meet basic format and length requirements.
 * @param {string} email - The email to validate.
 * @param {string} password - The password to validate.
 * @returns {boolean} - True if valid, false otherwise.
 */
export function validateLoginInput(email, password) {
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;
  const minPasswordLength = 8;
  const maxPasswordLength = 100;

  if (!email || !password) return false;
  if (!emailRegex.test(email)) return false;
  if (password.length < minPasswordLength || password.length > maxPasswordLength) return false;

  return true;
}

/**
 * Checks if a login request is a duplicate in the current batch.
 * Compares email, deviceId, and connectionId to detect duplicates.
 * @param {Array} batch - The current batch of login requests.
 * @param {Object} loginData - The login data to check for duplicates.
 * @returns {boolean} - True if duplicate, false otherwise.
 */
export function isDuplicateInBatch(batch, loginData) {
  return batch.some(
    (item) =>
      item.data.email === loginData.email &&
      item.data.deviceId === loginData.deviceId &&
      item.data.connectionId === loginData.connectionId
  );
}