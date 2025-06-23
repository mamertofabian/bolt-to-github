/**
 * GitHub file content response type
 */
export interface GitHubFileContentResponse {
  content: {
    name: string;
    path: string;
    sha: string;
    size: number;
    url: string;
    html_url: string;
    git_url: string;
    download_url: string | null;
    type: string;
  };
  commit: {
    sha: string;
    node_id: string;
    url: string;
    html_url: string;
    author: {
      name: string;
      email: string;
      date: string;
    };
    committer: {
      name: string;
      email: string;
      date: string;
    };
    message: string;
  };
}

/**
 * Interface for file service operations
 */
export interface IFileService {
  /**
   * Reads a file from a repository
   * @param owner Repository owner (username or organization)
   * @param repo Repository name
   * @param path File path
   * @param branch Branch name
   * @returns Promise resolving to the file content
   */
  readFile(owner: string, repo: string, path: string, branch: string): Promise<string>;

  /**
   * Writes a file to a repository
   * @param owner Repository owner (username or organization)
   * @param repo Repository name
   * @param path File path
   * @param content File content
   * @param branch Branch name
   * @param message Commit message
   * @returns Promise resolving when the file is written
   */
  writeFile(
    owner: string,
    repo: string,
    path: string,
    content: string,
    branch: string,
    message: string
  ): Promise<GitHubFileContentResponse>;

  /**
   * Deletes a file from a repository
   * @param owner Repository owner (username or organization)
   * @param repo Repository name
   * @param path File path
   * @param branch Branch name
   * @param message Commit message
   * @returns Promise resolving when the file is deleted
   */
  deleteFile(
    owner: string,
    repo: string,
    path: string,
    branch: string,
    message: string
  ): Promise<void>;

  /**
   * Lists files in a directory in a repository
   * @param owner Repository owner (username or organization)
   * @param repo Repository name
   * @param path Directory path
   * @param branch Branch name
   * @returns Promise resolving to an array of file information
   */
  listFiles(owner: string, repo: string, path: string, branch: string): Promise<Array<FileInfo>>;

  /**
   * Gets information about a file in a repository
   * @param owner Repository owner (username or organization)
   * @param repo Repository name
   * @param path File path
   * @param branch Branch name
   * @returns Promise resolving to file information
   */
  getFileInfo(owner: string, repo: string, path: string, branch: string): Promise<FileInfo>;

  /**
   * Checks if a file exists in a repository
   * @param owner Repository owner (username or organization)
   * @param repo Repository name
   * @param path File path
   * @param branch Branch name
   * @returns Promise resolving to true if the file exists, false otherwise
   */
  fileExists(owner: string, repo: string, path: string, branch: string): Promise<boolean>;

  /**
   * Creates a directory in a repository (by creating a .gitkeep file)
   * @param owner Repository owner (username or organization)
   * @param repo Repository name
   * @param path Directory path
   * @param branch Branch name
   * @param message Commit message
   * @returns Promise resolving when the directory is created
   */
  createDirectory(
    owner: string,
    repo: string,
    path: string,
    branch: string,
    message: string
  ): Promise<void>;
}

/**
 * Interface for file information
 */
export interface FileInfo {
  name: string;
  path: string;
  sha: string;
  size: number;
  type: 'file' | 'dir' | 'symlink';
  content?: string;
  download_url?: string;
  html_url?: string;
}
