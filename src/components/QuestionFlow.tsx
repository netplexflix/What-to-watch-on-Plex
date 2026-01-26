//file: /src/components/QuestionFlow.tsx
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Calendar, Globe, Check, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { plexApi, sessionsApi } from "@/lib/api";
import { TriStateButton } from "@/components/TriStateButton";
import { useHaptics } from "@/hooks/useHaptics";
import type { SessionPreferences, SelectionState } from "@/types/session";

interface QuestionFlowProps {
  onComplete: (preferences: SessionPreferences) => void;
  languages?: { language: string; count: number }[];
  className?: string;
}

interface SessionSettings {
  max_choices: number;
  max_exclusions: number;
  suggestion_order: "random" | "fixed";
  filter_watched: boolean;
}

const DEFAULT_SETTINGS: SessionSettings = {
  max_choices: 3,
  max_exclusions: 3,
  suggestion_order: "random",
  filter_watched: true,
};

const GENRES = [
  "Action", "Adventure", "Animation", "Comedy", "Crime", 
  "Documentary", "Drama", "Family", "Fantasy", "Horror",
  "Mystery", "Romance", "Sci-Fi", "Thriller", "War"
];

const ERAS = [
  { value: "recent", label: "Very Recent", description: "Last 2 years" },
  { value: "2020s", label: "2020s", description: "2020-present" },
  { value: "2010s", label: "2010s", description: "2010-2019" },
  { value: "2000s", label: "2000s", description: "2000-2009" },
  { value: "90s", label: "90s", description: "1990-1999" },
  { value: "classic", label: "Classic", description: "Before 1990" },
];

type TriStateMap = Record<string, SelectionState>;

