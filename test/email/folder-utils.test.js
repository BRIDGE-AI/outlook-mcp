const {
  WELL_KNOWN_FOLDERS,
  resolveFolderPath,
  getFolderIdByName
} = require('../../email/folder-utils');
const { callGraphAPI } = require('../../utils/graph-api');

jest.mock('../../utils/graph-api');

describe('resolveFolderPath', () => {
  const mockAccessToken = 'dummy_access_token';

  beforeEach(() => {
    callGraphAPI.mockClear();
    // Mock console.error to avoid cluttering test output
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  describe('well-known folders', () => {
    test('should return inbox endpoint when no folder name is provided', async () => {
      const result = await resolveFolderPath(mockAccessToken, null);
      expect(result).toBe(WELL_KNOWN_FOLDERS['inbox']);
      expect(callGraphAPI).not.toHaveBeenCalled();
    });

    test('should return inbox endpoint when undefined folder name is provided', async () => {
      const result = await resolveFolderPath(mockAccessToken, undefined);
      expect(result).toBe(WELL_KNOWN_FOLDERS['inbox']);
      expect(callGraphAPI).not.toHaveBeenCalled();
    });

    test('should return inbox endpoint when empty string is provided', async () => {
      const result = await resolveFolderPath(mockAccessToken, '');
      expect(result).toBe(WELL_KNOWN_FOLDERS['inbox']);
      expect(callGraphAPI).not.toHaveBeenCalled();
    });

    test('should return correct endpoint for well-known folders', async () => {
      const result = await resolveFolderPath(mockAccessToken, 'drafts');
      expect(result).toBe(WELL_KNOWN_FOLDERS['drafts']);
      expect(callGraphAPI).not.toHaveBeenCalled();
    });

    test('should handle case-insensitive well-known folder names', async () => {
      const result1 = await resolveFolderPath(mockAccessToken, 'INBOX');
      const result2 = await resolveFolderPath(mockAccessToken, 'Drafts');
      const result3 = await resolveFolderPath(mockAccessToken, 'SENT');

      expect(result1).toBe(WELL_KNOWN_FOLDERS['inbox']);
      expect(result2).toBe(WELL_KNOWN_FOLDERS['drafts']);
      expect(result3).toBe(WELL_KNOWN_FOLDERS['sent']);
      expect(callGraphAPI).not.toHaveBeenCalled();
    });
  });

  describe('custom folders', () => {
    const tree = {
      'me/mailFolders': [
        { id: 'inbox-id', displayName: 'Inbox', childFolderCount: 2 },
        { id: 'archive-id', displayName: 'Archive', childFolderCount: 1 }
      ],
      'me/mailFolders/inbox-id/childFolders': [
        { id: 'proj-id', displayName: 'ProjectAlpha', childFolderCount: 0 },
        { id: 'dup-inbox-id', displayName: 'Dup', childFolderCount: 0 }
      ],
      'me/mailFolders/archive-id/childFolders': [
        { id: 'dup-archive-id', displayName: 'Dup', childFolderCount: 0 }
      ]
    };

    beforeEach(() => {
      callGraphAPI.mockImplementation(async (token, method, endpoint) => ({ value: tree[endpoint] || [] }));
    });

    test('should resolve a nested folder by display name (case-insensitive)', async () => {
      const result = await resolveFolderPath(mockAccessToken, 'projectalpha');
      expect(result).toBe('me/mailFolders/proj-id/messages');
    });

    test('should resolve a nested folder by full path', async () => {
      const result = await resolveFolderPath(mockAccessToken, 'Archive/Dup');
      expect(result).toBe('me/mailFolders/dup-archive-id/messages');
    });

    test('should throw when folder is not found instead of falling back to inbox', async () => {
      await expect(resolveFolderPath(mockAccessToken, 'NonExistentFolder')).rejects.toThrow('Folder not found');
    });

    test('should throw when a display name is ambiguous', async () => {
      await expect(resolveFolderPath(mockAccessToken, 'Dup')).rejects.toThrow('ambiguous');
    });

    test('should propagate API errors', async () => {
      callGraphAPI.mockReset();
      callGraphAPI.mockRejectedValueOnce(new Error('API Error'));
      await expect(resolveFolderPath(mockAccessToken, 'CustomFolder')).rejects.toThrow('API Error');
    });
  });
});

describe('getFolderIdByName', () => {
  const mockAccessToken = 'dummy_access_token';

  beforeEach(() => {
    callGraphAPI.mockReset();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    callGraphAPI.mockImplementation(async (token, method, endpoint) => ({
      value: endpoint === 'me/mailFolders'
        ? [{ id: 'parent-id', displayName: 'Parent', childFolderCount: 1 }]
        : [{ id: 'child-id', displayName: 'TestFolder', childFolderCount: 0 }]
    }));
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  test('should return nested folder ID by name', async () => {
    expect(await getFolderIdByName(mockAccessToken, 'testfolder')).toBe('child-id');
  });

  test('should return nested folder ID by path', async () => {
    expect(await getFolderIdByName(mockAccessToken, 'Parent/TestFolder')).toBe('child-id');
  });

  test('should return null when folder is not found', async () => {
    expect(await getFolderIdByName(mockAccessToken, 'NonExistentFolder')).toBeNull();
  });
});
