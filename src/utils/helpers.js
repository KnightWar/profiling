/**
 * Shared Utilities
 */

/**
 * Sanitize a string for use as a filename.
 */
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s-]+/g, '_')
    .trim();
}

/**
 * Format a date for display.
 */
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleString('en-IN', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

module.exports = { slugify, formatDate };
