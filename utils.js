/**
 * @typedef {Object} Response
 * @property {Object | null} data
 * @property {Error | null} error
 */


/**
 * @param {Promise} Promise
 * @returns {Promise<Response>}
 */
async function tryCatch(Promise) {
  try {
    const data = await Promise;
    return { data, error: null };
  } catch (error) {
    console.error('Error:', error);
    return { data: null, error };
  }
}
