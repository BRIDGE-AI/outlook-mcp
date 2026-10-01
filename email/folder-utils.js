/**
 * Email folder utilities
 */
const { callGraphAPI } = require('../utils/graph-api');

/**
 * Cache of folder information to reduce API calls
 * Format: { userId: { folderName: { id, path } } }
 */
const folderCache = {};

/**
 * Well-known folder names and their endpoints
 */
const WELL_KNOWN_FOLDERS = {
  'all': 'me/messages',
  'inbox': 'me/mailFolders/inbox/messages',
  'drafts': 'me/mailFolders/drafts/messages',
  'sent': 'me/mailFolders/sentItems/messages',
  'sentitems': 'me/mailFolders/sentItems/messages',
  'deleted': 'me/mailFolders/deletedItems/messages',
  'deleteditems': 'me/mailFolders/deletedItems/messages',
  'junk': 'me/mailFolders/junkemail/messages',
  'junkemail': 'me/mailFolders/junkemail/messages',
  'archive': 'me/mailFolders/archive/messages'
};

/**
 * Resolve a folder name to its endpoint path
 * @param {string} accessToken - Access token
 * @param {string} folderName - Folder name to resolve
 * @returns {Promise<string>} - Resolved endpoint path
 */
async function resolveFolderPath(accessToken, folderName) {

  // Default to inbox if no folder specified
  if (!folderName) {
    return WELL_KNOWN_FOLDERS['inbox'];
  }

  // Check if it's a well-known folder (case-insensitive)
  const lowerFolderName = folderName.toLowerCase();
  if (WELL_KNOWN_FOLDERS[lowerFolderName]) {
    console.error(`Using well-known folder path for "${folderName}"`);
    return WELL_KNOWN_FOLDERS[lowerFolderName];
  }

  const matches = await findFolders(accessToken, folderName);
  if (matches.length === 1) {
    const path = `me/mailFolders/${matches[0].id}/messages`;
    console.error(`Resolved folder "${folderName}" to "${matches[0].path}" (${path})`);
    return path;
  }
  if (matches.length === 0) {
    throw new Error(`Folder not found: "${folderName}". Use list-folders to see folders; nested folders as "Parent/Child".`);
  }
  throw new Error(`Folder name "${folderName}" is ambiguous: ${matches.map(f => `"${f.path}"`).join(', ')}. Use the full path.`);
}

/**
 * Find folders by path ("Parent/Child") or by display name, searching all nesting levels
 * @param {string} accessToken - Access token
 * @param {string} folderName - Folder path or display name
 * @returns {Promise<Array>} - Matching folder objects (with `path`)
 */
async function findFolders(accessToken, folderName) {
  const folders = await getAllFolders(accessToken);
  const want = folderName.replace(/^\/+|\/+$/g, '').toLowerCase();
  const byPath = folders.filter(f => f.path.toLowerCase() === want);
  if (byPath.length > 0) {
    return byPath;
  }
  return folders.filter(f => f.displayName.toLowerCase() === want);
}

/**
 * Get the ID of a mail folder by path or name (all nesting levels)
 * @param {string} accessToken - Access token
 * @param {string} folderName - Folder path or display name
 * @returns {Promise<string|null>} - Folder ID or null if not found
 */
async function getFolderIdByName(accessToken, folderName) {
  console.error(`Looking for folder "${folderName}"`);
  const matches = await findFolders(accessToken, folderName);
  if (matches.length === 0) {
    console.error(`No folder found matching "${folderName}"`);
    return null;
  }
  if (matches.length > 1) {
    console.error(`Multiple folders match "${folderName}": ${matches.map(f => f.path).join(', ')} — using the first`);
  }
  return matches[0].id;
}

/**
 * Get all mail folders
 * @param {string} accessToken - Access token
 * @returns {Promise<Array>} - Array of folder objects
 */
async function getAllFolders(accessToken) {
  const select = 'id,displayName,parentFolderId,childFolderCount,totalItemCount,unreadItemCount';
  const out = [];

  async function walk(endpoint, parentPath) {
    const response = await callGraphAPI(accessToken, 'GET', endpoint, null, { $top: 100, $select: select });
    for (const folder of response.value || []) {
      const path = parentPath ? `${parentPath}/${folder.displayName}` : folder.displayName;
      out.push({ ...folder, path });
      if (folder.childFolderCount > 0) {
        await walk(`me/mailFolders/${folder.id}/childFolders`, path);
      }
    }
  }

  await walk('me/mailFolders', '');
  return out;
}

module.exports = {
  WELL_KNOWN_FOLDERS,
  resolveFolderPath,
  findFolders,
  getFolderIdByName,
  getAllFolders
};
