// This file should be named Code.gs and works with GiithubClient.gs in https://script.google.com
//Combined with automating the designation of each google doc as "Publish to Web", this will allow you to dump your Docs for indexing on Google Search.

// --- ⭐️ CONFIGURE THESE VARIABLES ⭐️ ---
const GITHUB_TOKEN = 'ghp_'; // Your GitHub Personal Access Token
const GITHUB_USERNAME = ''; // Your GitHub username
const GITHUB_OWNER = ""; // Your GitHub repository owner (usually same as username)
const GITHUB_REPO = 'Health_Research'; // The name of your GitHub repo
const GITHUB_BRANCH = 'main'; // Or 'master', 'main', etc.
const GDRIVE_FOLDER_ID = '1G5C9IV91kMcpanOM2_x2ppfZMSM6R828'; // The ID of your root Google Drive folder
const REPO_FOLDER_PATH = ''; // Folder path in GitHub. Use '' for root, or 'FolderName'

// ⭐️ NEW: Set your sync strategy
// 'SIZE' = Fast: Only syncs if file size is different.
// 'SHA'  = Slow: Fetches SHA and updates file.
const SYNC_STRATEGY = 'SIZE';
// ------------------------------------


/**
 * Main function to run the sync.
 */
function syncAll() {
  Logger.log('Starting sync...');
  
  // Initialize the client *inside* the function to use the constants
  const client = new GithubClient(GITHUB_OWNER, GITHUB_REPO, GITHUB_USERNAME, GITHUB_TOKEN);
  
  let rootFolder;
  try {
    rootFolder = DriveApp.getFolderById(GDRIVE_FOLDER_ID);
  } catch (e) {
    Logger.log("Error: Failed to find Google Drive folder. Check GDRIVE_FOLDER_ID and permissions.");
    Logger.log(e);
    return; // Stop execution
  }
  
  // Start the recursive sync.
  // We start at the root, so the GitHub path is the base REPO_FOLDER_PATH.
  syncRecursive(rootFolder, REPO_FOLDER_PATH, client);
  
  Logger.log('Sync complete.');
}

/**
 * Recursively syncs a Google Drive folder to a GitHub path.
 */
function syncRecursive(driveFolder, githubPath, client) {
  Logger.log('Scanning Drive Folder: ' + driveFolder.getName());

  // --- Sync Files in Current Folder ---
  const files = driveFolder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    const fileName = file.getName();
    let githubFileName = fileName;
    let content;
    let fileSize = file.getSize(); // Get size for comparison

    try {
      // Handle Google Docs/Sheets/Slides by converting them
      const mimeType = file.getMimeType();
      if (mimeType === MimeType.GOOGLE_DOC) {
        githubFileName = fileName + '.txt';
        content = DocumentApp.openById(file.getId()).getBody().getText();
        Logger.log('Syncing Google Doc: ' + githubFileName);
        
      } else if (mimeType === MimeType.GOOGLE_SHEET || mimeType === MimeType.GOOGLE_SLIDE) {
        // These are often very large as PDFs, skip if > 50MB
        if (fileSize > 50 * 1024 * 1024) { 
           Logger.log('Skipping large Google Sheet/Slide (over 50MB): ' + fileName);
           continue;
        }
        githubFileName = fileName + '.pdf';
        content = file.getAs(MimeType.PDF).getBytes();
        Logger.log('Syncing Google Sheet/Slide as PDF: ' + githubFileName);
        
      } else {
        // Handle binary files (images, zips, PDFs, .url files)
        // Skip files larger than 100MB (GitHub API limit)
        if (fileSize > 99 * 1024 * 1024) { 
           Logger.log('Skipping large binary file (over 99MB): ' + fileName);
           continue;
        }
        content = file.getBlob().getBytes();
        Logger.log('Syncing binary file: ' + githubFileName);
      }

      // Construct the full path for the file in the GitHub repo
      const fullGithubPath = (githubPath === '') ? githubFileName : (githubPath + '/' + githubFileName);

      // Pass the sync strategy options to the commit function
      client.commit(
        fullGithubPath, 
        content, 
        'Apps Script: Sync file ' + githubFileName, 
        GITHUB_BRANCH,
        { 
          strategy: SYNC_STRATEGY,
          driveFileSize: (typeof content === 'string') ? Utilities.newBlob(content).getBytes().length : content.length // Pass the *actual* content size
        }
      );

    } catch (e) {
      Logger.log('Failed to sync file ' + fileName + '. Error: ' + e);
    }
  }

  // --- Recurse into Subfolders ---
  const folders = driveFolder.getFolders();
  while (folders.hasNext()) {
    const subFolder = folders.next();
    const subGithubPath = (githubPath === '') ? subFolder.getName() : (githubPath + '/' + subFolder.getName());
    
    // Recurse
    syncRecursive(subFolder, subGithubPath, client);
  }
}

