//file: /src/pages/Questions.tsx
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { Logo } from "@/components/Logo";
import { QuestionFlow } from "@/components/QuestionFlow";
import { sessionsApi, plexApi } from "@/lib/api";
import { wsClient } from "@/lib/websocket";
import { getLocalSession } from "@/lib/sessionStore";
import { toast } from "sonner";

const Questions = () => {
  const navigate = useNavigate();
  const { code } = useParams<{ code: string }>();
  const localSession = getLocalSession();
  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [languages, setLanguages] = useState<{ language: string; count: number }[]>([]);
  const [waitingForOthers, setWaitingForOthers] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  
  // Refs for stable references in callbacks
  const isInitializedRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);
  const waitingForOthersRef = useRef(false);
  const pollingIntervalRef = useRef<number | null>(null);
  const hasNavigatedRef = useRef(false);
  const codeRef = useRef(code);

  // Keep refs in sync
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    waitingForOthersRef.current = waitingForOthers;
  }, [waitingForOthers]);

  useEffect(() => {
    codeRef.current = code;
  }, [code]);

  // Navigation helper that prevents double navigation
  const navigateToSwipe = useCallback(() => {
    if (hasNavigatedRef.current) return;
    hasNavigatedRef.current = true;
    
    // Clear polling
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    
    console.log('[Questions] Navigating to swipe page');
    navigate(`/swipe/${codeRef.current}`);
  }, [navigate]);

  // Function to check completion status and navigate if all done
  const checkAndNavigateIfComplete = useCallback(async (sid: string): Promise<boolean> => {
    if (hasNavigatedRef.current) return true;
    
    try {
      console.log('[Questions] Checking completion status for session:', sid);
      const { data: participantsData, error } = await sessionsApi.getParticipants(sid);
      
      if (error) {
        console.error('[Questions] Error fetching participants:', error);
        return false;
      }
      
      if (participantsData?.participants) {
        const total = participantsData.participants.length;
        const completed = participantsData.participants.filter((p: any) => p.questions_completed).length;
        
        console.log(`[Questions] Progress: ${completed}/${total} completed`);
        
        setParticipantCount(total);
        setCompletedCount(completed);
        
        if (completed === total && total > 0) {
          console.log('[Questions] All participants completed!');
          navigateToSwipe();
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error("[Questions] Error checking completion status:", error);
      return false;
    }
  }, [navigateToSwipe]);

  // Start polling as a fallback mechanism
  const startPolling = useCallback((sid: string) => {
    // Clear any existing polling
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }
    
    if (hasNavigatedRef.current) return;
    
    console.log('[Questions] Starting polling fallback...');
    
    pollingIntervalRef.current = window.setInterval(async () => {
      if (hasNavigatedRef.current) {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        return;
      }
      
      if (waitingForOthersRef.current && sessionIdRef.current) {
        await checkAndNavigateIfComplete(sessionIdRef.current);
      }
    }, 2000); // Poll every 2 seconds
  }, [checkAndNavigateIfComplete]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, []);

  // Set up WebSocket listeners early - before session initialization
  useEffect(() => {
    const unsubSessionUpdated = wsClient.on('session_updated', (data) => {
      console.log('[Questions] Received session_updated:', data);
      if (data.status === 'swiping' && codeRef.current) {
        navigateToSwipe();
      }
    });

    const unsubParticipantUpdated = wsClient.on('participant_updated', async (data) => {
      console.log('[Questions] Received participant_updated:', data);
      
      const sid = sessionIdRef.current;
      if (!sid) {
        console.log('[Questions] No session ID yet, skipping check');
        return;
      }
      
      // Check if this update indicates questions_completed
      if (data.questions_completed !== undefined) {
        console.log('[Questions] Participant completed questions, checking all...');
        await checkAndNavigateIfComplete(sid);
      }
    });

    return () => {
      console.log('[Questions] Cleaning up WebSocket listeners');
      unsubSessionUpdated();
      unsubParticipantUpdated();
    };
  }, [navigateToSwipe, checkAndNavigateIfComplete]);

  // Initialize session
  useEffect(() => {
    if (!code || isInitializedRef.current) return;
    isInitializedRef.current = true;

    const initQuestions = async () => {
      try {
        console.log('[Questions] Initializing for code:', code);
        
        // Get session
        const { data: sessionData, error: sessionError } = await sessionsApi.getByCode(code);
        
        if (sessionError || !sessionData?.session) {
          toast.error("Session not found");
          navigate("/");
          return;
        }

        const session = sessionData.session;
        console.log('[Questions] Session loaded:', session.id, 'Status:', session.status);
        
        // Set session ID immediately so WebSocket listeners can use it
        setSessionId(session.id);
        sessionIdRef.current = session.id;

        // Connect WebSocket
        console.log('[Questions] Connecting WebSocket...');
        await wsClient.connect();
        await wsClient.subscribe(session.id, localSession?.participantId);
        console.log('[Questions] WebSocket connected and subscribed');

        // Check if session is already in swiping state
        if (session.status === "swiping") {
          console.log('[Questions] Session already swiping, navigating...');
          navigateToSwipe();
          return;
        }

        // Check current participant status and overall progress
        const { data: participantsData } = await sessionsApi.getParticipants(session.id);
        
        if (participantsData?.participants) {
          const total = participantsData.participants.length;
          const completed = participantsData.participants.filter((p: any) => p.questions_completed).length;
          
          console.log(`[Questions] Initial progress: ${completed}/${total}`);
          
          setParticipantCount(total);
          setCompletedCount(completed);
          
          // Check if all are already done
          if (completed === total && total > 0) {
            console.log('[Questions] All already done, navigating to swipe...');
            navigateToSwipe();
            return;
          }
          
          const currentParticipant = participantsData.participants.find(
            (p: any) => p.id === localSession?.participantId
          );

          if (currentParticipant?.questions_completed) {
            console.log('[Questions] Current user already completed questions, waiting for others');
            setWaitingForOthers(true);
            waitingForOthersRef.current = true;
            // Start polling as fallback
            startPolling(session.id);
          }
        }

        // Fetch available languages
        const { data: langData } = await plexApi.getLanguages();
        if (langData?.languages) {
          setLanguages(langData.languages);
        }

        setLoading(false);
      } catch (error) {
        console.error("[Questions] Error loading questions:", error);
        toast.error("Failed to load questions");
        navigate("/");
      }
    };

    initQuestions();

    return () => {
      wsClient.unsubscribe();
    };
  }, [code, navigate, localSession, navigateToSwipe, startPolling]);

  const handleComplete = async (preferences: any) => {
    if (!localSession?.participantId || !sessionIdRef.current) {
      console.error('[Questions] Missing participantId or sessionId');
      return;
    }

    const sid = sessionIdRef.current;

    try {
      console.log('[Questions] Saving preferences for participant:', localSession.participantId);
      
      // Set waiting state immediately for better UX
      setWaitingForOthers(true);
      waitingForOthersRef.current = true;
      
      // Save preferences and mark as completed
      const { error } = await sessionsApi.updateParticipant(localSession.participantId, {
        preferences,
        questions_completed: true,
      });

      if (error) {
        throw new Error(error);
      }

      console.log('[Questions] Preferences saved successfully');

      // Give a moment for the WebSocket broadcast to propagate
      await new Promise(resolve => setTimeout(resolve, 300));

      // Check if all participants are done
      const allComplete = await checkAndNavigateIfComplete(sid);
      
      // If not all complete, start polling as fallback
      if (!allComplete) {
        console.log('[Questions] Not all complete, starting polling fallback');
        startPolling(sid);
      }
    } catch (error) {
      console.error("[Questions] Error saving preferences:", error);
      toast.error("Failed to save preferences");
      setWaitingForOthers(false);
      waitingForOthersRef.current = false;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="animate-spin text-primary" size={48} />
      </div>
    );
  }

  if (waitingForOthers) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6">
        <Logo size="md" className="justify-center mb-8" />
        <Loader2 className="animate-spin text-primary mb-4" size={48} />
        <h1 className="text-2xl font-bold text-foreground mb-2">All Done!</h1>
        <p className="text-muted-foreground text-center">
          Waiting for others to finish their preferences...
        </p>
        {participantCount > 0 && (
          <div className="mt-4 glass-card rounded-xl p-4">
            <p className="text-sm text-muted-foreground">
              {completedCount} / {participantCount} completed
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      {/* Background */}
      <div className="fixed inset-0 bg-background">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col px-6 py-8 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md mx-auto"
        >
          <div className="flex justify-center mb-6">
            <Logo size="sm" />
          </div>

          <QuestionFlow languages={languages} onComplete={handleComplete} />
        </motion.div>
      </div>
    </div>
  );
};

export default Questions;