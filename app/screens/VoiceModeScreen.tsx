import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, ScrollView, Animated, Easing, ActivityIndicator, Alert } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useAuth } from '../../lib/context';
import { callGroq, GroqMessage } from '../../lib/ai';
import { buildStudentContext } from '../../lib/adaptiveEngine';
import { Audio } from 'expo-av';
import { Fonts } from '../../constants/fonts';
import { Radii } from '../../constants/colors';
import { AnimatedScreenWrapper } from '../../components/ui/premium';
import {
  transcribeAudio, synthesizeSpeech, playAudioBase64,
  stopCurrentAudio, getStoredLanguageCode, showVoiceError,
  SARVAM_LANG_TO_NAME,
} from '../../lib/sarvam';

export default function VoiceModeScreen() {
  const { colors, isDark } = useTheme();
  const { studentId } = useAuth();
  const [messages, setMessages] = useState<{role: string, content: string, lang?: string}[]>([]);
  const [loading, setLoading] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const [contextStr, setContextStr] = useState('');
  
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [playingIdx, setPlayingIdx] = useState<number | null>(null);
  const [ttsLoading, setTtsLoading] = useState<number | null>(null);

  useEffect(() => {
    if (studentId) {
      buildStudentContext(studentId).then(setContextStr);
    }
    
    // Request permissions on load
    (async () => {
      try {
        const { status } = await Audio.requestPermissionsAsync();
        if (status !== 'granted') {
          showVoiceError('Microphone permission is required for voice mode.');
          return;
        }
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });
      } catch (e) {
        console.log('Error requesting audio permissions', e);
      }
    })();
  }, [studentId]);

  const startRecording = async () => {
    try {
      if (recording) {
        await recording.stopAndUnloadAsync();
      }
      setIsRecording(true);
      
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording: newRec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(newRec);
    } catch (err) {
      console.error('Failed to start recording', err);
      setIsRecording(false);
      showVoiceError('Could not start recording. Check microphone permissions.');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    setIsRecording(false);
    setTranscribing(true);

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);

      if (!uri) {
        showVoiceError("Couldn't save recording. Please try again.");
        setTranscribing(false);
        return;
      }

      // Use Sarvam STT for transcription
      const result = await transcribeAudio(uri);
      
      if (!result.text.trim()) {
        showVoiceError("Couldn't hear anything. Please speak clearly and try again.");
        setTranscribing(false);
        return;
      }

      // Auto-send the transcribed text
      handleSend(result.text, result.language);
    } catch (err: any) {
      console.error('STT failed:', err);
      showVoiceError(err.message || "Couldn't transcribe audio. Please try again.");
    } finally {
      setTranscribing(false);
    }
  };

  const handleSendRef = useRef<((text: string, lang?: string) => Promise<void>) | null>(null);

  const handleSend = async (text: string, detectedLang?: string) => {
    if (!text.trim()) return;
    const userMsg = { role: 'user', content: text, lang: detectedLang };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const systemPrompt = `You are a warm, conversational AI tutor in Voice Mode. Respond in short, spoken-style sentences (max 2 sentences). Avoid markdown formatting like asterisks or bold text, as this is meant to be spoken aloud. ${contextStr}`;
      
      const apiMessages: GroqMessage[] = [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user', content: userMsg.content },
      ];

      const response = await callGroq(apiMessages, 'voice_mode');
      const aiMsg = { role: 'assistant', content: response, lang: detectedLang };
      setMessages(prev => [...prev, aiMsg]);

      // Auto-play TTS for AI response using Sarvam Bulbul v3
      try {
        const langCode = detectedLang || await getStoredLanguageCode();
        setTtsLoading(messages.length + 1); // index of the new AI message
        const audioBase64 = await synthesizeSpeech(response, langCode);
        if (audioBase64) {
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: false,
            playsInSilentModeIOS: true,
          });
          setPlayingIdx(messages.length + 1);
          const sound = await playAudioBase64(audioBase64);
          sound.setOnPlaybackStatusUpdate((status) => {
            if ('didJustFinish' in status && status.didJustFinish) {
              setPlayingIdx(null);
            }
          });
        }
      } catch (ttsErr) {
        console.warn('TTS failed, text still visible:', ttsErr);
        // Don't show error for TTS failure in voice mode — text is still visible
      } finally {
        setTtsLoading(null);
      }

    } catch (e) {
      console.error(e);
      setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, my connection dropped. Could you repeat that?" }]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  useEffect(() => {
    handleSendRef.current = handleSend;
  }, [handleSend]);

  const handlePlayTTS = async (text: string, index: number, lang?: string) => {
    if (playingIdx === index) {
      // Stop playback
      await stopCurrentAudio();
      setPlayingIdx(null);
      return;
    }

    try {
      setTtsLoading(index);
      const langCode = lang || await getStoredLanguageCode();
      const audioBase64 = await synthesizeSpeech(text, langCode);
      if (audioBase64) {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
        });
        setPlayingIdx(index);
        const sound = await playAudioBase64(audioBase64);
        sound.setOnPlaybackStatusUpdate((status) => {
          if ('didJustFinish' in status && status.didJustFinish) {
            setPlayingIdx(null);
          }
        });
      }
    } catch (err: any) {
      showVoiceError('Voice unavailable — here\'s the text response.');
    } finally {
      setTtsLoading(null);
    }
  };

  // Animations
  const micPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isRecording) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(micPulse, { toValue: 1.15, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(micPulse, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      micPulse.setValue(1);
    }
  }, [isRecording]);

  return (
    <AnimatedScreenWrapper style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => router.back()}
          style={[styles.backBtn, { borderColor: colors.borderSubtle, backgroundColor: colors.surface1 }]}
        >
          <Ionicons name="chevron-down" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary, fontFamily: Fonts.display }]}>
          Voice AI Companion
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView 
        ref={scrollViewRef} 
        contentContainerStyle={styles.chatArea}
        showsVerticalScrollIndicator={false}
      >
        {messages.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={[styles.glowRing, { borderColor: colors.accentBorder, backgroundColor: colors.accentMuted }]}>
              <Ionicons name="mic-outline" size={48} color={colors.accent} />
            </View>
            <Text style={[styles.emptyText, { color: colors.textSecondary, fontFamily: Fonts.bodyMedium }]}>
              Tap the microphone and start speaking. I'm listening!
            </Text>
            <Text style={[styles.emptySubText, { color: colors.textTertiary, fontFamily: Fonts.body }]}>
              Powered by Sarvam AI • Hindi + English supported
            </Text>
          </View>
        ) : (
          messages.map((m, i) => {
            const isUser = m.role === 'user';
            return (
              <View key={i} style={styles.msgRow}>
                <View 
                  style={[
                    styles.msgBubble, 
                    isUser 
                      ? [styles.userBubble, { backgroundColor: colors.accent }] 
                      : [styles.aiBubble, { backgroundColor: colors.surface2, borderColor: colors.borderSubtle }]
                  ]}
                >
                  <Text 
                    style={{ 
                      color: isUser ? colors.textInverse : colors.textPrimary, 
                      fontFamily: Fonts.body,
                      fontSize: 15, 
                      lineHeight: 22 
                    }}
                  >
                    {m.content}
                  </Text>
                </View>
                {/* Speaker icon for AI messages */}
                {!isUser && (
                  <TouchableOpacity
                    style={[styles.speakerBtn, { backgroundColor: colors.surface3 }]}
                    onPress={() => handlePlayTTS(m.content, i, m.lang)}
                    disabled={ttsLoading === i}
                  >
                    {ttsLoading === i ? (
                      <ActivityIndicator size={14} color={colors.accent} />
                    ) : (
                      <Ionicons
                        name={playingIdx === i ? 'stop' : 'volume-medium'}
                        size={16}
                        color={playingIdx === i ? colors.danger : colors.accent}
                      />
                    )}
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        )}
        {transcribing && (
          <View style={styles.statusRow}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={[styles.statusText, { color: colors.accent, fontFamily: Fonts.bodyMedium }]}>
              Transcribing with Sarvam AI...
            </Text>
          </View>
        )}
        {loading && (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={[styles.statusText, { color: colors.textTertiary, fontFamily: Fonts.body, marginLeft: 8 }]}>
              AI is thinking...
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={[styles.inputArea, { borderTopColor: colors.borderSubtle, backgroundColor: colors.surface1 }]}>
        <Animated.View style={{ transform: [{ scale: micPulse }] }}>
          <TouchableOpacity 
            style={[styles.micBtn, { backgroundColor: isRecording ? colors.danger : colors.accent }]}
            onPress={isRecording ? stopRecording : startRecording}
            disabled={loading || transcribing}
          >
            {isRecording ? (
              <View style={styles.recordingDot} />
            ) : (
               <Ionicons name="mic" size={28} color={colors.textInverse} />
            )}
          </TouchableOpacity>
        </Animated.View>
        <Text style={{ color: isRecording ? colors.danger : colors.textSecondary, fontFamily: Fonts.bodyMedium, fontSize: 13, letterSpacing: 0.3 }}>
          {transcribing ? 'Transcribing...' : isRecording ? "Recording... tap to stop" : "Tap to speak"}
        </Text>
      </View>
    </AnimatedScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: Platform.OS === 'ios' ? 50 : 30 },
  header: { 
    paddingHorizontal: 20, 
    paddingVertical: 12, 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center' 
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 18 },
  chatArea: { padding: 20, paddingBottom: 40 },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 60 },
  glowRing: { 
    width: 110, 
    height: 110, 
    borderRadius: 55, 
    borderWidth: StyleSheet.hairlineWidth, 
    alignItems: 'center', 
    justifyContent: 'center', 
    marginBottom: 20 
  },
  emptyText: { textAlign: 'center', fontSize: 14, maxWidth: 240, lineHeight: 20 },
  emptySubText: { textAlign: 'center', fontSize: 11, maxWidth: 200, lineHeight: 16, marginTop: 8, opacity: 0.7 },
  msgRow: {
    marginBottom: 12,
  },
  msgBubble: { 
    maxWidth: '85%', 
    padding: 14, 
    borderRadius: Radii.card, 
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  userBubble: { alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  aiBubble: { alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  speakerBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginVertical: 10,
  },
  statusText: { marginVertical: 10, alignSelf: 'center', fontSize: 13 },
  loaderContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginVertical: 10 },
  inputArea: { 
    padding: 24, 
    paddingBottom: Platform.OS === 'ios' ? 44 : 24, 
    borderTopWidth: StyleSheet.hairlineWidth, 
    alignItems: 'center', 
    gap: 12, 
    borderTopLeftRadius: Radii.bottomSheet, 
    borderTopRightRadius: Radii.bottomSheet 
  },
  micBtn: { 
    width: 64, 
    height: 64, 
    borderRadius: 32, 
    alignItems: 'center', 
    justifyContent: 'center',
  },
  recordingDot: { width: 16, height: 16, borderRadius: 3, backgroundColor: 'white' }
});
