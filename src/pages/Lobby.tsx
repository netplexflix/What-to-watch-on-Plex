//file: /src/pages/Lobby.tsx
import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Copy, Users, Play, Loader2, FolderOpen, Check, ChevronDown, ChevronUp } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { SessionCodeDisplay } from "@/components/SessionCodeDisplay";
import { ParticipantsList } from "@/components/ParticipantsList";
import { sessionsApi, plexApi, adminApi } from "@/lib/api";
import { wsClient } from "@/lib/websocket";
import { getLocalSession } from "@/lib/sessionStore";
import { toast } from "sonner";
import { useHaptics } from "@/hooks/useHaptics";
import { cn } from "@/lib/utils";

interface Participant {
  id: string;
  display_name: string;
  is_guest: boolean;
}

interface Collection {
  ratingKey: string;
  title: string;
  thumb: string | null;
  childCount: number;
  libraryKey: string;
  libraryType: string;
}

const Lobby = () => {
  const navigate = useNavigate();
  const { code } = useParams<{ code: string }>();
  const localSession = getLocalSession();
  const haptics = useHaptics();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isHost, setIsHost] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionHostId, setSessionHostId] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<string | null>(null);
  const isInitializedRef = useRef(false);
  
  // Collections state
  const [collectionsEnabled, setCollectionsEnabled] = useState(false);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [collectionsExpanded, setCollectionsExpanded] = useState(false);
  
  // QR Code state
  const [qrEnabled, setQrEnabled] = useState(false);

  useEffect(() => {
    if (!code || isInitializedRef.current) return;
    isInitializedRef.current = true;

    const initLobby = async () => {
      try {
        // Get session
        const { data: sessionData, error: sessionError } = await sessionsApi.getByCode(code);
        
        if (sessionError || !sessionData?.session) {
          toast.error("Session not found");
          navigate("/");
          return;
        }

        const session = sessionData.session;
        setSessionId(session.id);
        setSessionHostId(session.host_user_id);
        setMediaType(session.media_type);

        // Check if user is host
        const userIsHost = localSession?.isHost || session.host_user_id === localSession?.participantId;
        setIsHost(userIsHost);

        // Get participants
        const { data: participantsData } = await sessionsApi.getParticipants(session.id);
        if (participantsData?.participants) {
          setParticipants(participantsData.participants);
        }

        // Check session settings
        const { data: settingsData } = await adminApi.getSessionSettings();
        const collectionsEnabledSetting = settingsData?.settings?.enable_collections ?? false;
        const qrEnabledSetting = settingsData?.settings?.enable_lobby_qr ?? false;
        setCollectionsEnabled(collectionsEnabledSetting);
        setQrEnabled(qrEnabledSetting);

        // If host and collections enabled, fetch collections
        if (userIsHost && collectionsEnabledSetting) {
          setCollectionsLoading(true);
          try {
            const { data: configData } = await adminApi.getConfig();
            const libraryKeys = configData?.config?.libraries || [];
            
            if (libraryKeys.length > 0) {
              const { data: collectionsData } = await plexApi.getCollections(libraryKeys, session.media_type);
              if (collectionsData?.collections) {
                setCollections(collectionsData.collections);
              }
            }
          } catch (err) {
            console.error("Error fetching collections:", err);
          } finally {
            setCollectionsLoading(false);
          }
        }

        // Connect WebSocket FIRST and wait for connection before checking status
        await wsClient.connect();
        await wsClient.subscribe(session.id, localSession?.participantId);

        // Check if session already started AFTER WebSocket is connected
        if (session.status === "questions" || session.status === "swiping") {
          navigate(`/questions/${code}`);
          return;
        }

        setLoading(false);
      } catch (error) {
        console.error("Error loading lobby:", error);
        toast.error("Failed to load lobby");
        navigate("/");
      }
    };

    initLobby();

    return () => {
      wsClient.unsubscribe();
    };
  }, [code, navigate, localSession]);

  // Listen for WebSocket events
  useEffect(() => {
    if (!sessionId) return;

    const unsubParticipantJoined = wsClient.on('participant_joined', (data) => {
      if (data.participant) {
        setParticipants(prev => {
          const exists = prev.some(p => p.id === data.participant.id);
          if (exists) return prev;
          return [...prev, data.participant];
        });
        haptics.light();
        toast.success(`${data.participant.display_name} joined!`);
      }
    });

    const unsubSessionUpdated = wsClient.on('session_updated', (data) => {
      if (data.status === 'questions') {
        navigate(`/questions/${code}`);
      }
    });

    return () => {
      unsubParticipantJoined();
      unsubSessionUpdated();
    };
  }, [sessionId, code, navigate, haptics]);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(code?.toUpperCase() || "");
      setCopied(true);
      haptics.light();
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error("Failed to copy code");
    }
  };

  const handleCopyLink = async () => {
    try {
      const link = `${window.location.origin}/join/${code}`;
      await navigator.clipboard.writeText(link);
      haptics.light();
      toast.success("Invite link copied!");
    } catch (err) {
      toast.error("Failed to copy link");
    }
  };

  const toggleCollection = (ratingKey: string) => {
    haptics.selection();
    setSelectedCollections(prev => 
      prev.includes(ratingKey) 
        ? prev.filter(k => k !== ratingKey)
        : [...prev, ratingKey]
    );
  };

  const handleStart = async () => {
    if (!sessionId) return;
    
    haptics.medium();
    setIsStarting(true);
    try {
      // Save selected collections to session preferences if any are selected
      if (selectedCollections.length > 0) {
        await sessionsApi.update(sessionId, { 
          status: "questions",
          preferences: { selectedCollections }
        });
      } else {
        await sessionsApi.update(sessionId, { status: "questions" });
      }
      
      // Navigation will happen via WebSocket event
    } catch (error) {
      console.error("Error starting session:", error);
      haptics.error();
      toast.error("Failed to start session");
      setIsStarting(false);
    }
  };

  // Generate the invite link for QR code
  const inviteLink = `${window.location.origin}/join/${code}`;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="animate-spin text-primary" size={48} />
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
      <div className="flex-1 flex flex-col items-center justify-center px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <div className="flex justify-center mb-8">
            <Logo size="md" />
          </div>

          <h1 className="text-2xl font-bold text-foreground text-center mb-2">
            Waiting Room
          </h1>
          <p className="text-muted-foreground text-center mb-6">
            Share the code with your friends to join
          </p>

          {/* QR Code (if enabled) */}
          {qrEnabled && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex justify-center mb-6"
            >
              <div className="p-2 bg-white rounded-xl shadow-lg">
                <QRCodeSVG
                  value={inviteLink}
                  size={100}
                  level="M"
                  includeMargin={false}
                  bgColor="#ffffff"
                  fgColor="#000000"
                />
              </div>
            </motion.div>
          )}

          {/* Session Code */}
          <SessionCodeDisplay 
            code={code || ""} 
            onCopy={handleCopyCode} 
            copied={copied} 
            className="my-6"
          />

          {/* Copy Link Button */}
          <Button
            variant="outline"
            onClick={handleCopyLink}
            className="w-full mb-6"
          >
            <Copy size={18} className="mr-2" />
            Copy Invite Link
          </Button>

          {/* Collections Selector (Host only, if enabled) */}
          {isHost && collectionsEnabled && collections.length > 0 && (
            <div className="glass-card rounded-xl p-4 mb-6">
              <button
                onClick={() => {
                  haptics.selection();
                  setCollectionsExpanded(!collectionsExpanded);
                }}
                className="w-full flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <FolderOpen size={20} className="text-primary" />
                  <h2 className="font-semibold text-foreground">
                    Collections {selectedCollections.length > 0 && `(${selectedCollections.length})`}
                  </h2>
                </div>
                {collectionsExpanded ? (
                  <ChevronUp size={20} className="text-muted-foreground" />
                ) : (
                  <ChevronDown size={20} className="text-muted-foreground" />
                )}
              </button>
              
              {collectionsExpanded && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-4"
                >
                  <p className="text-xs text-muted-foreground mb-3">
                    {selectedCollections.length === 0 
                      ? "No collections selected - all items will be shown"
                      : "Only items from selected collections will be shown"}
                  </p>
                  
                  {collectionsLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="animate-spin text-primary" size={24} />
                    </div>
                  ) : (
                    <div className="max-h-48 overflow-y-auto space-y-2">
                      {collections.map((collection) => (
                        <button
                          key={collection.ratingKey}
                          onClick={() => toggleCollection(collection.ratingKey)}
                          className={cn(
                            "w-full p-3 rounded-lg text-left transition-all duration-200 flex items-center gap-3",
                            selectedCollections.includes(collection.ratingKey)
                              ? "bg-primary/20 border border-primary"
                              : "bg-secondary hover:bg-secondary/80"
                          )}
                        >
                          {collection.thumb ? (
                            <img 
                              src={collection.thumb} 
                              alt={collection.title}
                              className="w-10 h-10 rounded object-cover"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
                              <FolderOpen size={16} className="text-muted-foreground" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-foreground truncate">{collection.title}</p>
                            <p className="text-xs text-muted-foreground">{collection.childCount} items</p>
                          </div>
                          {selectedCollections.includes(collection.ratingKey) && (
                            <Check size={18} className="text-primary flex-shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </div>
          )}

          {/* Participants */}
          <div className="glass-card rounded-xl p-4 mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Users size={20} className="text-primary" />
              <h2 className="font-semibold text-foreground">
                Participants ({participants.length})
              </h2>
            </div>
            <ParticipantsList participants={participants} hostId={sessionHostId} />
          </div>

          {/* Start Button (Host only) */}
          {isHost && (
            <Button
              onClick={handleStart}
              disabled={participants.length < 1 || isStarting}
              className="w-full h-14 text-lg font-semibold bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {isStarting ? (
                <>
                  <Loader2 className="mr-2 animate-spin" size={20} />
                  Starting...
                </>
              ) : (
                <>
                  <Play size={20} className="mr-2" />
                  Start Session
                </>
              )}
            </Button>
          )}

          {!isHost && (
            <div className="text-center">
              <p className="text-muted-foreground">
                Waiting for host to start the session...
              </p>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default Lobby;