import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AudioSession } from '@livekit/react-native';
import { LogLevel, Room, RoomEvent } from 'livekit-client';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { STORAGE_KEYS } from '../../src/constants';
import { Colors, Typography, Spacing, BorderRadius } from '../../src/constants/theme';
import { useAuthStore } from '../../src/store/authStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { endRoom, getRoomStatus, leaveParticipant, toShortCode, updateParticipantSettings } from '../../src/services/roomService';
import { friendlyErrorMessage } from '../../src/services/errors';
import { saveHistoryLocal, syncHistory, type ConversationHistory } from '../../src/services/historyService';
import type { HistoryItem } from '../../src/types/api';

type TimelineEvent = {
  id: string;
  type: string;
  utteranceId?: string;
  speakerIdentity?: string;
  targetIdentity?: string;
  sourceLang?: string;
  targetLang?: string;
  text?: string;
  translatedText?: string;
  timestamp: string;
};

type RoomLifecycleEvent = {
  type: 'participant.left' | 'room.closed';
  room_id?: string;
  participant_identity?: string;
  role?: 'host' | 'guest';
  timestamp?: string;
};

type HistorySaveChoice = 'none' | 'local' | 'cloud';

function parseDataChannelEvent(input: string): TimelineEvent | null {
  let parsed: any;
  try {
    parsed = JSON.parse(input);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;
  if (!parsed.type || !parsed.timestamp) return null;
  if (parsed.type !== 'translation.final') return null;

  return {
    id: `${parsed.type}:${parsed.timestamp}:${parsed.utterance_id ?? 'system'}`,
    type: parsed.type,
    utteranceId: parsed.utterance_id,
    speakerIdentity: parsed.speaker_identity,
    targetIdentity: parsed.details?.target_identity,
    sourceLang: parsed.source_lang,
    targetLang: parsed.target_lang,
    text: parsed.text,
    translatedText: parsed.translated_text,
    timestamp: parsed.timestamp,
  };
}

function parseRoomLifecycleEvent(input: string): RoomLifecycleEvent | null {
  let parsed: any;
  try {
    parsed = JSON.parse(input);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;
  if (parsed.type !== 'participant.left' && parsed.type !== 'room.closed') return null;
  return parsed as RoomLifecycleEvent;
}

function eventColor(type: string) {
  if (type === 'translation.final') return '#00D084';
  if (type === 'subtitle.final') return '#42C9FF';
  if (type === 'warning') return '#F3C148';
  if (type === 'error') return '#FF6B6B';
  return 'rgba(255,255,255,0.5)';
}

const WORKER_IDENTITY_PREFIX = 'ai_worker_';

function remoteTrackName(publication: any, track?: any): string {
  return String(
    publication?.trackName ??
      publication?.name ??
      publication?.track?.name ??
      track?.name ??
      ''
  );
}

function isAudioPublication(publication: any, track?: any): boolean {
  const kind = String(publication?.kind ?? track?.kind ?? '').toLowerCase();
  const source = String(publication?.source ?? '').toLowerCase();
  return kind === 'audio' || source === 'microphone';
}

function isWorkerParticipant(participant: any): boolean {
  const identity = String(participant?.identity ?? '');
  return identity.startsWith(WORKER_IDENTITY_PREFIX);
}

function workerTrackTargetIdentity(publication: any, track?: any): string | null {
  const name = remoteTrackName(publication, track);
  const prefix = 'translated_to_';
  return name.startsWith(prefix) ? name.slice(prefix.length) : null;
}

function encodeDataPayload(value: unknown): Uint8Array {
  const text = JSON.stringify(value);
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text);
  }
  return Uint8Array.from(Array.from(text).map((char) => char.charCodeAt(0)));
}

function buildLocalConversationHistory(input: {
  timeline: TimelineEvent[];
  sessionId: string;
  roomId: string;
  roomCode: string;
}): ConversationHistory | null {
  const ordered = [...input.timeline]
    .filter((item) => item.type === 'translation.final' && (item.text || item.translatedText))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  if (!ordered.length) return null;

  const items: HistoryItem[] = ordered.map((item, index) => ({
    id: -1 - index,
    room_id: input.roomId,
    session_id: input.sessionId,
    utterance_id: item.utteranceId ?? `${input.sessionId}:${index}`,
    speaker_identity: item.speakerIdentity ?? 'unknown',
    source_lang: item.sourceLang ?? '',
    target_lang: item.targetLang ?? '',
    source_text: item.text ?? null,
    translated_text: item.translatedText ?? null,
    event_type: item.type,
    created_at: item.timestamp,
  }));

  return {
    id: input.sessionId,
    sessionId: input.sessionId,
    roomId: input.roomId,
    title: `Phòng ${input.roomCode} - ${new Date(ordered[0].timestamp).toLocaleString()}`,
    date: new Date(ordered[0].timestamp).toLocaleString(),
    lineCount: items.length,
    items,
  };
}

