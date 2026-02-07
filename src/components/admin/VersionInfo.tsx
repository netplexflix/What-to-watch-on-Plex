// File: src/components/admin/VersionInfo.tsx
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Info, ExternalLink, RefreshCw, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { versionApi, VersionInfo as VersionInfoType } from '@/lib/api';
import { cn } from '@/lib/utils';

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

export const VersionInfo = () => {
  const [versionInfo, setVersionInfo] = useState<VersionInfoType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);

  const fetchVersionInfo = async (showRefreshState = false) => {
    if (showRefreshState) {
      setIsRefreshing(true);
    }
    
    try {
      const { data, error } = await versionApi.getVersionInfo();
      if (!error && data) {
        setVersionInfo(data);
      }
    } catch (err) {
      console.error('Error fetching version info:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchVersionInfo();
  }, []);

  if (isLoading) {
    return (
      <div className="glass-card rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <Info size={20} className="text-primary" />
          <h2 className="font-semibold text-foreground">Version</h2>
        </div>
        <div className="flex items-center justify-center py-4">
          <Loader2 className="animate-spin text-muted-foreground" size={24} />
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-xl p-4 space-y-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Info size={20} className="text-primary" />
          <h2 className="font-semibold text-foreground">Version</h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => fetchVersionInfo(true)}
          disabled={isRefreshing}
          className="h-8 w-8 p-0"
        >
          <RefreshCw size={16} className={cn(isRefreshing && "animate-spin")} />
        </Button>
      </div>

      <div className="space-y-3">
        {/* Current Version */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Current Version</span>
          <span className="font-mono text-sm text-foreground">
            {versionInfo?.currentVersion || 'Unknown'}
          </span>
        </div>

        {/* Update Status */}
        {versionInfo?.updateAvailable ? (
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 space-y-2">
            <div className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-primary" />
              <span className="font-medium text-foreground">Update Available!</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Latest Version</span>
              <span className="font-mono text-primary">
                {versionInfo.latestVersion}
              </span>
            </div>
            {versionInfo.publishedAt && (
              <div className="text-xs text-muted-foreground">
                Released: {formatDate(versionInfo.publishedAt)}
              </div>
            )}
            
            {/* Release Notes Toggle */}
            {versionInfo.releaseNotes && (
              <div className="pt-2">
                <button
                  onClick={() => setShowReleaseNotes(!showReleaseNotes)}
                  className="text-xs text-primary hover:underline"
                >
                  {showReleaseNotes ? 'Hide' : 'Show'} release notes
                </button>
                {showReleaseNotes && (
                  <div className="mt-2 p-2 rounded bg-secondary text-xs text-muted-foreground max-h-32 overflow-y-auto whitespace-pre-wrap">
                    {versionInfo.releaseNotes}
                  </div>
                )}
              </div>
            )}
            
            {/* Update Link */}
            {versionInfo.releaseUrl && (
              <a
                href={versionInfo.releaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-2"
              >
                View on GitHub
                <ExternalLink size={14} />
              </a>
            )}
          </div>
        ) : versionInfo?.latestVersion ? (
          <div className="p-3 rounded-lg bg-accent/10 border border-accent/20">
            <div className="flex items-center gap-2">
              <CheckCircle size={18} className="text-accent" />
              <span className="text-sm text-foreground">You're up to date!</span>
            </div>
          </div>
        ) : versionInfo?.error ? (
          <div className="p-3 rounded-lg bg-secondary">
            <p className="text-xs text-muted-foreground">
              Unable to check for updates
            </p>
          </div>
        ) : null}

        {/* GitHub Link */}
        {versionInfo?.githubRepo && (
          <a
            href={`https://github.com/${versionInfo.githubRepo}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="currentColor"
            >
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            {versionInfo.githubRepo}
            <ExternalLink size={12} />
          </a>
        )}
      </div>
    </motion.div>
  );
};