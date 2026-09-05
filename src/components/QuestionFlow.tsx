//file: /src/components/QuestionFlow.tsx
import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Globe, Check, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { plexApi } from "@/lib/api";
import { TriStateButton } from "@/components/TriStateButton";
import { useHaptics } from "@/hooks/useHaptics";
import {
  ERAS,
  GENRES,
  RUNTIMES,
  QUESTION_STAGES,
  getEnabledStages,
  isStageEnabled,
  type QuestionOption,
  type QuestionStageDef,
  type QuestionStageId,
} from "@/lib/questionStages";
import type { QuestionFlowSettings } from "@/types/settings";
import type { SessionPreferences, SelectionState } from "@/types/session";

interface QuestionFlowProps {
  onComplete: (preferences: SessionPreferences) => void;
  /** Admin config. Owned by the parent so the first paint already knows which stages to show. */
  settings: QuestionFlowSettings;
  languages?: { language: string; count: number }[];
  className?: string;
}

type TriStateMap = Record<string, SelectionState>;

const emptyStates = (): Record<QuestionStageId, TriStateMap> => ({
  genre: {},
  era: {},
  runtime: {},
  language: {},
});

// Every stage starts as "I don't mind", so Continue is enabled from the first paint.
const allDontMind = (): Record<QuestionStageId, boolean> => ({
  genre: true,
  era: true,
  runtime: true,
  language: true,
});