export const QuestionFlow = ({ onComplete, languages: propLanguages, className }: QuestionFlowProps) => {
  const haptics = useHaptics();
  const [step, setStep] = useState(0);
  const [genreStates, setGenreStates] = useState<TriStateMap>({});
  const [eraStates, setEraStates] = useState<TriStateMap>({});
  const [languageStates, setLanguageStates] = useState<TriStateMap>({});
  const [dontMindGenres, setDontMindGenres] = useState(true);
  const [dontMindEras, setDontMindEras] = useState(true);
  const [dontMindLanguages, setDontMindLanguages] = useState(true);
  
  const [availableLanguages, setAvailableLanguages] = useState<string[]>([]);
  const [languagesLoading, setLanguagesLoading] = useState(true);
  
  // Session settings for max choices/exclusions
  const [settings, setSettings] = useState<SessionSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    // Use languages from props if provided
    if (propLanguages && propLanguages.length > 0) {
      console.log('QuestionFlow: Using prop languages:', propLanguages);
      setAvailableLanguages(propLanguages.map(l => l.language));
      setLanguagesLoading(false);
    } else {
      // Fetch languages from API
      const fetchLanguages = async () => {
        setLanguagesLoading(true);
        try {
          console.log('QuestionFlow: Fetching languages from API...');
          const { data, error } = await plexApi.getLanguages();
          console.log('QuestionFlow: API response:', { data, error });
          
          if (error) {
            console.error('QuestionFlow: API error:', error);
            setAvailableLanguages([]);
          } else if (data?.languages && Array.isArray(data.languages)) {
            const langs = data.languages.map((l: any) => l.language);
            console.log('QuestionFlow: Setting languages:', langs);
            setAvailableLanguages(langs);
          } else {
            console.log('QuestionFlow: No languages in response');
            setAvailableLanguages([]);
          }
        } catch (err) {
          console.error("QuestionFlow: Failed to fetch languages:", err);
          setAvailableLanguages([]);
        } finally {
          setLanguagesLoading(false);
        }
      };
      fetchLanguages();
    }
    
    // Fetch session settings
    const fetchSettings = async () => {
      try {
        const { data } = await sessionsApi.getConfig('session_settings');
        if (data?.value && typeof data.value === 'object') {
          setSettings({ ...DEFAULT_SETTINGS, ...data.value });
        }
      } catch (err) {
        console.error("Failed to fetch settings:", err);
      }
    };
    fetchSettings();
  }, [propLanguages]);

  const steps = [
    { question: "Pick some genres you'd enjoy", subtext: "Tap once to prefer, twice to exclude" },
    { question: "From which era?", subtext: "Tap once to prefer, twice to exclude" },
    { question: "Which languages?", subtext: "Tap once to prefer, twice to exclude" },
  ];

  const handleNext = () => {
    haptics.medium();
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      // Build preferences from states
      const genres = dontMindGenres 
        ? [] 
        : Object.entries(genreStates)
            .filter(([_, state]) => state === true)
            .map(([genre]) => genre);
      const excludedGenres = dontMindGenres
        ? []
        : Object.entries(genreStates)
            .filter(([_, state]) => state === false)
            .map(([genre]) => genre);
      
      const eras = dontMindEras 
        ? [] 
        : Object.entries(eraStates)
            .filter(([_, state]) => state === true)
            .map(([era]) => era);
      const excludedEras = dontMindEras
        ? []
        : Object.entries(eraStates)
            .filter(([_, state]) => state === false)
            .map(([era]) => era);
      
      const languages = dontMindLanguages 
        ? [] 
        : Object.entries(languageStates)
            .filter(([_, state]) => state === true)
            .map(([lang]) => lang);
      const excludedLanguages = dontMindLanguages
        ? []
        : Object.entries(languageStates)
            .filter(([_, state]) => state === false)
            .map(([lang]) => lang);

      onComplete({
        genres,
        excludedGenres,
        eras,
        excludedEras,
        languages,
        excludedLanguages,
      });
    }
  };

  const hasAnySelection = (states: TriStateMap) => {
    return Object.values(states).some((v) => v !== undefined);
  };

  const canContinue = () => {
    switch (step) {
      case 0:
        return dontMindGenres || hasAnySelection(genreStates);
      case 1:
        return dontMindEras || hasAnySelection(eraStates);
      case 2:
        return dontMindLanguages || hasAnySelection(languageStates) || availableLanguages.length === 0;
      default:
        return true;
    }
  };

  // Count selections for limit enforcement
  const countSelections = (states: TriStateMap, type: "choices" | "exclusions") => {
    return Object.values(states).filter(v => type === "choices" ? v === true : v === false).length;
  };

  // Get current counts for display
  const getCurrentCounts = () => {
    let states: TriStateMap;
    let dontMind: boolean;
    
    switch (step) {
      case 0:
        states = genreStates;
        dontMind = dontMindGenres;
        break;
      case 1:
        states = eraStates;
        dontMind = dontMindEras;
        break;
      case 2:
        states = languageStates;
        dontMind = dontMindLanguages;
        break;
      default:
        return { choices: 0, exclusions: 0 };
    }
    
    if (dontMind) return { choices: 0, exclusions: 0 };
    
    return {
      choices: countSelections(states, "choices"),
      exclusions: countSelections(states, "exclusions"),
    };
  };

  // Generic toggle handler with smart limit handling
  const handleToggle = (
    key: string,
    states: TriStateMap,
    setStates: React.Dispatch<React.SetStateAction<TriStateMap>>,
    setDontMind: React.Dispatch<React.SetStateAction<boolean>>
  ) => {
    setDontMind(false);
    
    const currentState = states[key];
    const choiceCount = countSelections(states, "choices");
    const exclusionCount = countSelections(states, "exclusions");
    
    let nextState: SelectionState;
    
    if (currentState === undefined) {
      // Not selected -> try to prefer, or exclude if at preference limit
      if (choiceCount >= settings.max_choices) {
        // Preference limit reached, go directly to exclusion if allowed
        if (exclusionCount >= settings.max_exclusions) {
          return; // Both limits reached, can't do anything
        }
        nextState = false; // Skip to exclusion
      } else {
        nextState = true; // Normal: prefer
      }
    } else if (currentState === true) {
      // Preferred -> try to exclude
      if (exclusionCount >= settings.max_exclusions) {
        nextState = undefined; // Can't exclude, go back to unselected
      } else {
        nextState = false; // Normal: exclude
      }
    } else {
      // Excluded -> unselected
      nextState = undefined;
    }
    
    haptics.selection();
    setStates({ ...states, [key]: nextState });
  };

  const handleGenreToggle = (genre: string) => {
    handleToggle(genre, genreStates, setGenreStates, setDontMindGenres);
  };

  const handleEraToggle = (era: string) => {
    handleToggle(era, eraStates, setEraStates, setDontMindEras);
  };

  const handleLanguageToggle = (lang: string) => {
    handleToggle(lang, languageStates, setLanguageStates, setDontMindLanguages);
  };

  const currentCounts = getCurrentCounts();

  return (
    <div className={cn("w-full max-w-md mx-auto", className)}>
      {/* Progress bar */}
      <div className="flex gap-2 mb-8">
        {steps.map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-all duration-300",
              i <= step ? "bg-primary" : "bg-secondary"
            )}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3 }}
        >
          <h2 className="text-2xl font-bold text-foreground mb-2">
            {steps[step].question}
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            {steps[step].subtext}
          </p>

          {/* Selection limits info */}
          <div className="flex items-center gap-2 mb-6 p-3 rounded-lg bg-secondary/50">
            <Info size={16} className="text-muted-foreground flex-shrink-0" />
            <p className="text-xs text-muted-foreground">
              You can select up to <span className="font-semibold text-primary">{settings.max_choices} preferences</span> and <span className="font-semibold text-destructive">{settings.max_exclusions} exclusions</span>
              {currentCounts.choices > 0 || currentCounts.exclusions > 0 ? (
                <span className="ml-1">
                  (currently: {currentCounts.choices}/{settings.max_choices} preferred, {currentCounts.exclusions}/{settings.max_exclusions} excluded)
                </span>
              ) : null}
            </p>
          </div>

          {/* Step 0: Genres */}
          {step === 0 && (
            <div className="space-y-4">
              {/* I don't mind option */}
              <button
                onClick={() => {
                  haptics.selection();
                  setDontMindGenres(true);
                  setGenreStates({});
                }}
                className={cn(
                  "w-full p-4 rounded-xl transition-all duration-200 text-left border-2 flex items-center gap-3",
                  dontMindGenres
                    ? "glass-card border-primary glow-primary"
                    : "glass-card border-transparent hover:border-muted-foreground/30"
                )}
              >
                <div className={cn(
                  "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                  dontMindGenres 
                    ? "bg-primary border-primary" 
                    : "border-muted-foreground"
                )}>
                  {dontMindGenres && <Check size={14} className="text-primary-foreground" />}
                </div>
                <div>
                  <span className="font-medium text-foreground">I don't mind</span>
                  <p className="text-xs text-muted-foreground">Show all genres</p>
                </div>
              </button>
              
              <div className="flex flex-wrap gap-2">
                {GENRES.map((genre) => (
                  <TriStateButton
                    key={genre}
                    label={genre}
                    state={dontMindGenres ? undefined : genreStates[genre]}
                    onToggle={() => handleGenreToggle(genre)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Step 1: Era (multi-select) */}
          {step === 1 && (
            <div className="space-y-4">
              {/* I don't mind option */}
              <button
                onClick={() => {
                  haptics.selection();
                  setDontMindEras(true);
                  setEraStates({});
                }}
                className={cn(
                  "w-full p-4 rounded-xl transition-all duration-200 text-left border-2 flex items-center gap-3",
                  dontMindEras
                    ? "glass-card border-primary glow-primary"
                    : "glass-card border-transparent hover:border-muted-foreground/30"
                )}
              >
                <div className={cn(
                  "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                  dontMindEras 
                    ? "bg-primary border-primary" 
                    : "border-muted-foreground"
                )}>
                  {dontMindEras && <Check size={14} className="text-primary-foreground" />}
                </div>
                <div>
                  <span className="font-medium text-foreground">I don't mind</span>
                  <p className="text-xs text-muted-foreground">Show from any era</p>
                </div>
              </button>
              
              <div className="grid grid-cols-2 gap-3">
                {ERAS.map((era) => (
                  <TriStateButton
                    key={era.value}
                    label={era.label}
                    description={era.description}
                    state={dontMindEras ? undefined : eraStates[era.value]}
                    onToggle={() => handleEraToggle(era.value)}
                    icon={
                      <Calendar
                        size={20}
                        className={cn(
                          !dontMindEras && eraStates[era.value] === true
                            ? "text-white"
                            : !dontMindEras && eraStates[era.value] === false
                            ? "text-destructive-foreground"
                            : "text-muted-foreground"
                        )}
                      />
                    }
                    variant="card"
                  />
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Languages */}
          {step === 2 && (
            <div className="space-y-4">
              {languagesLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
                  <p className="text-muted-foreground">Loading languages...</p>
                </div>
              ) : availableLanguages.length === 0 ? (
                <div className="text-center py-8">
                  <Globe size={48} className="mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    No language data available. Continue to see all content.
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Try refreshing the cache in the admin panel.
                  </p>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => {
                      haptics.selection();
                      setDontMindLanguages(true);
                      setLanguageStates({});
                    }}
                    className={cn(
                      "w-full p-4 rounded-xl transition-all duration-200 text-left border-2 flex items-center gap-3",
                      dontMindLanguages
                        ? "glass-card border-primary glow-primary"
                        : "glass-card border-transparent hover:border-muted-foreground/30"
                    )}
                  >
                    <div className={cn(
                      "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                      dontMindLanguages 
                        ? "bg-primary border-primary" 
                        : "border-muted-foreground"
                    )}>
                      {dontMindLanguages && <Check size={14} className="text-primary-foreground" />}
                    </div>
                    <div>
                      <span className="font-medium text-foreground">I don't mind</span>
                      <p className="text-xs text-muted-foreground">Show content in any language</p>
                    </div>
                  </button>
                  
                  <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
                    {availableLanguages.map((language) => (
                      <TriStateButton
                        key={language}
                        label={language}
                        state={dontMindLanguages ? undefined : languageStates[language]}
                        onToggle={() => handleLanguageToggle(language)}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Continue button */}
      <div className="mt-8">
        <Button
          onClick={handleNext}
          disabled={!canContinue()}
          className="w-full h-12 text-base font-semibold bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          {step === steps.length - 1 ? "Start Swiping" : "Continue"}
          <ChevronRight className="ml-2" size={20} />
        </Button>
      </div>
    </div>
  );
};