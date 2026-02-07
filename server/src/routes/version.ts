// File: server/src/routes/version.ts
import { Router, Request, Response } from 'express';
import { APP_VERSION, GITHUB_REPO, GITHUB_API_RELEASES_URL } from '../version.js';

const router = Router();

interface GitHubRelease {
  tag_name: string;
  html_url: string;
  published_at: string;
  body: string;
}

// Cache for GitHub release info (cache for 1 hour)
let cachedRelease: GitHubRelease | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds

async function fetchLatestRelease(): Promise<GitHubRelease | null> {
  const now = Date.now();
  
  // Return cached version if still valid
  if (cachedRelease && (now - cacheTimestamp) < CACHE_DURATION) {
    return cachedRelease;
  }
  
  try {
    const response = await fetch(GITHUB_API_RELEASES_URL, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'What-to-Watch-on-Plex'
      }
    });
    
    if (!response.ok) {
      console.error(`GitHub API error: ${response.status}`);
      return cachedRelease; // Return stale cache if available
    }
    
    const data = await response.json() as GitHubRelease;
    cachedRelease = data;
    cacheTimestamp = now;
    return data;
  } catch (error) {
    console.error('Error fetching latest release:', error);
    return cachedRelease; // Return stale cache if available
  }
}

function compareVersions(current: string, latest: string): number {
  // Remove 'v' prefix if present
  const cleanCurrent = current.replace(/^v/, '');
  const cleanLatest = latest.replace(/^v/, '');
  
  // Parse version strings (format: YYYY.MM.DD)
  const currentParts = cleanCurrent.split('.').map(Number);
  const latestParts = cleanLatest.split('.').map(Number);
  
  for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
    const currentPart = currentParts[i] || 0;
    const latestPart = latestParts[i] || 0;
    
    if (latestPart > currentPart) return 1;  // Update available
    if (latestPart < currentPart) return -1; // Current is newer (dev version?)
  }
  
  return 0; // Same version
}

// GET /api/version - Get current version and check for updates
router.get('/', async (_req: Request, res: Response) => {
  try {
    const latestRelease = await fetchLatestRelease();
    
    let updateAvailable = false;
    let latestVersion: string | null = null;
    let releaseUrl: string | null = null;
    let releaseNotes: string | null = null;
    let publishedAt: string | null = null;
    
    if (latestRelease) {
      latestVersion = latestRelease.tag_name;
      releaseUrl = latestRelease.html_url;
      releaseNotes = latestRelease.body;
      publishedAt = latestRelease.published_at;
      updateAvailable = compareVersions(APP_VERSION, latestVersion) > 0;
    }
    
    res.json({
      currentVersion: APP_VERSION,
      latestVersion,
      updateAvailable,
      releaseUrl,
      releaseNotes,
      publishedAt,
      githubRepo: GITHUB_REPO
    });
  } catch (error) {
    console.error('Error in version endpoint:', error);
    res.json({
      currentVersion: APP_VERSION,
      latestVersion: null,
      updateAvailable: false,
      error: 'Failed to check for updates'
    });
  }
});

// GET /api/version/current - Get just the current version (lightweight)
router.get('/current', (_req: Request, res: Response) => {
  res.json({
    version: APP_VERSION
  });
});

export { router as versionRoutes };