//file: /src/pages/Admin.tsx
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Save, Server, CheckCircle, XCircle, Loader2, Library, KeyRound, RefreshCw, Database, Settings, Clock, AlertCircle } from "lucide-react";
import { useHaptics } from "@/hooks/useHaptics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Logo } from "@/components/Logo";
import { adminApi, plexApi, CacheRefreshProgress } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AdminSettingsTab } from "@/components/admin/AdminSettingsTab";
import { CacheProgressIndicator } from "@/components/admin/CacheProgressIndicator";

interface PlexLibrary {
  key: string;
  title: string;
  type: string;
}

interface LastCacheRefresh {
  timestamp: string;
  type: string;
  mediaCount?: number;
  movieCount?: number;
  showCount?: number;
  error?: string;
  success?: boolean;
}

const hashPassword = async (password: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
};

const formatRelativeTime = (timestamp: string): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatDateTime = (timestamp: string): string => {
  const date = new Date(timestamp);
  return date.toLocaleDateString() + ' at ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const Admin = () => {
  const navigate = useNavigate();
  const haptics = useHaptics();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isPasswordSet, setIsPasswordSet] = useState<boolean | null>(null);
  const [isCheckingPassword, setIsCheckingPassword] = useState(true);
  const [plexUrl, setPlexUrl] = useState("");
  const [plexToken, setPlexToken] = useState("");
  const [isTesting, setIsTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"untested" | "success" | "error">("untested");
  const [connectionError, setConnectionError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [libraries, setLibraries] = useState<PlexLibrary[]>([]);
  const [selectedLibraries, setSelectedLibraries] = useState<string[]>([]);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [isRefreshingCache, setIsRefreshingCache] = useState(false);
  const [cacheStats, setCacheStats] = useState<{ mediaCount: number; languagesCached: boolean; collectionsCached?: boolean } | null>(null);
  const [lastCacheRefresh, setLastCacheRefresh] = useState<LastCacheRefresh | null>(null);
  const [autoCacheRefresh, setAutoCacheRefresh] = useState(false);
  
  const [activeTab, setActiveTab] = useState<"connection" | "settings">("connection");
  const [cacheProgress, setCacheProgress] = useState<CacheRefreshProgress | null>(null);
  
  const progressPollRef = useRef<number | null>(null);

  useEffect(() => {
    checkPasswordStatus();
    
    return () => {
      if (progressPollRef.current) {
        clearInterval(progressPollRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadConfig();
      loadCacheStats();
      loadLastCacheRefresh();
      loadSessionSettings();
    }
  }, [isAuthenticated]);

  const checkPasswordStatus = async () => {
    try {
      const { data, error } = await adminApi.checkPasswordStatus();
      if (error) throw new Error(error);
      setIsPasswordSet(data?.isSet ?? false);
    } catch (err) {
      console.error("Error checking password:", err);
      setIsPasswordSet(false);
    } finally {
      setIsCheckingPassword(false);
    }
  };

  const loadConfig = async () => {
    try {
      const { data, error } = await adminApi.getConfig();
      if (error) throw new Error(error);

      if (data?.config) {
        setPlexUrl(data.config.plex_url || "");
        setPlexToken(data.config.plex_token || "");
        setSelectedLibraries(data.config.libraries || []);

        if (data.config.plex_url && data.config.plex_token) {
          await fetchLibraries(data.config.plex_url, data.config.plex_token);
          setConnectionStatus("success");
        }
      }
    } catch (err) {
      console.error("Error loading config:", err);
    } finally {
      setIsLoadingConfig(false);
    }
  };

  const loadSessionSettings = async () => {
    try {
      const { data, error } = await adminApi.getSessionSettings();
      if (!error && data?.settings) {
        setAutoCacheRefresh(data.settings.auto_cache_refresh ?? false);
      }
    } catch (err) {
      console.error("Error loading session settings:", err);
    }
  };

  const loadCacheStats = async () => {
    try {
      const { data, error } = await plexApi.getCacheStats();
      if (!error && data) {
        setCacheStats(data);
      }
    } catch (err) {
      console.error("Error loading cache stats:", err);
    }
  };

  const loadLastCacheRefresh = async () => {
    try {
      const { data, error } = await plexApi.getLastCacheRefresh();
      if (!error && data?.lastRefresh) {
        setLastCacheRefresh(data.lastRefresh);
      }
    } catch (err) {
      console.error("Error loading last cache refresh:", err);
    }
  };

  const handleSetPassword = async () => {
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    try {
      const hashedPassword = await hashPassword(password);
      const { error } = await adminApi.setPassword(hashedPassword);

      if (error) throw new Error(error);

      toast.success("Admin password set successfully!");
      setIsPasswordSet(true);
      setIsAuthenticated(true);
      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      console.error("Error setting password:", err);
      toast.error(err instanceof Error ? err.message : "Failed to set password");
    }
  };

  const handleLogin = async () => {
    try {
      const hashedPassword = await hashPassword(password);
      const { data, error } = await adminApi.verifyPassword(hashedPassword);

      if (error) throw new Error(error);

      if (data?.valid) {
        setIsAuthenticated(true);
        setPassword("");
      } else {
        toast.error("Invalid password");
      }
    } catch (err) {
      console.error("Error logging in:", err);
      toast.error("Login failed");
    }
  };

  const fetchLibraries = async (url: string, token: string) => {
    try {
      const { data, error } = await plexApi.getLibraries(url, token);
      if (error) throw new Error(error);
      setLibraries(data?.libraries || []);
    } catch (err) {
      console.error("Error fetching libraries:", err);
      setLibraries([]);
    }
  };

  const handleTestConnection = async () => {
    if (!plexUrl || !plexToken) {
      toast.error("Please enter Plex URL and Token");
      return;
    }

    setIsTesting(true);
    setConnectionStatus("untested");
    setConnectionError("");

    try {
      const { data, error } = await plexApi.testConnection(plexUrl, plexToken);

      if (error) throw new Error(error);

      if (data?.success) {
        setConnectionStatus("success");
        toast.success("Successfully connected to Plex!");
        await fetchLibraries(plexUrl, plexToken);
      } else {
        setConnectionStatus("error");
        setConnectionError(data?.error || "Connection failed");
        toast.error(data?.error || "Connection failed");
      }
    } catch (err) {
      setConnectionStatus("error");
      const message = err instanceof Error ? err.message : "Connection test failed";
      setConnectionError(message);
      toast.error(message);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    if (connectionStatus !== "success") {
      toast.error("Please test the connection first");
      return;
    }

    setIsSaving(true);
    try {
      const configValue = {
        plex_url: plexUrl,
        plex_token: plexToken,
        libraries: selectedLibraries,
      };

      const { error } = await adminApi.saveConfig(configValue);

      if (error) throw new Error(error);

      toast.success("Settings saved successfully!");
    } catch (err) {
      console.error("Error saving config:", err);
      toast.error("Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleLibrary = (key: string) => {
    haptics.selection();
    setSelectedLibraries((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleAutoCacheRefreshToggle = async (enabled: boolean) => {
    haptics.selection();
    setAutoCacheRefresh(enabled);
    
    try {
      // Get current settings first
      const { data: currentData } = await adminApi.getSessionSettings();
      const currentSettings = currentData?.settings || {};
      
      // Update with new auto_cache_refresh value
      const { error } = await adminApi.saveSessionSettings({
        ...currentSettings,
        auto_cache_refresh: enabled,
      });
      
      if (error) throw new Error(error);
      
      toast.success(enabled ? "Auto cache refresh enabled" : "Auto cache refresh disabled");
    } catch (err) {
      console.error("Error saving auto cache refresh setting:", err);
      toast.error("Failed to save setting");
      // Revert on error
      setAutoCacheRefresh(!enabled);
    }
  };

  const pollProgress = useCallback(async () => {
    try {
      const { data } = await plexApi.getCacheRefreshProgress();
      if (data) {
        setCacheProgress(data);
        
        // Stop polling when complete or error
        if (data.phase === 'complete' || data.phase === 'error' || !data.isRunning) {
          if (progressPollRef.current) {
            clearInterval(progressPollRef.current);
            progressPollRef.current = null;
          }
          
          // Keep showing complete state for a moment
          if (data.phase === 'complete') {
            setTimeout(() => {
              setCacheProgress(null);
              loadCacheStats();
              loadLastCacheRefresh();
            }, 3000);
          }
        }
      }
    } catch (err) {
      console.error("Error polling progress:", err);
    }
  }, []);

  const handleRefreshCache = async () => {
    if (selectedLibraries.length === 0) {
      toast.error("Please select at least one library first");
      return;
    }

    setIsRefreshingCache(true);
    haptics.medium();

    // Start polling for progress
    setCacheProgress({
      isRunning: true,
      phase: 'starting',
      moviesProcessed: 0,
      moviesTotal: 0,
      showsProcessed: 0,
      showsTotal: 0,
      languagesFound: 0,
      collectionsProcessed: 0,
    });
    
    // Poll every 500ms for progress updates
    progressPollRef.current = window.setInterval(pollProgress, 500);

    try {
      const { data, error } = await plexApi.refreshCache(selectedLibraries);

      if (error) throw new Error(error);

      haptics.success();
      toast.success(`Cache refreshed! ${data?.mediaCount || 0} items cached.`);
    } catch (err) {
      if (progressPollRef.current) {
        clearInterval(progressPollRef.current);
        progressPollRef.current = null;
      }
      
      haptics.error();
      console.error("Error refreshing cache:", err);
      toast.error("Failed to refresh cache");
      setCacheProgress(null);
    } finally {
      setIsRefreshingCache(false);
    }
  };

  if (isCheckingPassword) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6">
        <Logo size="md" className="mb-8" />
        <div className="flex items-center gap-2 mb-6">
          <KeyRound size={24} className="text-primary" />
          <h1 className="text-xl font-bold text-foreground">
            {isPasswordSet ? "Admin Login" : "Set Admin Password"}
          </h1>
        </div>
        <div className="w-full max-w-sm space-y-4">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (isPasswordSet ? handleLogin() : null)}
            placeholder={isPasswordSet ? "Enter admin password" : "Create admin password"}
            className="h-12 bg-secondary border-secondary text-foreground"
          />
          {!isPasswordSet && (
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSetPassword()}
              placeholder="Confirm password"
              className="h-12 bg-secondary border-secondary text-foreground"
            />
          )}
          <Button
            onClick={isPasswordSet ? handleLogin : handleSetPassword}
            className="w-full h-12 bg-primary text-primary-foreground"
          >
            {isPasswordSet ? "Login" : "Set Password & Continue"}
          </Button>
          <Button variant="ghost" onClick={() => navigate("/")} className="w-full text-muted-foreground">
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="p-4 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
          <ArrowLeft size={24} />
        </Button>
        <h1 className="text-xl font-bold text-foreground">Admin Settings</h1>
      </div>

      <div className="px-6 mb-4">
        <div className="flex gap-2 p-1 bg-secondary rounded-lg">
          <button
            onClick={() => {
              haptics.selection();
              setActiveTab("connection");
            }}
            className={cn(
              "flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2",
              activeTab === "connection"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Server size={16} />
            Connection
          </button>
          <button
            onClick={() => {
              haptics.selection();
              setActiveTab("settings");
            }}
            className={cn(
              "flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2",
              activeTab === "settings"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Settings size={16} />
            Settings
          </button>
        </div>
      </div>

      <div className="flex-1 px-6 py-4 max-w-md mx-auto w-full space-y-6">
        {isLoadingConfig ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-primary" size={32} />
          </div>
        ) : activeTab === "settings" ? (
          <AdminSettingsTab />
        ) : (
          <>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card rounded-xl p-4 space-y-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <Server size={20} className="text-primary" />
                <h2 className="font-semibold text-foreground">Plex Connection</h2>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-muted-foreground">Plex URL</label>
                  <Input
                    value={plexUrl}
                    onChange={(e) => {
                      setPlexUrl(e.target.value);
                      setConnectionStatus("untested");
                    }}
                    placeholder="http://localhost:32400"
                    className="mt-1 bg-secondary border-secondary"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Plex Token</label>
                  <Input
                    type="password"
                    value={plexToken}
                    onChange={(e) => {
                      setPlexToken(e.target.value);
                      setConnectionStatus("untested");
                    }}
                    placeholder="Your Plex token"
                    className="mt-1 bg-secondary border-secondary"
                  />
                </div>
                <Button
                  onClick={handleTestConnection}
                  disabled={isTesting || !plexUrl || !plexToken}
                  variant="outline"
                  className="w-full"
                >
                  {isTesting ? (
                    <>
                      <Loader2 className="mr-2 animate-spin" size={18} />
                      Testing...
                    </>
                  ) : connectionStatus === "success" ? (
                    <>
                      <CheckCircle className="mr-2 text-accent" size={18} />
                      Connected
                    </>
                  ) : connectionStatus === "error" ? (
                    <>
                      <XCircle className="mr-2 text-destructive" size={18} />
                      Retry Test
                    </>
                  ) : (
                    "Test Connection"
                  )}
                </Button>
                {connectionError && (
                  <p className="text-sm text-destructive">{connectionError}</p>
                )}
              </div>
            </motion.div>

            {libraries.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="glass-card rounded-xl p-4 space-y-4"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Library size={20} className="text-primary" />
                  <h2 className="font-semibold text-foreground">Select Libraries</h2>
                </div>
                <div className="space-y-2">
                  {libraries.map((lib) => (
                    <button
                      key={lib.key}
                      onClick={() => toggleLibrary(lib.key)}
                      className={cn(
                        "w-full p-3 rounded-lg text-left transition-all duration-200 flex items-center justify-between",
                        selectedLibraries.includes(lib.key)
                          ? "bg-primary/20 border border-primary"
                          : "bg-secondary hover:bg-secondary/80"
                      )}
                    >
                      <div>
                        <p className="font-medium text-foreground">{lib.title}</p>
                        <p className="text-xs text-muted-foreground capitalize">{lib.type}</p>
                      </div>
                      {selectedLibraries.includes(lib.key) && (
                        <CheckCircle size={18} className="text-primary" />
                      )}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {libraries.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="glass-card rounded-xl p-4 space-y-4"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Database size={20} className="text-primary" />
                  <h2 className="font-semibold text-foreground">Media Cache</h2>
                </div>
                
                {cacheProgress && cacheProgress.isRunning ? (
                  <CacheProgressIndicator
                    phase={cacheProgress.phase as any}
                    moviesProcessed={cacheProgress.moviesProcessed}
                    moviesTotal={cacheProgress.moviesTotal}
                    showsProcessed={cacheProgress.showsProcessed}
                    showsTotal={cacheProgress.showsTotal}
                    languagesFound={cacheProgress.languagesFound}
                    collectionsProcessed={cacheProgress.collectionsProcessed}
                    error={cacheProgress.error}
                  />
                ) : cacheProgress?.phase === 'complete' ? (
                  <CacheProgressIndicator
                    phase="complete"
                    moviesProcessed={cacheProgress.moviesProcessed}
                    moviesTotal={cacheProgress.moviesTotal}
                    showsProcessed={cacheProgress.showsProcessed}
                    showsTotal={cacheProgress.showsTotal}
                    languagesFound={cacheProgress.languagesFound}
                    collectionsProcessed={cacheProgress.collectionsProcessed}
                  />
                ) : (
                  <>
                    {cacheStats && (
                      <div className="text-sm text-muted-foreground space-y-1">
                        <p>• {cacheStats.mediaCount.toLocaleString()} items cached</p>
                        <p>• Languages: {cacheStats.languagesCached ? "Cached ✓" : "Not cached"}</p>
                        <p>• Collections: {cacheStats.collectionsCached ? "Cached ✓" : "Not cached"}</p>
                      </div>
                    )}
                    
                    {/* Last refresh info */}
                    {lastCacheRefresh && (
                      <div className={cn(
                        "p-3 rounded-lg text-sm",
                        lastCacheRefresh.success === false 
                          ? "bg-destructive/10 border border-destructive/20" 
                          : "bg-secondary"
                      )}>
                        <div className="flex items-center gap-2 mb-1">
                          {lastCacheRefresh.success === false ? (
                            <AlertCircle size={16} className="text-destructive" />
                          ) : (
                            <Clock size={16} className="text-muted-foreground" />
                          )}
                          <span className="font-medium text-foreground">
                            Last {lastCacheRefresh.type === 'auto' ? 'auto ' : ''}refresh
                          </span>
                        </div>
                        <p className="text-muted-foreground">
                          {formatRelativeTime(lastCacheRefresh.timestamp)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDateTime(lastCacheRefresh.timestamp)}
                        </p>
                        {lastCacheRefresh.success === false && lastCacheRefresh.error && (
                          <p className="text-xs text-destructive mt-1">
                            Error: {lastCacheRefresh.error}
                          </p>
                        )}
                        {lastCacheRefresh.mediaCount !== undefined && lastCacheRefresh.success !== false && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {lastCacheRefresh.mediaCount.toLocaleString()} items
                          </p>
                        )}
                      </div>
                    )}
                    
                    <p className="text-xs text-muted-foreground">
                      Cache persists indefinitely. Use refresh to force a full rescan of your libraries.
                    </p>
                  </>
                )}
                
                <Button
                  onClick={handleRefreshCache}
                  disabled={isRefreshingCache || selectedLibraries.length === 0}
                  variant="outline"
                  className="w-full"
                >
                  {isRefreshingCache ? (
                    <>
                      <Loader2 className="mr-2 animate-spin" size={18} />
                      Scanning Libraries...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2" size={18} />
                      Refresh Cache
                    </>
                  )}
                </Button>

                {/* Auto Cache Refresh Toggle */}
                <div className="flex items-center justify-between pt-2 border-t border-secondary">
                  <div>
                    <p className="font-medium text-foreground text-sm">Auto Refresh</p>
                    <p className="text-xs text-muted-foreground">Refresh daily at 3:00 AM</p>
                  </div>
                  <Switch
                    checked={autoCacheRefresh}
                    onCheckedChange={handleAutoCacheRefreshToggle}
                  />
                </div>
              </motion.div>
            )}

            <Button
              onClick={handleSave}
              disabled={connectionStatus !== "success" || isSaving}
              className="w-full h-12 bg-primary text-primary-foreground"
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 animate-spin" size={18} />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2" size={18} />
                  Save Settings
                </>
              )}
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default Admin;