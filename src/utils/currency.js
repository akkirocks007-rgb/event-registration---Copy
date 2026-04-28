/**
 * Supported currencies with display metadata.
 */
export const CURRENCIES = [
  { code: 'USD', symbol: '$',  name: 'US Dollar',          locale: 'en-US' },
  { code: 'EUR', symbol: '€',  name: 'Euro',               locale: 'de-DE' },
  { code: 'GBP', symbol: '£',  name: 'British Pound',      locale: 'en-GB' },
  { code: 'INR', symbol: '₹',  name: 'Indian Rupee',       locale: 'en-IN' },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham',        locale: 'ar-AE' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar',   locale: 'en-SG' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar',  locale: 'en-AU' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar',    locale: 'en-CA' },
  { code: 'JPY', symbol: '¥',  name: 'Japanese Yen',       locale: 'ja-JP' },
];

/**
 * Formats a numeric amount as a localised currency string.
 *
 * @param {number} amount
 * @param {string} currencyCode - ISO 4217 code, e.g. 'USD'
 * @returns {string} e.g. "$1,234.56"
 */
export const formatAmount = (amount, currencyCode) => {
  const currency = CURRENCIES.find(c => c.code === currencyCode);
  const locale = currency?.locale ?? 'en-US';
  const code = currency?.code ?? currencyCode;

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: code === 'JPY' ? 0 : 2,
      maximumFractionDigits: code === 'JPY' ? 0 : 2,
    }).format(amount);
  } catch {
    // Fallback for unknown currency codes
    return `${getCurrencySymbol(currencyCode)}${Number(amount).toFixed(2)}`;
  }
};

/**
 * Returns the symbol for a given currency code.
 *
 * @param {string} currencyCode
 * @returns {string} e.g. '$'
 */
export const getCurrencySymbol = (currencyCode) => {
  return CURRENCIES.find(c => c.code === currencyCode)?.symbol ?? currencyCode;
};
