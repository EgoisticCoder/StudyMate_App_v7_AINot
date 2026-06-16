import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Image, Alert, Platform, Animated, Easing
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Audio } from 'expo-av';
import { useTheme, useAuth } from '../../lib/context';
import { callGroqVision, callGroq } from '../../lib/ai';
import { transcribeAudio } from '../../lib/sarvam';
import { saveNote } from '../../lib/notesDB';
import { writeQuery } from '../../lib/neo4j';
import { SUBJECTS } from '../../constants/subjects';
import { getChaptersForSubject } from '../../constants/chapters';
import { Fonts } from '../../constants/fonts';
import { Radii, Spacing } from '../../constants/colors';
import { Chip, PrimaryButton, AnimatedScreenWrapper, SectionLabel } from '../../components/ui/premium';
import { v4 as uuidv4 } from 'uuid';

export default function NotesUploadScreen() {
  const { colors, isDark } = useTheme();
  const { studentId } = useAuth();
  
  const [step, setStep] = useState(1);
  const [subject, setSubject] = useState('');
  const [chapter, setChapter] = useState('');
  const [chapters, setChapters] = useState<string[]>([]);
  
  const [image, setImage] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [transcription, setTranscription] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');

  // Voice recording states for voice-assisted edits
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceProcessing, setVoiceProcessing] = useState(false);

  useEffect(() => {
    if (subject) {
      // Fetch chapters - defaults to ICSE / class 10 if profile can't be fetched
      setChapters(getChaptersForSubject(subject, 'ICSE', 10));
    }
  }, [subject]);

  const handlePickImage = async (useCamera = false) => {
    try {
      let result;
      if (useCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Denied', 'Camera permission is required to take notes photos.');
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.8,
        });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.8,
        });
      }

      if (!result.canceled && result.assets[0]) {
        setLoading(true);
        setLoadingText('Compressing image...');
        // Resize and compress
        const manipResult = await ImageManipulator.manipulateAsync(
          result.assets[0].uri,
          [{ resize: { width: 1024 } }],
          { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        setImage(manipResult.uri);
        setImageBase64(manipResult.base64 || null);
      }
    } catch (e) {
      console.error('Image picking failed', e);
      Alert.alert('Error', 'Failed to load image.');
    } finally {
      setLoading(false);
      setLoadingText('');
    }
  };

  const handleRunOCR = async () => {
    if (!imageBase64) return;
    setLoading(true);
    setLoadingText('AI Transcribing Notes...');
    try {
      const prompt = `You are a high-fidelity handwritten study notes transcriber.
Transcribe everything in the notes accurately, preserving equations, bullet points, headers, definitions, and text structure.
Output ONLY the clean text markdown of the transcribed notes. Do not include introductory text, conversational greetings, explanations, or code blocks. Just the transcribed text itself.`;
      
      const response = await callGroqVision(
        'You are an expert handwritten notes transcriber.',
        imageBase64,
        prompt,
        'notes_generator'
      );
      setTranscription(response);
      setStep(3);
    } catch (err: any) {
      console.error('OCR failed', err);
      Alert.alert('OCR Failed', err.message || 'Could not transcribe image. Please edit manually.');
      setTranscription('');
      setStep(3); // Go to edit step anyway so they can type it
    } finally {
      setLoading(false);
      setLoadingText('');
    }
  };

  // Voice Command recording logic
  const startRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Permission Denied', 'Microphone permissions are required for voice editing.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(recording);
      setIsRecording(true);
    } catch (err) {
      console.error('Failed to start recording', err);
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    setIsRecording(false);
    setVoiceProcessing(true);
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);

      if (uri) {
        // Transcribe voice command via Sarvam
        const stt = await transcribeAudio(uri);
        const command = stt.text;

        if (command && command.trim().length > 1) {
          Alert.alert('Voice Command Detected', `"${command}"\nApplying correction via AI...`);
          
          // Apply voice command to transcription using LLM
          const sysPrompt = 'You are a notes correction helper. You take original notes and apply a user\'s edit instruction/voice correction to them.';
          const prompt = `Apply the following voice correction command to the notes transcription.
Original Notes:
"""
${transcription}
"""

Voice Correction Command:
"${command}"

Return ONLY the corrected, revised notes transcription text. Do not output any chat wrapper, conversational text, explanations, or code blocks.`;

          const correctedNotes = await callGroq(
            [
              { role: 'system', content: sysPrompt },
              { role: 'user', content: prompt }
            ],
            'notes_generator'
          );

          if (correctedNotes && correctedNotes.trim().length > 0) {
            setTranscription(correctedNotes);
          }
        }
      }
    } catch (err: any) {
      console.error('Voice command correction failed', err);
      Alert.alert('Correction Failed', err.message || 'Could not process voice command.');
    } finally {
      setVoiceProcessing(false);
    }
  };

  const handleSaveNote = async () => {
    if (!transcription.trim() || !studentId) return;
    setLoading(true);
    setLoadingText('Saving note...');
    
    const noteId = uuidv4();
    try {
      // 1. Save to Offline FileSystem JSON Database
      const saved = await saveNote({
        id: noteId,
        subject,
        chapter,
        image_uri: image || undefined,
        transcription: transcription.trim(),
      });

      // 2. Try to sync to Neo4j right now (online sync)
      try {
        await writeQuery(
          `MATCH (s:Student {id: $studentId})
           CREATE (n:StudyNote {
             id: $id, subject: $subject, chapter: $chapter,
             transcription: $transcription, image_uri: $imageUri,
             created_at: datetime(), updated_at: datetime()
           })
           CREATE (s)-[:OWNS_NOTE]->(n)`,
          {
            studentId,
            id: noteId,
            subject,
            chapter,
            transcription: transcription.trim(),
            imageUri: saved.image_uri || '',
          }
        );
        // Mark as synced in offline DB
        const notesDB = require('../../lib/notesDB');
        await notesDB.updateNote(noteId, { synced: true });
      } catch (neoErr) {
        console.warn('Could not sync to Neo4j. Note kept offline-only.', neoErr);
      }

      Alert.alert('Note Saved', 'Your study notes have been saved successfully!');
      router.back();
    } catch (e: any) {
      console.error('Failed to save note', e);
      Alert.alert('Error', 'Failed to save study notes locally.');
    } finally {
      setLoading(false);
      setLoadingText('');
    }
  };

  // Step transitions
  const stepFade = useRef(new Animated.Value(1)).current;
  const stepSlide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    stepFade.setValue(0);
    stepSlide.setValue(12);
    Animated.parallel([
      Animated.timing(stepFade, { toValue: 1, duration: 250, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(stepSlide, { toValue: 0, duration: 250, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [step]);

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <View style={{ flex: 1 }}>
            <SectionLabel text="SELECT SUBJECT & CHAPTER" style={{ marginBottom: 12 }} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16, maxHeight: 44 }}>
              <View style={{ flexDirection: 'row', gap: 8, paddingBottom: 4 }}>
                {SUBJECTS.map(s => (
                  <Chip
                    key={s.name}
                    label={s.name}
                    selected={subject === s.name}
                    onPress={() => {
                      setSubject(s.name);
                      setChapter('');
                    }}
                  />
                ))}
              </View>
            </ScrollView>
            {subject && (
              <View style={[styles.chapterList, { borderColor: colors.borderSubtle, backgroundColor: colors.surface1 }]}>
                <ScrollView nestedScrollEnabled style={{ maxHeight: 250 }}>
                  {chapters.map((ch, chIdx) => (
                    <TouchableOpacity 
                      key={ch} 
                      onPress={() => { setChapter(ch); setStep(2); }}
                      style={[
                        styles.chapterRow, 
                        { 
                          borderBottomColor: colors.borderSubtle,
                          borderBottomWidth: chIdx === chapters.length - 1 ? 0 : StyleSheet.hairlineWidth,
                          backgroundColor: chapter === ch ? colors.accentMuted : 'transparent',
                        }
                      ]}
                    >
                      <Text style={{ 
                        color: chapter === ch ? colors.accentHover : colors.textPrimary, 
                        fontSize: 14,
                        fontFamily: chapter === ch ? Fonts.bodyMedium : Fonts.body,
                      }}>
                        {ch}
                      </Text>
                      <Ionicons 
                        name={chapter === ch ? 'checkmark-circle' : 'chevron-forward'} 
                        size={16} 
                        color={chapter === ch ? colors.accent : colors.textTertiary} 
                      />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
        );
      case 2:
        return (
          <View style={{ flex: 1 }}>
            <SectionLabel text="UPLOAD NOTES IMAGE" style={{ marginBottom: 12 }} />
            {image ? (
              <View style={[styles.imageContainer, { borderColor: colors.borderSubtle, backgroundColor: colors.surface1 }]}>
                <Image source={{ uri: image }} style={styles.noteImage} resizeMode="contain" />
                <TouchableOpacity 
                  onPress={() => { setImage(null); setImageBase64(null); }}
                  style={[styles.removeImg, { backgroundColor: colors.danger }]}
                >
                  <Ionicons name="close" size={14} color="#FFF" />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                <TouchableOpacity 
                  style={[styles.pickArea, { borderColor: colors.borderMedium, backgroundColor: colors.surface1 }]} 
                  onPress={() => handlePickImage(false)}
                >
                  <Ionicons name="images-outline" size={40} color={colors.textSecondary} />
                  <Text style={[{ color: colors.textSecondary, fontFamily: Fonts.bodyMedium, marginTop: 12 }]}>
                    Upload from Gallery
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[styles.pickArea, { borderColor: colors.borderMedium, backgroundColor: colors.surface1 }]} 
                  onPress={() => handlePickImage(true)}
                >
                  <Ionicons name="camera-outline" size={40} color={colors.textSecondary} />
                  <Text style={[{ color: colors.textSecondary, fontFamily: Fonts.bodyMedium, marginTop: 12 }]}>
                    Take Photo with Camera
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.skipBtn, { borderColor: colors.borderSubtle }]}
                  onPress={() => {
                    setTranscription('');
                    setStep(3);
                  }}
                >
                  <Text style={{ color: colors.textSecondary, fontFamily: Fonts.bodyMedium }}>
                    Skip Image & Type Notes Directly
                  </Text>
                </TouchableOpacity>
              </View>
            )}
            
            {image && (
              <View style={{ marginTop: 24, gap: 12 }}>
                <PrimaryButton
                  label={loading ? 'Processing...' : 'Run OCR Transcription'}
                  disabled={loading}
                  icon={
                    loading ? (
                      <ActivityIndicator size="small" color={colors.textTertiary} />
                    ) : (
                      <Ionicons name="sparkles" size={16} color={colors.textInverse} />
                    )
                  }
                  onPress={handleRunOCR}
                />
                <TouchableOpacity
                  style={[styles.skipBtn, { borderColor: colors.borderSubtle, height: 52, borderRadius: Radii.button }]}
                  onPress={() => {
                    setTranscription('');
                    setStep(3);
                  }}
                >
                  <Text style={{ color: colors.textSecondary, fontFamily: Fonts.bodyMedium }}>
                    Skip OCR, Edit Directly
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        );
      case 3:
        return (
          <View style={{ flex: 1 }}>
            <SectionLabel text="VERIFY & EDIT TRANSCRIPTION" style={{ marginBottom: 12 }} />
            
            <View style={{ position: 'relative', marginBottom: 16 }}>
              <TextInput
                style={[
                  styles.transcriptionInput, 
                  { 
                    color: colors.textPrimary, 
                    borderColor: colors.borderSubtle, 
                    backgroundColor: colors.surface1,
                    fontFamily: Fonts.body,
                  }
                ]}
                placeholder="Transcribing notes text here..."
                placeholderTextColor={colors.textTertiary}
                value={transcription}
                onChangeText={setTranscription}
                multiline
              />
              
              {voiceProcessing && (
                <View style={[styles.inputOverlay, { backgroundColor: 'rgba(9,9,12,0.8)' }]}>
                  <ActivityIndicator size="large" color={colors.accent} />
                  <Text style={{ color: colors.textPrimary, fontFamily: Fonts.bodyMedium, marginTop: 8 }}>
                    Applying Voice Correction...
                  </Text>
                </View>
              )}
            </View>

            {/* Voice Command Button */}
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <TouchableOpacity
                onPressIn={startRecording}
                onPressOut={stopRecording}
                style={[
                  styles.voiceBtn,
                  {
                    backgroundColor: isRecording ? colors.danger : colors.accentMuted,
                    borderColor: isRecording ? colors.danger : colors.accentBorder,
                  }
                ]}
              >
                <Ionicons 
                  name={isRecording ? 'mic' : 'mic-outline'} 
                  size={24} 
                  color={isRecording ? '#FFF' : colors.accent} 
                />
              </TouchableOpacity>
              <Text style={{ color: colors.textSecondary, fontSize: 12, fontFamily: Fonts.body, marginTop: 6, textAlign: 'center' }}>
                {isRecording 
                  ? 'Release to Apply Voice Correction' 
                  : 'Hold & Speak to correct transcription (e.g. "Fix spelling of gravity")'}
              </Text>
            </View>

            <PrimaryButton
              label="Save Study Note"
              disabled={!transcription.trim() || loading}
              onPress={handleSaveNote}
            />
          </View>
        );
      default: return null;
    }
  };

  return (
    <AnimatedScreenWrapper style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.headerArea}>
        <TouchableOpacity 
          onPress={() => {
            if (step > 1) setStep(step - 1);
            else router.back();
          }} 
          style={[styles.backBtn, { borderColor: colors.borderSubtle, backgroundColor: colors.surface1 }]}
        >
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary, fontFamily: Fonts.display }]}>
          Upload Notes
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.content}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={[styles.loadingText, { color: colors.textSecondary, fontFamily: Fonts.bodyMedium }]}>
              {loadingText}
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.stepRow}>
              {[1, 2, 3].map(s => (
                <View 
                  key={s} 
                  style={[
                    styles.stepDot, 
                    {
                      backgroundColor: s <= step ? colors.accent : colors.borderSubtle,
                      flex: s === step ? 2 : 1,
                    }
                  ]} 
                />
              ))}
            </View>
            <Animated.View style={{ opacity: stepFade, transform: [{ translateY: stepSlide }], flex: 1 }}>
              {renderStep()}
            </Animated.View>
          </>
        )}
      </View>
    </AnimatedScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: Platform.OS === 'ios' ? 60 : 40 },
  headerArea: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingHorizontal: 20, 
    marginBottom: 20 
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 20, letterSpacing: -0.4 },
  content: { flex: 1, paddingHorizontal: 20, paddingBottom: 40 },
  stepRow: { flexDirection: 'row', gap: 6, marginBottom: 24 },
  stepDot: { height: 3, borderRadius: 1.5 },
  chapterList: { 
    borderWidth: StyleSheet.hairlineWidth, 
    borderRadius: Radii.card, 
    overflow: 'hidden' 
  },
  chapterRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    padding: 14, 
    borderBottomWidth: StyleSheet.hairlineWidth 
  },
  pickArea: { 
    borderWidth: 1, 
    borderStyle: 'dashed', 
    borderRadius: Radii.card, 
    padding: 32, 
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageContainer: { 
    borderRadius: Radii.card, 
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden', 
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteImage: { width: '100%', height: 300 },
  removeImg: { 
    position: 'absolute', 
    top: 10, 
    right: 10, 
    width: 28, 
    height: 28, 
    borderRadius: 14, 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  transcriptionInput: { 
    borderWidth: StyleSheet.hairlineWidth, 
    borderRadius: Radii.card, 
    padding: 16, 
    minHeight: 220, 
    fontSize: 15, 
    textAlignVertical: 'top',
  },
  inputOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: Radii.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  skipBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    height: 48,
    borderRadius: Radii.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 15,
  },
});
