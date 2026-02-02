// File: src/components/admin/AdminSettingsTab.tsx
import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Loader2, Save, Shuffle, ListOrdered, Hash, Upload, Trash2, Image, ExternalLink, Tag, X, Plus, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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
  enable_label_restrictions: boolean;
  label_restriction_mode: "include" | "exclude";
  restricted_labels: string[];
  rating_display: "critic" | "audience" | "both";
}

const DEFAULT_SETTINGS: SessionSettings = {
  suggestion_order: "random",
  max_choices: 3,
  max_exclusions: 3,
  enable_collections: false,
  enable_plex_button: false,
  enable_label_restrictions: false,
  label_restriction_mode: "include",
  restricted_labels: [],
  rating_display: "critic",
};

export const AdminSettingsTab = () => {
  const haptics = useHaptics();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [settings, setSettings] = useState<SessionSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [customLogo, setCustomLogo] = useState<string | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [newLabel, setNewLabel] = useState("");

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
          enable_label_restrictions: data.settings.enable_label_restrictions ?? false,
          label_restriction_mode: data.settings.label_restriction_mode || "include",
          restricted_labels: data.settings.restricted_labels || [],
          rating_display: data.settings.rating_display || "critic",
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

  const handleAddLabel = () => {
    const trimmedLabel = newLabel.trim();
    if (!trimmedLabel) return;
    
    if (settings.restricted_labels.includes(trimmedLabel)) {
      toast.error("Label already added");
      return;
    }
    
    haptics.selection();
    setSettings(s => ({
      ...s,
      restricted_labels: [...s.restricted_labels, trimmedLabel]
    }));
    setNewLabel("");
  };

  const handleRemoveLabel = (label: string) => {
    haptics.selection();
    setSettings(s => ({
      ...s,
      restricted_labels: s.restricted_labels.filter(l => l !== label)
    }));
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
        transition={{ delay: 0.1 }}
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
        transition={{ delay: 0.2 }}
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

      {/* Collections Toggle */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="glass-card rounded-xl p-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Tag size={20} className="text-primary" />
              <h2 className="font-semibold text-foreground">Collections</h2>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Allow session hosts to filter by Plex collections
            </p>
          </div>
          <Switch
            checked={settings.enable_collections}
            onCheckedChange={(checked) => {
              haptics.selection();
              setSettings(s => ({ ...s, enable_collections: checked }));
            }}
          />
        </div>
      </motion.div>

      {/* Open in Plex Button Toggle */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="glass-card rounded-xl p-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <ExternalLink size={20} className="text-primary" />
              <h2 className="font-semibold text-foreground">Open in Plex Button</h2>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Show a button on the results page to open the winning item in Plex
            </p>
          </div>
          <Switch
            checked={settings.enable_plex_button}
            onCheckedChange={(checked) => {
              haptics.selection();
              setSettings(s => ({ ...s, enable_plex_button: checked }));
            }}
          />
        </div>
      </motion.div>

      {/* Rating Display */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }}
        className="glass-card rounded-xl p-4 space-y-4"
      >
        <div className="flex items-center gap-2">
          <Star size={20} className="text-primary" />
          <h2 className="font-semibold text-foreground">Rating Display</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Choose which ratings to show on card details
        </p>
        
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => {
              haptics.selection();
              setSettings(s => ({ ...s, rating_display: "critic" }));
            }}
            className={cn(
              "p-3 rounded-lg transition-all duration-200 flex flex-col items-center gap-1",
              settings.rating_display === "critic"
                ? "bg-primary/20 border-2 border-primary"
                : "bg-secondary hover:bg-secondary/80 border-2 border-transparent"
            )}
          >
            <span className="font-medium text-foreground text-sm">Critic</span>
            <span className="text-xs text-muted-foreground">IMDb/TMDB</span>
          </button>
          
          <button
            onClick={() => {
              haptics.selection();
              setSettings(s => ({ ...s, rating_display: "audience" }));
            }}
            className={cn(
              "p-3 rounded-lg transition-all duration-200 flex flex-col items-center gap-1",
              settings.rating_display === "audience"
                ? "bg-primary/20 border-2 border-primary"
                : "bg-secondary hover:bg-secondary/80 border-2 border-transparent"
            )}
          >
            <span className="font-medium text-foreground text-sm">Audience</span>
            <span className="text-xs text-muted-foreground">User rating</span>
          </button>
          
          <button
            onClick={() => {
              haptics.selection();
              setSettings(s => ({ ...s, rating_display: "both" }));
            }}
            className={cn(
              "p-3 rounded-lg transition-all duration-200 flex flex-col items-center gap-1",
              settings.rating_display === "both"
                ? "bg-primary/20 border-2 border-primary"
                : "bg-secondary hover:bg-secondary/80 border-2 border-transparent"
            )}
          >
            <span className="font-medium text-foreground text-sm">Both</span>
            <span className="text-xs text-muted-foreground">Show all</span>
          </button>
        </div>
      </motion.div>

      {/* Label Restrictions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="glass-card rounded-xl p-4 space-y-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Tag size={20} className="text-primary" />
              <h2 className="font-semibold text-foreground">Label Restrictions</h2>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Filter media by Plex labels
            </p>
          </div>
          <Switch
            checked={settings.enable_label_restrictions}
            onCheckedChange={(checked) => {
              haptics.selection();
              setSettings(s => ({ ...s, enable_label_restrictions: checked }));
            }}
          />
        </div>

        {settings.enable_label_restrictions && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="space-y-4 pt-2 border-t border-secondary"
          >
            {/* Mode selector */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Mode:</span>
              <select
                value={settings.label_restriction_mode}
                onChange={(e) => {
                  haptics.selection();
                  setSettings(s => ({ 
                    ...s, 
                    label_restriction_mode: e.target.value as "include" | "exclude" 
                  }));
                }}
                className="bg-secondary border-none rounded-lg px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-primary"
              >
                <option value="include">Include only</option>
                <option value="exclude">Exclude</option>
              </select>
            </div>

            <p className="text-xs text-muted-foreground">
              {settings.label_restriction_mode === "include" 
                ? "Only items with these labels will be suggested"
                : "Items with these labels will NOT be suggested"}
            </p>

            {/* Add label input */}
            <div className="flex gap-2">
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddLabel();
                  }
                }}
                placeholder="Enter label name"
                className="flex-1 bg-secondary border-secondary"
              />
              <Button
                onClick={handleAddLabel}
                disabled={!newLabel.trim()}
                size="icon"
                variant="outline"
              >
                <Plus size={18} />
              </Button>
            </div>

            {/* Labels list */}
            {settings.restricted_labels.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {settings.restricted_labels.map((label) => (
                  <div
                    key={label}
                    className="flex items-center gap-1 px-3 py-1 bg-secondary rounded-full text-sm"
                  >
                    <span className="text-foreground">{label}</span>
                    <button
                      onClick={() => handleRemoveLabel(label)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {settings.restricted_labels.length === 0 && (
              <p className="text-sm text-muted-foreground italic">
                No labels added yet
              </p>
            )}
          </motion.div>
        )}
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