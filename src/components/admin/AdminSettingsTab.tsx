// File: src/components/admin/AdminSettingsTab.tsx
import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Loader2, Save, Shuffle, ListOrdered, Hash, FolderOpen, Upload, Trash2, Image, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { adminApi } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useHaptics } from "@/hooks/useHaptics";

interface SessionSettings {
  suggestion_order: "random" | "fixed";
  max_choices: number;
  max_exclusions: number;
  enable_collections: boolean;
  enable_plex_button: boolean;
}

const DEFAULT_SETTINGS: SessionSettings = {
  suggestion_order: "random",
  max_choices: 3,
  max_exclusions: 3,
  enable_collections: false,
  enable_plex_button: false,
};

export const AdminSettingsTab = () => {
  const haptics = useHaptics();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [settings, setSettings] = useState<SessionSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [customLogo, setCustomLogo] = useState<string | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  useEffect(() => {
    loadSettings();
    loadLogo();
  }, []);

  const loadSettings = async () => {
    try {
      const { data, error } = await adminApi.getSessionSettings();
      
      if (error) throw new Error(error);
      
      if (data?.settings) {
        setSettings({
          suggestion_order: data.settings.suggestion_order || "random",
          max_choices: data.settings.max_choices ?? 3,
          max_exclusions: data.settings.max_exclusions ?? 3,
          enable_collections: data.settings.enable_collections ?? false,
          enable_plex_button: data.settings.enable_plex_button ?? false,
        });
      }
    } catch (err) {
      console.error("Error loading settings:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadLogo = async () => {
    try {
      const { data, error } = await adminApi.getLogo();
      
      if (error) {
        console.error("Error loading logo:", error);
        return;
      }
      
      if (data?.logo?.path) {
        const logoUrl = `${data.logo.path}?t=${Date.now()}`;
        setCustomLogo(logoUrl);
      } else {
        setCustomLogo(null);
      }
    } catch (err) {
      console.error("Exception loading logo:", err);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    haptics.medium();
    
    try {
      const { error } = await adminApi.saveSessionSettings(settings);
      
      if (error) throw new Error(error);
      
      haptics.success();
      toast.success("Settings saved successfully!");
    } catch (err) {
      haptics.error();
      console.error("Error saving settings:", err);
      toast.error("Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  const handleMaxChoicesChange = (delta: number) => {
    haptics.selection();
    setSettings(s => ({
      ...s,
      max_choices: Math.max(1, Math.min(10, s.max_choices + delta))
    }));
  };

  const handleMaxExclusionsChange = (delta: number) => {
    haptics.selection();
    setSettings(s => ({
      ...s,
      max_exclusions: Math.max(1, Math.min(10, s.max_exclusions + delta))
    }));
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File size must be less than 5MB");
      return;
    }

    setIsUploadingLogo(true);
    haptics.medium();

    try {
      const { data, error } = await adminApi.uploadLogo(file);
      
      if (error) throw new Error(error);
      
      if (data?.path) {
        const logoUrl = `${data.path}?t=${Date.now()}`;
        setCustomLogo(logoUrl);
        haptics.success();
        toast.success("Logo uploaded successfully!");
      } else {
        toast.error("Upload succeeded but no path returned");
      }
    } catch (err) {
      haptics.error();
      console.error("Error uploading logo:", err);
      toast.error("Failed to upload logo");
    } finally {
      setIsUploadingLogo(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteLogo = async () => {
    haptics.medium();
    
    try {
      const { error } = await adminApi.deleteLogo();
      
      if (error) throw new Error(error);
      
      setCustomLogo(null);
      haptics.success();
      toast.success("Logo removed successfully!");
    } catch (err) {
      haptics.error();
      console.error("Error deleting logo:", err);
      toast.error("Failed to remove logo");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Custom Logo */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card rounded-xl p-4 space-y-4"
      >
        <div className="flex items-center gap-2">
          <Image size={20} className="text-primary" />
          <h2 className="font-semibold text-foreground">Custom Logo</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Upload a custom logo to display on the home screen. Recommended size: 200x60 pixels. Max file size: 5MB.
        </p>
        
        {customLogo ? (
          <div className="space-y-3">
            <div className="p-4 bg-secondary rounded-lg flex items-center justify-center min-h-[100px]">
              <img 
                src={customLogo} 
                alt="Custom logo" 
                className="max-h-20 max-w-full object-contain"
                onError={() => {
                  console.error("Failed to load logo image");
                  toast.error("Failed to load logo image");
                  setCustomLogo(null);
                }}
              />
            </div>
            <Button
              onClick={handleDeleteLogo}
              variant="outline"
              className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 size={18} className="mr-2" />
              Remove Logo
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
              onChange={handleLogoUpload}
              className="hidden"
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingLogo}
              variant="outline"
              className="w-full"
            >
              {isUploadingLogo ? (
                <>
                  <Loader2 className="mr-2 animate-spin" size={18} />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload size={18} className="mr-2" />
                  Upload Logo
                </>
              )}
            </Button>
          </div>
        )}
      </motion.div>

      {/* Max Preferences */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass-card rounded-xl p-4 space-y-4"
      >
        <div className="flex items-center gap-2">
          <Hash size={20} className="text-primary" />
          <h2 className="font-semibold text-foreground">Selection Limits</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Set the maximum number of preferences and exclusions users can select per question
        </p>
        
        <div className="space-y-4">
          {/* Max Choices */}
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">Max Preferences</p>
              <p className="text-xs text-muted-foreground">Items users can prefer (green)</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleMaxChoicesChange(-1)}
                disabled={settings.max_choices <= 1}
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold transition-all",
                  settings.max_choices <= 1
                    ? "bg-secondary text-muted-foreground cursor-not-allowed"
                    : "bg-secondary hover:bg-secondary/80 text-foreground"
                )}
              >
                -
              </button>
              <span className="w-8 text-center font-bold text-foreground text-lg">
                {settings.max_choices}
              </span>
              <button
                onClick={() => handleMaxChoicesChange(1)}
                disabled={settings.max_choices >= 10}
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold transition-all",
                  settings.max_choices >= 10
                    ? "bg-secondary text-muted-foreground cursor-not-allowed"
                    : "bg-secondary hover:bg-secondary/80 text-foreground"
                )}
              >
                +
              </button>
            </div>
          </div>

          {/* Max Exclusions */}
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">Max Exclusions</p>
              <p className="text-xs text-muted-foreground">Items users can exclude (red)</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleMaxExclusionsChange(-1)}
                disabled={settings.max_exclusions <= 1}
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold transition-all",
                  settings.max_exclusions <= 1
                    ? "bg-secondary text-muted-foreground cursor-not-allowed"
                    : "bg-secondary hover:bg-secondary/80 text-foreground"
                )}
              >
                -
              </button>
              <span className="w-8 text-center font-bold text-foreground text-lg">
                {settings.max_exclusions}
              </span>
              <button
                onClick={() => handleMaxExclusionsChange(1)}
                disabled={settings.max_exclusions >= 10}
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold transition-all",
                  settings.max_exclusions >= 10
                    ? "bg-secondary text-muted-foreground cursor-not-allowed"
                    : "bg-secondary hover:bg-secondary/80 text-foreground"
                )}
              >
                +
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Suggestion Order */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="glass-card rounded-xl p-4 space-y-4"
      >
        <h2 className="font-semibold text-foreground">Suggestion Order</h2>
        <p className="text-sm text-muted-foreground">
          Choose how media items are ordered when swiping
        </p>
        
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => {
              haptics.selection();
              setSettings(s => ({ ...s, suggestion_order: "random" }));
            }}
            className={cn(
              "p-4 rounded-lg transition-all duration-200 flex flex-col items-center gap-2",
              settings.suggestion_order === "random"
                ? "bg-primary/20 border-2 border-primary"
                : "bg-secondary hover:bg-secondary/80 border-2 border-transparent"
            )}
          >
            <Shuffle size={24} className={settings.suggestion_order === "random" ? "text-primary" : "text-muted-foreground"} />
            <span className="font-medium text-foreground">Random</span>
            <span className="text-xs text-muted-foreground text-center">Different for each user</span>
          </button>
          
          <button
            onClick={() => {
              haptics.selection();
              setSettings(s => ({ ...s, suggestion_order: "fixed" }));
            }}
            className={cn(
              "p-4 rounded-lg transition-all duration-200 flex flex-col items-center gap-2",
              settings.suggestion_order === "fixed"
                ? "bg-primary/20 border-2 border-primary"
                : "bg-secondary hover:bg-secondary/80 border-2 border-transparent"
            )}
          >
            <ListOrdered size={24} className={settings.suggestion_order === "fixed" ? "text-primary" : "text-muted-foreground"} />
            <span className="font-medium text-foreground">Fixed</span>
            <span className="text-xs text-muted-foreground text-center">Same for all users</span>
          </button>
        </div>
      </motion.div>

      {/* Enable Collections */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="glass-card rounded-xl p-4 space-y-4"
      >
        <div className="flex items-center gap-2">
          <FolderOpen size={20} className="text-primary" />
          <h2 className="font-semibold text-foreground">Collections</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Allow session hosts to filter by Plex collections
        </p>
        
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => {
              haptics.selection();
              setSettings(s => ({ ...s, enable_collections: true }));
            }}
            className={cn(
              "p-4 rounded-lg transition-all duration-200 flex flex-col items-center gap-2",
              settings.enable_collections
                ? "bg-primary/20 border-2 border-primary"
                : "bg-secondary hover:bg-secondary/80 border-2 border-transparent"
            )}
          >
            <FolderOpen size={24} className={settings.enable_collections ? "text-primary" : "text-muted-foreground"} />
            <span className="font-medium text-foreground">Enabled</span>
            <span className="text-xs text-muted-foreground text-center">Show collection picker</span>
          </button>
          
          <button
            onClick={() => {
              haptics.selection();
              setSettings(s => ({ ...s, enable_collections: false }));
            }}
            className={cn(
              "p-4 rounded-lg transition-all duration-200 flex flex-col items-center gap-2",
              !settings.enable_collections
                ? "bg-primary/20 border-2 border-primary"
                : "bg-secondary hover:bg-secondary/80 border-2 border-transparent"
            )}
          >
            <FolderOpen size={24} className={!settings.enable_collections ? "text-primary" : "text-muted-foreground"} />
            <span className="font-medium text-foreground">Disabled</span>
            <span className="text-xs text-muted-foreground text-center">Use all library items</span>
          </button>
        </div>
      </motion.div>

      {/* Open in Plex Button */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass-card rounded-xl p-4 space-y-4"
      >
        <div className="flex items-center gap-2">
          <ExternalLink size={20} className="text-primary" />
          <h2 className="font-semibold text-foreground">Open in Plex Button</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Show a button on the results page to open the winning item in Plex
        </p>
        
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => {
              haptics.selection();
              setSettings(s => ({ ...s, enable_plex_button: true }));
            }}
            className={cn(
              "p-4 rounded-lg transition-all duration-200 flex flex-col items-center gap-2",
              settings.enable_plex_button
                ? "bg-primary/20 border-2 border-primary"
                : "bg-secondary hover:bg-secondary/80 border-2 border-transparent"
            )}
          >
            <ExternalLink size={24} className={settings.enable_plex_button ? "text-primary" : "text-muted-foreground"} />
            <span className="font-medium text-foreground">Enabled</span>
            <span className="text-xs text-muted-foreground text-center">Show button</span>
          </button>
          
          <button
            onClick={() => {
              haptics.selection();
              setSettings(s => ({ ...s, enable_plex_button: false }));
            }}
            className={cn(
              "p-4 rounded-lg transition-all duration-200 flex flex-col items-center gap-2",
              !settings.enable_plex_button
                ? "bg-primary/20 border-2 border-primary"
                : "bg-secondary hover:bg-secondary/80 border-2 border-transparent"
            )}
          >
            <ExternalLink size={24} className={!settings.enable_plex_button ? "text-primary" : "text-muted-foreground"} />
            <span className="font-medium text-foreground">Disabled</span>
            <span className="text-xs text-muted-foreground text-center">Hide button</span>
          </button>
        </div>
      </motion.div>

      {/* Save Button */}
      <Button
        onClick={handleSave}
        disabled={isSaving}
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
    </div>
  );
};