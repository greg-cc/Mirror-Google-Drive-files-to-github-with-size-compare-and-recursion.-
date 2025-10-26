// This file should be named GithubClient.gs
// Based on https://gist.github.com/pamelafox/ea0474daa137f035b489bf78cc5797ea

/* A bare-bones GithubClient, just used for commits */
function GithubClient(owner, repo, username, passwordOrToken) {
  this.owner = owner;
  this.repo = repo;
  this.username = username;
  // Use Basic Auth with a token
  this.authHeader = "Basic " + Utilities.base64Encode(this.username + ':' + passwordOrToken);
  this.baseUrl = "https://api.github.com" + "/repos/" + this.owner + "/" + this.repo;
}

/**
 * Commits content to the Github repo.
 * @param {string} path - Path to file in repo.
 * @param {string|byte[]} content - Content to commit (string or byte array).
 * @param {string} message - Commit message.
 * @param {string} branch - Branch name (e.g., "main")
 * @param {object} syncOptions - Optional. { strategy: 'SIZE' }
 */
GithubClient.prototype.commit = function(path, content, message, branch, syncOptions) {
  
  // Encode path components (e.g., "file name") but not the "/" separators
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  
  // 1. Get the SHA and size of the file if it exists
  let sha;
  let existingSize; 
  let fileInfoResponse; 

  try {
    let getResponse = UrlFetchApp.fetch(this.baseUrl + "/contents/" + encodedPath + "?ref=" + branch, {
      "headers": {"Authorization": this.authHeader},
      "muteHttpExceptions": true
    });
    
    if (getResponse.getResponseCode() == 200) {
      fileInfoResponse = JSON.parse(getResponse.getContentText());
      sha = fileInfoResponse.sha;
      existingSize = fileInfoResponse.size; 
      Logger.log("File exists. Got SHA: " + sha + ", Size: " + existingSize);
    } else {
      Logger.log("File does not exist. Creating new file.");
    }
  } catch(e) {
    Logger.log("Error checking for file: " + e);
  }

  // --- ⭐️ NEW: Logic for 'SIZE' sync strategy ---
  if (sha && syncOptions && syncOptions.strategy === 'SIZE') {
    let newSize;
    if (typeof content === 'string') {
      // Get byte length of a string
      newSize = Utilities.newBlob(content).getBytes().length;
    } else {
      // It's a byte array
      newSize = content.length; 
    }

    if (newSize === existingSize) {
      Logger.log(`File sizes match (${newSize} bytes). Skipping commit for ${path}`);
      return; // Exit the function, don't commit
    } else {
      Logger.log(`File size mismatch. Drive: ${newSize}, GitHub: ${existingSize}. Committing update.`);
    }
  }
  // --- END NEW BLOCK ---

  // Encode the file content to base64
  let base64Content;
  if (typeof content === 'string') {
    // It's a string (from a Google Doc export)
    base64Content = Utilities.base64Encode(content, Utilities.Charset.UTF_8);
  } else {
    // It's a byte array (from a zip, png, url, etc.)
    base64Content = Utilities.base64Encode(content);
  }

  // 2. Create or update the file
  let payload = {
    "message": message,
    "content": base64Content, 
    "branch": branch
  };
  
  // Add SHA if we are updating an existing file
  if (sha) {
    payload.sha = sha;
  }
  
  let options = {
    "method": "put",
    "headers": {
      "Authorization": this.authHeader,
      "Accept": "application/vnd.github.v3+json"
    },
    "contentType": "application/json",
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };
  
  let response = UrlFetchApp.fetch(this.baseUrl + "/contents/" + encodedPath, options);
  
  if (response.getResponseCode() == 200 || response.getResponseCode() == 201) {
    Logger.log("Successfully committed: " + path);
    return response.getContentText();
  } else {
    Logger.log("Error committing file: " + response.getContentText());
    throw new Error("Failed to commit file. Status: " + response.getResponseCode() + " | Response: " + response.getContentText());
  }
};


/**
 * Gets the contents of a folder from the GitHub repo.
 * @param {string} path - Path to the folder in the repo.
 * @param {string} branch - Branch name (e.g., "main")
 * @return {Array|null} An array of file objects or null if it fails.
 */
GithubClient.prototype.getFolderContents = function(path, branch) {
  let fullPath = "/contents/";
  
  // Only add path if it's not empty (for root directory)
  if (path) {
    fullPath += path.split('/').map(encodeURIComponent).join('/');
  }
  
  let url = this.baseUrl + fullPath + "?ref=" + branch;
  
  try {
    let response = UrlFetchApp.fetch(url, {
      "method": "get",
      "headers": {"Authorization": this.authHeader},
      "muteHttpExceptions": true
    });
    
    if (response.getResponseCode() == 200) {
      return JSON.parse(response.getContentText());
    } else {
      Logger.log("Error getting folder contents: " + response.getContentText());
      return null;
    }
  } catch(e) {
    Logger.log("Fatal error in getFolderContents: " + e);
    return null;
  }
};