export default function CallScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const roomContext = useAuthStore((s) => s.roomContext);
  const user = useAuthStore((s) => s.user);
  const livekitUrl = useAuthStore((s) => s.livekitUrl);
  const setRoomContext = useAuthStore((s) => s.setRoomContext);

  const roomRef = useRef<Room | null>(null);
  const micOnRef = useRef(false);
  const isClosingRef = useRef(false);
  const remoteRoomClosedRef = useRef(false);
  const timelineRef = useRef<TimelineEvent[]>([]);
  const timelineListRef = useRef<FlatList<TimelineEvent> | null>(null);
  const saveLocalHistoryRef = useRef<() => Promise<boolean>>(async () => false);
  const localWorkerTrackRef = useRef<any | null>(null);
  const localParticipantIdentityRef = useRef(roomContext?.participantIdentity ?? '');
  const [status, setStatus] = useState('Đang chờ');
  const [connection, setConnection] = useState('mất kết nối');
  const [micOn, setMicOn] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [sourceLanguage, setSourceLanguage] = useState<'vi' | 'en'>(useSettingsStore(s => s.myLang) as 'vi' | 'en');
  const [busy, setBusy] = useState<'connect' | 'leave' | null>('connect');
  const [error, setError] = useState<string | null>(null);
  const [peerStatus, setPeerStatus] = useState<'waiting' | 'connected' | 'left' | 'closed'>('waiting');
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const [timelineViewMode, setTimelineViewMode] = useState<'chat' | 'compact'>('chat');
  const [isTimelinePinnedToBottom, setIsTimelinePinnedToBottom] = useState(true);
  const [localParticipantIdentity, setLocalParticipantIdentity] = useState(
    roomContext?.participantIdentity ?? ''
  );
  const timelineData = useMemo(() => [...timeline].reverse(), [timeline]);
  const effectiveParticipantIdentity = localParticipantIdentity || roomContext?.participantIdentity || '';

  const roomId = id ?? roomContext?.roomId ?? '';
  const roomCode = roomContext?.roomShortCode ?? (roomId ? toShortCode(roomId) : '');
  const roomTitle = roomContext?.roomTitle ?? `Phòng ${roomCode || roomId.slice(-6) || 'call'}`;
  const roomCodeLabel = roomCode ? `Mã phòng ${roomCode}` : 'Không có mã phòng';
  const workerSessionNotice =
    roomContext?.workerSessionState && roomContext.workerSessionState !== 'started'
      ? 'Dịch tự động đang tạm thời chưa sẵn sàng. Cuộc gọi vẫn hoạt động, nhưng phần AI có thể cần thử lại.'
      : null;
  const liveStatus =
    peerStatus === 'connected'
      ? 'Đã kết nối'
      : peerStatus === 'left'
        ? 'Khách đã rời'
        : peerStatus === 'closed'
          ? 'Đã kết thúc'
          : roomContext?.role === 'host'
            ? 'Đang chờ khách'
            : 'Đang kết nối';

  const decodePayload = useCallback((payload: Uint8Array): string => {
    if (typeof TextDecoder !== 'undefined') {
      return new TextDecoder().decode(payload);
    }

    let output = '';
    const chunkSize = 4096;
    for (let i = 0; i < payload.length; i += chunkSize) {
      const chunk = payload.subarray(i, i + chunkSize);
      output += String.fromCharCode(...Array.from(chunk));
    }
    return output;
  }, []);

  const setTrackVolume = useCallback((track: any, volume: number) => {
    try {
      if (typeof track?.setVolume === 'function') {
        track.setVolume(volume);
      }
    } catch {
      // ignore per-track failures
    }
  }, []);

  useEffect(() => {
    if (!roomContext || !roomId) {
      router.replace('/(tabs)');
      return;
    }
    localParticipantIdentityRef.current = roomContext.participantIdentity;
    setLocalParticipantIdentity(roomContext.participantIdentity);

    let canceled = false;
    let roomStatusTimer: ReturnType<typeof setInterval> | null = null;
    const handlers: Array<{ event: RoomEvent; fn: (...args: any[]) => void }> = [];
    const safeSetMicrophoneEnabled = async (room: Room, enabled: boolean) => {
      try {
        if (isClosingRef.current) return false;
        await room.localParticipant.setMicrophoneEnabled(enabled);
        setMicOn(enabled);
        micOnRef.current = enabled;
        return true;
      } catch {
        return false;
      }
    };

    const connect = async () => {
      setError(null);
      isClosingRef.current = false;
      if (!roomContext.livekitToken) {
        setError(`Thiếu LiveKit token: ${roomContext.livekitTokenStatus}`);
        setBusy(null);
        return;
      }
      if (!livekitUrl) {
        setError('Cấu hình máy chủ cuộc gọi đang thiếu. Vui lòng kiểm tra bản build hoặc cấu hình triển khai.');
        setBusy(null);
        return;
      }

      try {
        setStatus('Đang xin quyền micro...');
        const permission = await Audio.requestPermissionsAsync();
        if (!permission.granted) {
          throw new Error('Không có quyền micro');
        }

        // Đảm bảo đường âm thanh ở chế độ song công trước khi kết nối LiveKit.
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: false,
          playThroughEarpieceAndroid: false,
        });

        await AudioSession.startAudioSession();
        const room = new Room();
        roomRef.current = room;

        const onConnectionStateChanged = (next: unknown) => {
          setConnection(String(next));
        };

        const onDataReceived = (
          payload: Uint8Array,
          _participant: unknown,
          _kind: unknown,
          topic?: string
        ) => {
          const text = decodePayload(payload);
          if (topic === 'room.events') {
            const roomEvent = parseRoomLifecycleEvent(text);
            if (!roomEvent) return;
            if (roomEvent.type === 'participant.left' && roomEvent.participant_identity !== localParticipantIdentityRef.current) {
              setPeerStatus('left');
              setStatus('Đối tác đã rời phòng.');
            }
          if (roomEvent.type === 'room.closed' && roomContext.role === 'guest' && !remoteRoomClosedRef.current) {
            remoteRoomClosedRef.current = true;
            setPeerStatus('closed');
            void saveLocalHistoryRef.current();
              Alert.alert('Phòng đã kết thúc', 'Host đã kết thúc phòng gọi.', [
                {
                  text: 'OK',
                  onPress: () => {
                    void setRoomContext(null);
                    router.replace('/(tabs)');
                  },
                },
              ]);
            }
            return;
          }

          if (topic && topic !== 'translation.events') return;
          const parsed = parseDataChannelEvent(text);
          if (!parsed) return;

          setTimeline((current) => {
            const next = [parsed, ...current].slice(0, 250);
            timelineRef.current = next;
            return next;
          });
        };

        const isLocalTargetWorkerTrack = (publication: any, track?: any) =>
          workerTrackTargetIdentity(publication, track) === localParticipantIdentityRef.current;

        const setPublicationSubscribed = (publication: any, subscribed: boolean) => {
          try {
            if (typeof publication?.setSubscribed === 'function') {
              publication.setSubscribed(subscribed);
            }
          } catch {
            // ignore per-publication subscription failures
          }
        };

        const configureRemotePublication = (publication: any, participant: any) => {
          const shouldSubscribe = isWorkerParticipant(participant);
          if (shouldSubscribe || isAudioPublication(publication, publication?.track)) {
            setPublicationSubscribed(publication, shouldSubscribe);
          }
          const track = publication?.track;
          if (!track) return;
          if (isLocalTargetWorkerTrack(publication, track)) {
            localWorkerTrackRef.current = track;
            setTrackVolume(track, 1);
          } else {
            if (localWorkerTrackRef.current === track) {
              localWorkerTrackRef.current = null;
            }
            setTrackVolume(track, 0);
          }
        };

        const onTrackPublished = (publication: any, participant: any) => {
          configureRemotePublication(publication, participant);
        };

        const onTrackSubscribed = (track: any, publication: any, participant: any) => {
          if (isLocalTargetWorkerTrack(publication, track)) {
            localWorkerTrackRef.current = track;
            setTrackVolume(track, 1);
          } else {
            setPublicationSubscribed(publication, false);
            if (localWorkerTrackRef.current === track) {
              localWorkerTrackRef.current = null;
            }
            setTrackVolume(track, 0);
          }
        };

        const onTrackUnsubscribed = (track: any, _publication: any, participant: any) => {
          const identity = String(participant?.identity ?? '');
          if (!identity.startsWith(WORKER_IDENTITY_PREFIX)) return;
          if (localWorkerTrackRef.current === track) {
            localWorkerTrackRef.current = null;
          }
        };

        const onParticipantConnected = (participant: any) => {
          const identity = String(participant?.identity ?? '');
          if (identity && !identity.startsWith(WORKER_IDENTITY_PREFIX)) {
            setPeerStatus('connected');
          }
        };

        const onParticipantDisconnected = (participant: any) => {
          const identity = String(participant?.identity ?? '');
          if (identity && !identity.startsWith(WORKER_IDENTITY_PREFIX)) {
            setPeerStatus(roomContext.role === 'host' ? 'left' : 'closed');
            if (roomContext.role === 'guest' && !remoteRoomClosedRef.current) {
              void (async () => {
                try {
                  const data = await getRoomStatus(roomContext.roomId);
                  if (canceled) return;
                  if (data.room.status !== 'closed') {
                    setPeerStatus('waiting');
                    setStatus('Host tạm mất kết nối. Đang chờ host quay lại...');
                    return;
                  }
                } catch {
                  // Keep guest in room on transient status failures.
                  setPeerStatus('waiting');
                  setStatus('Host tạm mất kết nối. Đang chờ host quay lại...');
                  return;
                }
                remoteRoomClosedRef.current = true;
                void saveLocalHistoryRef.current();
                Alert.alert('Phòng đã kết thúc', 'Host đã rời phòng hoặc kết thúc phòng gọi.', [
                  {
                    text: 'OK',
                    onPress: () => {
                      void setRoomContext(null);
                      router.replace('/(tabs)');
                    },
                  },
                ]);
              })();
            }
          }
        };

        room.on(RoomEvent.ConnectionStateChanged, onConnectionStateChanged);
        room.on(RoomEvent.DataReceived, onDataReceived);
        room.on(RoomEvent.ParticipantConnected, onParticipantConnected);
        room.on(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
        room.on(RoomEvent.TrackPublished, onTrackPublished);
        room.on(RoomEvent.TrackSubscribed, onTrackSubscribed);
        room.on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
        handlers.push(
          { event: RoomEvent.ConnectionStateChanged, fn: onConnectionStateChanged },
          { event: RoomEvent.DataReceived, fn: onDataReceived },
          { event: RoomEvent.ParticipantConnected, fn: onParticipantConnected },
          { event: RoomEvent.ParticipantDisconnected, fn: onParticipantDisconnected },
          { event: RoomEvent.TrackPublished, fn: onTrackPublished },
          { event: RoomEvent.TrackSubscribed, fn: onTrackSubscribed },
          { event: RoomEvent.TrackUnsubscribed, fn: onTrackUnsubscribed }
        );

        setStatus('Đang kết nối LiveKit...');
        await room.connect(livekitUrl, roomContext.livekitToken, {
          logLevel: LogLevel.error,
          autoSubscribe: false,
        } as any);
        if (canceled) return;
        const connectedIdentity = String(
          (room as any).localParticipant?.identity ?? roomContext.participantIdentity
        );
        localParticipantIdentityRef.current = connectedIdentity;
        setLocalParticipantIdentity(connectedIdentity);
        const hasPeerAlready = Array.from(room.remoteParticipants.values()).some((participant: any) => {
          const identity = String(participant?.identity ?? '');
          return identity && !identity.startsWith(WORKER_IDENTITY_PREFIX);
        });
        if (hasPeerAlready) {
          setPeerStatus('connected');
        }
        if (localWorkerTrackRef.current) {
          setTrackVolume(localWorkerTrackRef.current, 0);
        }
        const pollRoomStatus = async () => {
          try {
            const data = await getRoomStatus(roomContext.roomId);
            if (canceled) return;
            if (data.room.status === 'closed') {
              setPeerStatus('closed');
              if (roomContext.role === 'guest' && !remoteRoomClosedRef.current) {
                remoteRoomClosedRef.current = true;
                Alert.alert('Phòng đã kết thúc', 'Host đã kết thúc phòng gọi.', [
                  {
                    text: 'OK',
                    onPress: () => {
                      void setRoomContext(null);
                      router.replace('/(tabs)');
                    },
                  },
                ]);
              }
              return;
            }
            if (roomContext.role === 'host') {
              setPeerStatus(data.room.guestParticipantId ? 'connected' : 'waiting');
            }
          } catch {
            // transient status failures should not interrupt the call
          }
        };
        void pollRoomStatus();
        roomStatusTimer = setInterval(() => {
          void pollRoomStatus();
        }, 2000);
        // Subscribe only to the worker track carrying translated audio for this participant.
        for (const participant of room.remoteParticipants.values()) {
          const publications = (participant as any)?.trackPublications;
          if (!publications?.values) continue;
          for (const publication of publications.values()) {
            configureRemotePublication(publication, participant);
          }
        }
        // Some physical devices need a short settle delay before mic unmute actually captures voice.
        await new Promise((resolve) => setTimeout(resolve, 180));
        const micOk = await safeSetMicrophoneEnabled(room, true);
        if (!micOk) {
          setStatus('Đã kết nối (thử lại cấu hình mic)');
        }
        setSourceLanguage(roomContext.role === 'host' ? 'vi' : 'en');
        setStatus('Đã kết nối (micro bật)');
      } catch (e) {
        setError(friendlyErrorMessage(e));
        setStatus('Kết nối thất bại');
      } finally {
        if (!canceled) {
          setBusy(null);
        }
      }
    };

    void connect();

    return () => {
      canceled = true;
      isClosingRef.current = true;
      if (roomStatusTimer) clearInterval(roomStatusTimer);
      localWorkerTrackRef.current = null;
      const room = roomRef.current;
      roomRef.current = null;
      if (room) {
        for (const item of handlers) {
          (room as any).off(item.event, item.fn);
        }
        void room.disconnect();
      }
      void AudioSession.stopAudioSession();
    };
  }, [decodePayload, livekitUrl, roomContext, roomId, setTrackVolume]);

  const toggleMic = async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !micOn;
    try {
      if (isClosingRef.current) return;
      await room.localParticipant.setMicrophoneEnabled(next);
      setMicOn(next);
      micOnRef.current = next;
    } catch (e) {
      setError(friendlyErrorMessage(e));
    }
  };

  const toggleSpeaker = async () => {
    const next = !speakerOn;
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: !next,
    });
    setSpeakerOn(next);
  };

  const toggleLanguage = async () => {
    if (!roomContext) return;
    const next = sourceLanguage === 'vi' ? 'en' : 'vi';
    const target = next === 'vi' ? 'en' : 'vi';
    try {
      await updateParticipantSettings(roomContext.roomId, roomContext.participantId, {
        sourceLanguage: next,
        targetLanguage: target,
      });
      setSourceLanguage(next);
    } catch (e) {
      setError(friendlyErrorMessage(e));
    }
  };

  const copyRoomCode = async () => {
    if (!roomCode) return;
    await Clipboard.setStringAsync(roomCode);
    setSaveNotice(`Đã sao chép ${roomCodeLabel.toLowerCase()}`);
  };

  const scrollTimelineToLatest = useCallback((animated: boolean) => {
    timelineListRef.current?.scrollToEnd({ animated });
    setIsTimelinePinnedToBottom(true);
  }, []);

  const onTimelineScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceToBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
    setIsTimelinePinnedToBottom(distanceToBottom < 32);
  }, []);

  const publishRoomEvent = async (event: RoomLifecycleEvent) => {
    try {
      await roomRef.current?.localParticipant.publishData(
        encodeDataPayload(event),
        {
          reliable: true,
          topic: 'room.events',
        } as any
      );
    } catch {
      // best-effort only
    }
  };

  const saveConversationHistoryIfNeeded = async () => {
    if (!roomContext || !user) return false;
    const history = buildLocalConversationHistory({
      timeline: timelineRef.current,
      sessionId: roomContext.sessionId,
      roomId: roomContext.roomId,
      roomCode,
    });
    if (!history) return false;

    const getSavedHistoryPreference = async (): Promise<HistorySaveChoice | null> => {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.HISTORY_SAVE_PREFERENCE);
      if (raw === 'none' || raw === 'local' || raw === 'cloud') return raw;
      return null;
    };

    const askRememberPreference = (): Promise<boolean> =>
      new Promise((resolve) => {
        Alert.alert('Ghi nhớ lựa chọn?', 'Lần sau tự áp dụng lựa chọn này.', [
          { text: 'Không', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Có', onPress: () => resolve(true) },
        ]);
      });

    const askSaveChoice = (): Promise<HistorySaveChoice> =>
      new Promise((resolve) => {
        const buttons =
          user.type === 'registered'
            ? [
                { text: 'Không lưu', style: 'destructive' as const, onPress: () => resolve('none') },
                { text: 'Lưu vào máy', onPress: () => resolve('local') },
                { text: 'Lưu lên đám mây', onPress: () => resolve('cloud') },
              ]
            : [
                { text: 'Không lưu', style: 'destructive' as const, onPress: () => resolve('none') },
                { text: 'Lưu vào máy', onPress: () => resolve('local') },
              ];
        Alert.alert('Lưu lịch sử cuộc gọi', 'Bạn muốn lưu lịch sử cuộc gọi ở đâu?', buttons);
      });

    let choice = await getSavedHistoryPreference();
    if (choice === 'cloud' && user.type !== 'registered') {
      choice = null;
    }

    if (!choice) {
      choice = await askSaveChoice();
      const remember = await askRememberPreference();
      if (remember) {
        await AsyncStorage.setItem(STORAGE_KEYS.HISTORY_SAVE_PREFERENCE, choice);
      }
    }

    if (choice === 'none') {
      setSaveNotice('Bạn đã chọn không lưu lịch sử cuộc gọi.');
      return false;
    }

    if (choice === 'cloud' && user?.type === 'registered') {
      await syncHistory(history.items);
      setSaveNotice('Đã đồng bộ cuộc trò chuyện lên lịch sử đám mây.');
      return true;
    }

    await saveHistoryLocal(history);
    setSaveNotice('Đã lưu cuộc trò chuyện vào lịch sử cục bộ.');
    return true;
  };
  saveLocalHistoryRef.current = saveConversationHistoryIfNeeded;

  const leave = async () => {
    if (!roomContext) return;
    setBusy('leave');
    setError(null);
    try {
      try {
        await saveConversationHistoryIfNeeded();
      } catch (saveError) {
        console.warn('[history] save failed', saveError);
        setSaveNotice(
          user?.type === 'registered'
            ? 'Chưa đồng bộ được lịch sử đám mây. Cuộc gọi vẫn sẽ kết thúc bình thường.'
            : 'Chưa lưu được lịch sử cục bộ. Cuộc gọi vẫn sẽ kết thúc bình thường.'
        );
      }
      if (roomContext.role === 'host') {
        await publishRoomEvent({
          type: 'room.closed',
          room_id: roomContext.roomId,
          participant_identity: localParticipantIdentityRef.current || roomContext.participantIdentity,
          role: 'host',
          timestamp: new Date().toISOString(),
        });
        await endRoom(roomContext.roomId);
      } else {
        await publishRoomEvent({
          type: 'participant.left',
          room_id: roomContext.roomId,
          participant_identity: localParticipantIdentityRef.current || roomContext.participantIdentity,
          role: 'guest',
          timestamp: new Date().toISOString(),
        });
        await leaveParticipant(roomContext.roomId, roomContext.participantId);
      }
    } catch (e) {
      setError(friendlyErrorMessage(e));
    } finally {
      try {
        await roomRef.current?.disconnect();
      } catch {
        // ignore
      }
      roomRef.current = null;
      await setRoomContext(null);
      setBusy(null);
      router.replace('/(tabs)');
    }
  };

  if (!roomContext) {
    return null;
  }

  return (
    <LinearGradient
      colors={['#3a5068', '#4a7080', '#b8906a', '#d4957a']}
      locations={[0, 0.35, 0.7, 1]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <View style={styles.headerBlock}>
            <View style={styles.headerCard}>
              <View style={styles.roomHeaderRow}>
                <View style={styles.titleBlock}>
                  <Text style={styles.title} numberOfLines={1}>{roomTitle}</Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {roomContext.participantDisplayName} · {roomContext.role === 'host' ? 'Chủ phòng' : 'Khách'}
                  </Text>
                  <View style={styles.badgeRow}>
                    <View style={styles.badgeSoft}>
                    <Text style={styles.badgeSoftText}>{liveStatus}</Text>
                    </View>
                    <View style={styles.badgeGhost}>
                      <Text style={styles.badgeGhostText}>{sourceLanguage === 'vi' ? 'Việt → Anh' : 'Anh → Việt'}</Text>
                    </View>
                  </View>
                </View>
                <Pressable
                  style={styles.collapseBtn}
                  onPress={() => setHeaderCollapsed((current) => !current)}
                  disabled={busy !== null}
                >
                  <Ionicons name={headerCollapsed ? 'chevron-down' : 'chevron-up'} size={18} color={Colors.white} />
                </Pressable>
              </View>
              {!headerCollapsed && <View style={styles.roomCodePanel}>
                <View style={styles.roomCodeTextBlock}>
                  <Text style={styles.roomCodeLabel}>Mã phòng</Text>
                  <Text style={styles.roomCodeValue} numberOfLines={1}>{roomCode || 'Chưa có mã'}</Text>
                  <Text style={styles.roomCodeHint}>
                    Gửi mã này cho người kia để vào lại phòng nếu mất kết nối.
                  </Text>
                </View>
                <Pressable style={styles.roomCodeAction} onPress={copyRoomCode} disabled={!roomCode}>
                  <Ionicons name="copy" size={16} color={Colors.white} />
                  <Text style={styles.roomCodeActionText}>Sao chép</Text>
                </Pressable>
              </View>}
              <View style={styles.peerStatusRow}>
                <View
                  style={[
                    styles.peerDot,
                    peerStatus === 'connected' && { backgroundColor: '#00D084' },
                    peerStatus === 'left' && { backgroundColor: '#F3C148' },
                    peerStatus === 'closed' && { backgroundColor: '#FF6B6B' },
                  ]}
                />
                <Text style={styles.meta}>
                  {peerStatus === 'connected'
                    ? 'Người kia đang trong phòng'
                    : peerStatus === 'left'
                      ? 'Đối tác đã rời phòng'
                      : peerStatus === 'closed'
                        ? 'Phòng đã kết thúc'
                        : roomContext.role === 'host'
                          ? 'Đang chờ khách vào phòng'
                          : 'Đang kết nối với host'}
                </Text>
              </View>
              <View style={styles.roomStatusStrip}>
                <Text style={styles.roomStatusText}>Trạng thái: {status}</Text>
                <Text style={styles.roomStatusText}>Kết nối: {connection}</Text>
              </View>
            </View>

            {!headerCollapsed && <View style={styles.controlsGrid}>
              <Pressable style={styles.controlBtn} onPress={toggleMic} disabled={busy !== null}>
                <Ionicons name={micOn ? 'mic-off-outline' : 'mic-outline'} size={18} color="#07242F" />
                <Text style={styles.controlText} numberOfLines={1}>{micOn ? 'Tắt mic' : 'Bật mic'}</Text>
              </Pressable>
              <Pressable style={styles.controlBtn} onPress={toggleSpeaker} disabled={busy !== null}>
                <Ionicons name={speakerOn ? 'volume-high-outline' : 'volume-mute-outline'} size={18} color="#07242F" />
                <Text style={styles.controlText} numberOfLines={1}>{speakerOn ? 'Loa bật' : 'Loa tắt'}</Text>
              </Pressable>
              <Pressable style={styles.controlBtn} onPress={toggleLanguage} disabled={busy !== null}>
                <Ionicons name="language-outline" size={18} color="#07242F" />
                <Text style={styles.controlText} numberOfLines={1}>Ngôn ngữ: {sourceLanguage === 'vi' ? 'Việt' : 'Anh'}</Text>
              </Pressable>
              <Pressable style={styles.dangerBtn} onPress={leave} disabled={busy !== null}>
                {busy === 'leave' ? (
                  <ActivityIndicator color="#2B0303" />
                ) : (
                  <>
                    <Ionicons name={roomContext.role === 'host' ? 'stop-circle-outline' : 'exit-outline'} size={18} color="#2A0404" />
                    <Text style={styles.dangerText} numberOfLines={1}>{roomContext.role === 'host' ? 'Kết thúc phòng' : 'Rời phòng'}</Text>
                  </>
                )}
              </Pressable>
            </View>}

            {!headerCollapsed && !!busy && busy === 'connect' && (
              <View style={styles.busy}>
                <ActivityIndicator color={Colors.primaryLight} />
                <Text style={styles.meta}>Đang kết nối cuộc gọi...</Text>
              </View>
            )}

            {!headerCollapsed && !!error && <Text style={styles.error}>{error}</Text>}
            {!headerCollapsed && !!saveNotice && <Text style={styles.notice}>{saveNotice}</Text>}
            {!headerCollapsed && !!workerSessionNotice && <Text style={styles.notice}>{workerSessionNotice}</Text>}
            {!headerCollapsed && connection !== 'connected' && (
              <Text style={styles.meta}>Trạng thái kết nối lại: {connection}</Text>
            )}
          </View>

          <View style={styles.timelineFrame}>
            <View style={styles.timelineFrameHeader}>
              <View>
                <Text style={styles.subtitle}>Nội dung dịch</Text>
                <Text style={styles.timelineHint}>Bên phải là bạn, bên trái là người kia.</Text>
              </View>
              <View style={styles.viewModeToggle}>
                <Pressable
                  style={[styles.viewModeBtn, timelineViewMode === 'chat' && styles.viewModeBtnActive]}
                  onPress={() => setTimelineViewMode('chat')}
                >
                  <Text style={[styles.viewModeText, timelineViewMode === 'chat' && styles.viewModeTextActive]}>Chat</Text>
                </Pressable>
                <Pressable
                  style={[styles.viewModeBtn, timelineViewMode === 'compact' && styles.viewModeBtnActive]}
                  onPress={() => setTimelineViewMode('compact')}
                >
                  <Text style={[styles.viewModeText, timelineViewMode === 'compact' && styles.viewModeTextActive]}>Gọn</Text>
                </Pressable>
              </View>
            </View>

            <FlatList
              ref={timelineListRef}
              data={timelineData}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.timelineListContent}
              onContentSizeChange={() => {
                if (isTimelinePinnedToBottom) {
                  timelineListRef.current?.scrollToEnd({ animated: false });
                }
              }}
              onScroll={onTimelineScroll}
              scrollEventThrottle={16}
              renderItem={({ item }) => {
                const isMine = item.speakerIdentity === effectiveParticipantIdentity;
                if (timelineViewMode === 'compact') {
                  const speakerLabel = isMine ? 'Bạn' : 'Người kia';
                  return (
                    <View style={styles.compactRow}>
                      <Text style={styles.compactMeta}>
                        {new Date(item.timestamp).toLocaleTimeString()} · {speakerLabel}
                      </Text>
                      <Text style={styles.compactText} numberOfLines={2}>
                        {item.translatedText || item.text || '...'}
                      </Text>
                    </View>
                  );
                }
                return (
                  <View style={[styles.messageRow, isMine ? styles.messageRowMine : styles.messageRowOther]}>
                    <View style={[styles.messageBubble, isMine ? styles.messageBubbleMine : styles.messageBubbleOther]}>
                      <View style={styles.messageMetaRow}>
                        <Text style={styles.messageSpeaker}>{isMine ? 'Bạn' : 'Người kia'}</Text>
                        <Text style={styles.messageMeta}>
                          {new Date(item.timestamp).toLocaleTimeString()} · {item.sourceLang?.toUpperCase()} → {item.targetLang?.toUpperCase()}
                        </Text>
                      </View>
                      {!!item.text && <Text style={styles.messageSource}>Gốc: {item.text}</Text>}
                      {!!item.translatedText && <Text style={styles.messageTranslated}>Dịch: {item.translatedText}</Text>}
                    </View>
                  </View>
                );
              }}
              ListEmptyComponent={<Text style={styles.empty}>Bắt đầu nói để dịch...</Text>}
            />
            {!isTimelinePinnedToBottom && (
              <Pressable style={styles.latestBtn} onPress={() => scrollTimelineToLatest(true)}>
                <Ionicons name="arrow-down" size={14} color={Colors.white} />
                <Text style={styles.latestBtnText}>Mới nhất</Text>
              </Pressable>
            )}
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  headerBlock: {
    gap: 12,
  },
  headerCard: {
    backgroundColor: 'rgba(7,14,30,0.46)',
    borderColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  roomHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  collapseBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBlock: {
    flex: 1,
    gap: 4,
  },
  roomCodePanel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  roomCodeTextBlock: {
    flex: 1,
    gap: 2,
  },
  roomCodeLabel: {
    color: 'rgba(255,255,255,0.58)',
    fontSize: 10,
    fontWeight: Typography.bold,
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  roomCodeValue: {
    color: Colors.white,
    fontSize: 36,
    fontWeight: Typography.extrabold,
    letterSpacing: 0,
    lineHeight: 40,
  },
  roomCodeHint: {
    color: 'rgba(255,255,255,0.66)',
    fontSize: 11,
    lineHeight: 16,
  },
  roomCodeAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(21,101,192,0.92)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  roomCodeActionText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: Typography.bold,
  },
  peerStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  peerDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  badgeSoft: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeSoftText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    fontWeight: Typography.semibold,
  },
  badgeStrong: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,208,132,0.18)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeStrongText: {
    color: '#B8F7D4',
    fontSize: 11,
    fontWeight: Typography.semibold,
  },
  badgeGhost: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeGhostText: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 11,
    fontWeight: Typography.semibold,
  },
  roomStatusStrip: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  roomStatusText: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: Typography.medium,
  },
  title: {
    color: Colors.white,
    fontSize: 17,
    fontWeight: Typography.bold,
    lineHeight: 20,
  },
  meta: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 11,
  },
  controlsGrid: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  controlBtn: {
    flexBasis: '48%',
    minHeight: 44,
    backgroundColor: '#D6F6FF',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  controlText: {
    color: '#07242F',
    fontWeight: Typography.bold,
    fontSize: 12,
  },
  dangerBtn: {
    flexBasis: '100%',
    minHeight: 44,
    backgroundColor: '#FF7A7A',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  dangerText: {
    color: '#2A0404',
    fontWeight: Typography.bold,
    fontSize: 12,
  },
  busy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  error: {
    color: '#ffd0d0',
  },
  notice: {
    color: '#B8F7D4',
    fontSize: 12,
  },
  timelineFrame: {
    flex: 1,
    minHeight: 260,
    backgroundColor: 'rgba(7,14,30,0.42)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    overflow: 'hidden',
  },
  timelineFrameHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  viewModeToggle: {
    flexDirection: 'row',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    overflow: 'hidden',
  },
  viewModeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  viewModeBtnActive: {
    backgroundColor: 'rgba(66,201,255,0.24)',
  },
  viewModeText: {
    color: 'rgba(255,255,255,0.76)',
    fontSize: 11,
    fontWeight: Typography.semibold,
  },
  viewModeTextActive: {
    color: '#D6F6FF',
  },
  timelineListContent: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
  },
  timelineHint: {
    color: 'rgba(255,255,255,0.64)',
    fontSize: 11,
    lineHeight: 16,
  },
  subtitle: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: Typography.bold,
    marginBottom: 4,
  },
  empty: {
    color: 'rgba(255,255,255,0.7)',
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  compactRow: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  compactMeta: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 10,
  },
  compactText: {
    color: Colors.white,
    fontSize: 13,
    lineHeight: 18,
  },
  messageRow: {
    flexDirection: 'row',
    width: '100%',
  },
  messageRowMine: {
    justifyContent: 'flex-end',
  },
  messageRowOther: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    width: '88%',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    gap: 4,
  },
  messageBubbleMine: {
    backgroundColor: 'rgba(66,201,255,0.20)',
    borderColor: 'rgba(66,201,255,0.46)',
  },
  messageBubbleOther: {
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderColor: 'rgba(255,255,255,0.16)',
  },
  messageMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  messageSpeaker: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: Typography.bold,
  },
  messageMeta: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 10,
  },
  messageSource: {
    color: '#42C9FF',
    fontSize: 13,
    lineHeight: 18,
  },
  messageTranslated: {
    color: '#00D084',
    fontSize: 14,
    fontWeight: Typography.semibold,
    lineHeight: 19,
  },
  latestBtn: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(21,101,192,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  latestBtnText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: Typography.bold,
  },
});