export const QuestionFlow = ({
  onComplete,
  settings,
  languages: propLanguages,
  className,
}: QuestionFlowProps) => {
  const haptics = useHaptics();
  const [step, setStep] = useState(0);
  const [states, setStates] = useState<Record<QuestionStageId, TriStateMap>>(emptyStates);
  const [dontMind, setDontMind] = useState<Record<QuestionStageId, boolean>>(allDontMind);

  const languageStageEnabled = isStageEnabled(settings.question_stages, "language");
  const [availableLanguages, setAvailableLanguages] = useState<string[]>([]);
  const [languagesLoading, setLanguagesLoading] = useState(languageStageEnabled);

  const enabledStages = useMemo(
    () => getEnabledStages(settings.question_stages),
    [settings.question_stages]
  );
  const currentStage: QuestionStageDef | undefined = enabledStages[step];

  useEffect(() => {
    // Nothing to load when the language stage is switched off.
    if (!languageStageEnabled) {
      setLanguagesLoading(false);
      return;
    }

    if (propLanguages && propLanguages.length > 0) {
      setAvailableLanguages(propLanguages.map((l) => l.language));
      setLanguagesLoading(false);
      return;
    }

    let cancelled = false;
    const fetchLanguages = async () => {
      setLanguagesLoading(true);
      try {
        const { data, error } = await plexApi.getLanguages();
        if (cancelled) return;
        if (error || !data?.languages || !Array.isArray(data.languages)) {
          setAvailableLanguages([]);
        } else {
          setAvailableLanguages(data.languages.map((l: { language: string }) => l.language));
        }
      } catch (err) {
        console.error("QuestionFlow: Failed to fetch languages:", err);
        if (!cancelled) setAvailableLanguages([]);
      } finally {
        if (!cancelled) setLanguagesLoading(false);
      }
    };
    fetchLanguages();

    return () => {
      cancelled = true;
    };
  }, [propLanguages, languageStageEnabled]);

  // Resolving a stage's options is the only place a stage needs special handling — the
  // JSX below is fully generic.
  const currentOptions = useMemo((): {
    options: QuestionOption[];
    loading: boolean;
    emptyMessage: string | null;
  } => {
    switch (currentStage?.id) {
      case "genre":
        return { options: GENRES, loading: false, emptyMessage: null };
      case "era":
        return { options: ERAS, loading: false, emptyMessage: null };
      case "runtime":
        return { options: RUNTIMES, loading: false, emptyMessage: null };
      case "language":
        return {
          options: availableLanguages.map((l) => ({ value: l, label: l })),
          loading: languagesLoading,
          emptyMessage: "No language data available. Continue to see all content.",
        };
      default:
        return { options: [], loading: false, emptyMessage: null };
    }
  }, [currentStage, availableLanguages, languagesLoading]);

  const countSelections = (stageStates: TriStateMap, type: "choices" | "exclusions") =>
    Object.values(stageStates).filter((v) => (type === "choices" ? v === true : v === false)).length;

  const handleNext = () => {
    haptics.medium();
    if (step < enabledStages.length - 1) {
      setStep(step + 1);
      return;
    }

    // Build over every stage, not just the enabled ones: a disabled stage never leaves
    // dontMind === true, so it contributes empty arrays — which the aggregation in
    // Swipe.tsx already treats as "no preference". This also keeps the submitted
    // payload the same shape regardless of which stages are switched on.
    const preferences: SessionPreferences = {};
    for (const stage of QUESTION_STAGES) {
      const stageStates = dontMind[stage.id] ? {} : states[stage.id];
      preferences[stage.prefKey] = Object.entries(stageStates)
        .filter(([, state]) => state === true)
        .map(([value]) => value);
      preferences[stage.excludeKey] = Object.entries(stageStates)
        .filter(([, state]) => state === false)
        .map(([value]) => value);
    }

    onComplete(preferences);
  };

  const canContinue = () => {
    if (!currentStage) return true;
    if (dontMind[currentStage.id]) return true;
    if (Object.values(states[currentStage.id]).some((v) => v !== undefined)) return true;
    // Nothing to pick from (e.g. no language data cached) — don't strand the user.
    return currentOptions.options.length === 0;
  };

  const currentCounts = (() => {
    if (!currentStage || dontMind[currentStage.id]) return { choices: 0, exclusions: 0 };
    const stageStates = states[currentStage.id];
    return {
      choices: countSelections(stageStates, "choices"),
      exclusions: countSelections(stageStates, "exclusions"),
    };
  })();

  const handleDontMind = (stageId: QuestionStageId) => {
    haptics.selection();
    setDontMind((prev) => ({ ...prev, [stageId]: true }));
    setStates((prev) => ({ ...prev, [stageId]: {} }));
  };

  // undefined -> prefer -> exclude -> undefined, with the configured limits applied.
  const handleToggle = (stageId: QuestionStageId, key: string) => {
    const stageStates = states[stageId];
    const currentState = stageStates[key];
    const choiceCount = countSelections(stageStates, "choices");
    const exclusionCount = countSelections(stageStates, "exclusions");

    let nextState: SelectionState;

    if (currentState === undefined) {
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
      if (exclusionCount >= settings.max_exclusions) {
        nextState = undefined; // Can't exclude, go back to unselected
      } else {
        nextState = false; // Normal: exclude
      }
    } else {
      nextState = undefined;
    }

    haptics.selection();
    setDontMind((prev) => ({ ...prev, [stageId]: false }));
    setStates((prev) => ({ ...prev, [stageId]: { ...prev[stageId], [key]: nextState } }));
  };

  // The parent skips rendering this component entirely when no stage is enabled.
  if (!currentStage) return null;

  const stageStates = states[currentStage.id];
  const stageDontMind = dontMind[currentStage.id];
  const OptionIcon = currentStage.optionIcon;
  const optionState = (value: string): SelectionState =>
    stageDontMind ? undefined : stageStates[value];

  return (
    <div className={cn("w-full max-w-md mx-auto", className)}>
      {/* Progress bar */}
      <div className="flex gap-2 mb-8">
        {enabledStages.map((stage, i) => (
          <div
            key={stage.id}
            className={cn(
              "h-1 flex-1 rounded-full transition-all duration-300",
              i <= step ? "bg-primary" : "bg-secondary"
            )}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentStage.id}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3 }}
        >
          <h2 className="text-2xl font-bold text-foreground mb-2">{currentStage.question}</h2>
          <p className="text-sm text-muted-foreground mb-4">{currentStage.subtext}</p>

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

          {currentOptions.loading ? (
            <div className="text-center py-8">
              <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-muted-foreground">Loading options...</p>
            </div>
          ) : currentOptions.options.length === 0 ? (
            <div className="text-center py-8">
              <Globe size={48} className="mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">{currentOptions.emptyMessage}</p>
              <p className="text-xs text-muted-foreground mt-2">
                Try refreshing the cache in the admin panel.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* I don't mind option */}
              <button
                onClick={() => handleDontMind(currentStage.id)}
                className={cn(
                  "w-full p-4 rounded-xl transition-all duration-200 text-left border-2 flex items-center gap-3",
                  stageDontMind
                    ? "glass-card border-primary glow-primary"
                    : "glass-card border-transparent hover:border-muted-foreground/30"
                )}
              >
                <div
                  className={cn(
                    "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                    stageDontMind ? "bg-primary border-primary" : "border-muted-foreground"
                  )}
                >
                  {stageDontMind && <Check size={14} className="text-primary-foreground" />}
                </div>
                <div>
                  <span className="font-medium text-foreground">I don't mind</span>
                  <p className="text-xs text-muted-foreground">{currentStage.dontMindHint}</p>
                </div>
              </button>

              <div
                className={cn(
                  currentStage.layout === "grid"
                    ? "grid grid-cols-2 gap-2"
                    : "flex flex-wrap gap-2",
                  currentStage.scrollOptions && "max-h-48 overflow-y-auto"
                )}
              >
                {currentOptions.options.map((option) => {
                  const state = optionState(option.value);
                  return (
                    <TriStateButton
                      key={option.value}
                      label={option.label}
                      state={state}
                      onToggle={() => handleToggle(currentStage.id, option.value)}
                      variant={currentStage.layout === "grid" ? "card" : "chip"}
                      size={currentStage.layout === "grid" ? "sm" : "default"}
                      icon={
                        OptionIcon ? (
                          <OptionIcon
                            size={16}
                            className={cn(
                              state === true
                                ? "text-white"
                                : state === false
                                ? "text-destructive-foreground"
                                : "text-muted-foreground"
                            )}
                          />
                        ) : undefined
                      }
                    />
                  );
                })}
              </div>
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
          {step === enabledStages.length - 1 ? "Start Swiping" : "Continue"}
          <ChevronRight className="ml-2" size={20} />
        </Button>
      </div>
    </div>
  );
};
