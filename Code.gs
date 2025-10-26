// This file should be named Code.gs and works with GiithubClient.gs in https://script.google.com
//Combined with automating the designation of each google doc as "Publish to Web", this will allow you to dump your Docs for indexing on Google Search.

// You must select "syncAll" from the function dropdown menu 
// above before you click the "Run" button.
//
// Running "syncRecursive" directly will cause an error.

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
// 'SHA'  = Slow: (Default) Fetches SHA and updates file.
const SYNC_STRATEGY = 'SIZE';
// ------------------------------------


/**
 * Main function to run the sync.
 * This is the -ONLY- function you should run manually.
 */
function syncAll() {
  // Initialize the client -inside- the function
  const client = new GithubClient(
    GITHUB_OWNER, 
    GITHUB_REPO, 
    GITHUB_USERNAME, 
    GITHUB_TOKEN
  );
  
  Logger.log('Starting sync...');
  
  let rootFolder;
  try {
    rootFolder = DriveApp.getFolderById(GDRIVE_FOLDER_ID);
  } catch (e) {
    Logger.log('FATAL ERROR: Could not get Drive Folder. Check GDRIVE_FOLDER_ID and script permissions. Error: ' + e);
    return; // Stop execution
  }

  // ⭐️ FIX: Add check to ensure rootFolder was found
  if (!rootFolder) {
    Logger.log('FATAL ERROR: Drive Folder with ID "' + GDRIVE_FOLDER_ID + '" was not found. Please check the ID and ensure the script has access.');
    return; // Stop execution
  }
  // ⭐️ END FIX
  
  // Start the recursive sync.
  // We start at the root, so the GitHub path is an empty string "".
  syncRecursive(rootFolder, REPO_FOLDER_PATH, client);
  
  Logger.log('Sync complete.');
}

/**
 * Recursively syncs a Google Drive folder to a GitHub path.
 * -DO NOT- run this function directly. Run syncAll() instead.
 */
function syncRecursive(driveFolder, githubPath, client) {
  
  // ⭐️ NEW: Add safeguard check
  if (!driveFolder || !client) {
    Logger.log('FATAL ERROR: syncRecursive() was run directly. You must run syncAll() from the editor.');
    return;
  }
  // ⭐️ END NEW CHECK

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
      const mimeType = file.getMimeType();
      const hasExtension = fileName.lastIndexOf('.') !== -1;

      // ⭐️ NEW: Skip shortcuts
      if (mimeType === MimeType.SHORTCUT) {
        Logger.log('Skipping Google Drive Shortcut: ' + fileName);
        continue;
      }
      
      // ⭐️ MODIFIED: Convert Google Docs, Sheets, and Slides to PDF
      if (mimeType === MimeType.GOOGLE_DOC || mimeType === MimeType.GOOGLE_SHEET || mimeType === MimeType.GOOGLE_SLIDE) {
        
        // These can be large as PDFs, skip if > 50MB
        if (fileSize > 50 * 1024 * 1024) { 
           Logger.log('Skipping large Google Doc/Sheet/Slide (over 50MB): ' + fileName);
           continue;
        }
        githubFileName = fileName + '.pdf';
        content = file.getAs(MimeType.PDF).getBytes(); // Convert to PDF
        Logger.log('Syncing Google file as PDF: ' + githubFileName);
        
      } 
      // ⭐️ NEW LOGIC: If file has NO extension, try to force PDF conversion
      else if (!hasExtension) {
        Logger.log('File has no extension. Attempting PDF conversion for: ' + fileName);
        try {
          // This works for text, rtf, images, and other convertible types
          githubFileName = fileName + '.pdf';
          content = file.getAs(MimeType.PDF).getBytes();
          Logger.log('Successfully converted no-extension file to PDF: ' + githubFileName);
        } catch (pdfError) {
          // ⭐️ MODIFIED: If PDF conversion fails, log and bypass (skip) the file
          Logger.log('PDF conversion failed for ' + fileName + '. Bypassing file. Error: ' + pdfError.message);
          continue; // Skips the rest of the loop for this file
        }
      } 
      // ⭐️ END NEW LOGIC
      else {
        // Handle all other files that *do* have an extension (binary, PDFs, text, etc.)
        Logger.log('Handling binary file with extension. Name: ' + fileName + ' | MIME Type: ' + mimeType);
        content = file.getBlob().getBytes();
        githubFileName = fileName; // Use the original filename
        Logger.log('Syncing binary file: ' + githubFileName);
      }

      // Get the *actual* size of the content we're about to upload
      const actualContentSize = (typeof content === 'string') ? Utilities.newBlob(content).getBytes().length : content.length;

      // Skip files larger than 100MB (GitHub API limit)
      if (actualContentSize > 99 * 1024 * 1024) { 
         Logger.log('Skipping large file (over 99MB): ' + githubFileName);
         continue;
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
          driveFileSize: actualContentSize // Pass the *actual* content size
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

